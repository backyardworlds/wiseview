import pickle
from StringIO import StringIO
from tempfile import NamedTemporaryFile

import csv
import tarfile
import urllib
import subprocess
import json

from flask import Flask
from flask import make_response
from flask import render_template
from flask import send_file
from flask import jsonify
from flask_restful import Api
from flask_restful import Resource
from flask_restful import reqparse
from flask_restful import inputs

import requests

# Image processing
import numpy as np
import astropy.io.fits as aif
import skimage.exposure as skie
import skimage.util.dtype as skid
from PIL import Image,ImageOps
import astropy.visualization as av
import matplotlib.pyplot as plt

import wv.common.xref as xref
import wv.common.image_parsing as imp
import wv.common.comover as comover
import wv.common.unwise_tiles as unwtiles
import wv.common.unwise_cutout as unwcutout

try:
    import uwsgi
except ImportError:
    # Dan doesn't really know why UWSGI starts twice, but he's hoping that the first ime
    # is just.... i dunno... loading a master or something?
    # Then the rest does the real work?
    pass


app = Flask(__name__)
api = Api(app)
app.config['PROPAGATE_EXCEPTIONS'] = True

PATH = "http://unwise.me/cutout_fits?file_img_m=on&version={version}&ra={ra}&dec={dec}&size={size}&bands={band}"


# input fits img data, receive png data
def convert_img(file_data,color,mode,linear,trimbright):
    img = file_data
    sim = imp.complex(img,mode,linear,trimbright)
    #sim = skie.rescale_intensity(img,out_range=(0,1))
    opt_img = skid.img_as_ubyte(sim)
    sio = StringIO()
    
    im = ImageOps.invert(Image.fromarray(opt_img)).transpose(Image.FLIP_TOP_BOTTOM)

    if color is not None:
        plt.imsave(sio,im,format="png",cmap=color)
    else:
        im.save(sio,format="png")

    return sio.getvalue()


def merge_imgs(file_datas, suffix=".png"):
    temp_files = []
    for file_data in file_datas:
        inf = NamedTemporaryFile(suffix=suffix)
        inf.write(file_data)
        inf.seek(0)  
        temp_files.append(inf)

    joined_names = " ".join(map(lambda f: f.name, temp_files))
    command = "convert -background black {imgs} +append png:-".format(imgs=joined_names)
    return subprocess.check_output(command, shell=True)


def project_im(im,px,py):
    # https://stackoverflow.com/questions/9886303/adding-different-sized-shaped-displaced-numpy-matrices
    res = np.zeros([im.shape[1],im.shape[0]])
    y_range1 = slice(max(0, py), max(min(py + im.shape[0], res.shape[0]), 0))
    x_range1 = slice(max(0, px), max(min(px + im.shape[1], res.shape[1]), 0))

    y_range2 = slice(max(0, -py), min(-py + res.shape[0], im.shape[0]))
    x_range2 = slice(max(0, -px), min(-px + res.shape[1], im.shape[1]))

    res[y_range1, x_range1] += im[y_range2, x_range2]

    return res


def find_tar_fits(tar_data):
    targz = tarfile.open(fileobj=StringIO(tar_data), mode="r:gz")
    fits_files = []
    for member in targz.getmembers():
        if member.name.endswith(".fits"):
            cutout = targz.extractfile(member)
            fits_files.append(cutout)  
    return fits_files


def add_arrs(arrs):
    ims,cms = [],[]
    for im,cm in arrs:
        ims.append(im)
        # Set to 0 if <= 2
        cm[cm <= 2] = 0
        cms.append(cm)

    return np.ma.average(ims,weights=cms,axis=0)


def request_unwise_cutouts(ra, dec, size, band, version):
    """Fetch unWISE cutouts"""
    url = PATH.format(ra=ra, dec=dec, size=size, band=band, version=version)
    try:
        response = requests.get(url)
    except Exception as e:
        raise
        #return "Error: {0}".format(str(e)), 500
        
    if response.status_code != 200:
        print url
        print response.text
        raise Exception("Invalid response")
    
    cutouts = [aif.getdata(StringIO(c.read())) for c in find_tar_fits(response.content)]
    
    if not cutouts:
        raise Exception("No fits files found")
    return cutouts


def get_unwise_cutout(ra,dec,size,band,version,mode,color,linear,trimbright):
    """Fetch unWISE cutoutts, then apply colors/gain/etc"""
    try:
        cutouts = request_unwise_cutouts(ra, dec, size, band, version)
    except Exception as e:
        print e
        return "Error: {0}".format(str(e)), 500

    converted = []
    for offset, cutout in enumerate(cutouts):
        pad = offset != (len(cutouts) - 1)
        converted.append(convert_img(cutout, color, mode, linear,
                                     trimbright))

    image = merge_imgs(converted)

    return StringIO(image), 200


def get_unwise_composite(ra,dec,size,band,version,mode,color,linear,trimbright):
    images = {1:[],2:[]}
    for band in images:
        try:
            cutouts = request_unwise_cutouts(ra,dec,size,band,version)
        except Exception as e:
            raise
            return "Error: {0}".format(str(e)), 500

        converted = []
        for offset, cutout in enumerate(cutouts):
            #pad = offset != len(cutouts)
            #im = convert_img(cutout.read(), None, linear,
            #                 trimbright, right_pad=pad)
            #converted.append(im)
            # Convert from fits
            #im = aif.getdata(StringIO(cutout.read()))
            im = cutout
            images[band].append(im)

    if len(images[1]) != len(images[2]):
        return "Got imbalanced number of cutouts for W1 and W2", 500

    # Pair W1 and W2 cutouts
    images = [(images[1][i],images[2][i]) for i in xrange(len(images[1]))]

    rgb_images = []
    for w1,w2 in images:
        # Normalize to w1
        w2 = w2 + (np.median(w1) - np.median(w2))
        #w12 = (w1+w2)/2.
        # Complex scales to 0,1, works w/ uint
        w1 = imp.complex(w1,mode,linear,trimbright)
        w2 = imp.complex(w2,mode,linear,trimbright)
        #w12 = imp.complex(w12,mode,linear,trimbright)
        # Invert
        w1 = 1-w1
        w2 = 1-w2
        #w12 = 1-w12
        # Scale to 0,255
        w1 = skid.img_as_ubyte(w1)
        w2 = skid.img_as_ubyte(w2)
        #w12 = skid.img_as_ubyte(w12)
        # merge images
        sio = StringIO()
        arr = np.zeros((w1.shape[0],w1.shape[1],3),"uint8")
        arr[..., 0] = w1
        arr[..., 1] = np.mean([w1,w2],axis=0)
        arr[..., 2] = w2
        #im = ImageOps.invert(Image.fromarray(arr)).transpose(Image.FLIP_TOP_BOTTOM)
        im = Image.fromarray(arr).transpose(Image.FLIP_TOP_BOTTOM)
        im.save(sio,format="png")
        rgb_images.append(sio.getvalue())

    # Merge images
    return StringIO(merge_imgs(rgb_images)), 200


def request_tspot_cutout(ra,dec,size,band,epoch,tile):
    """Fetch cutouts from S3"""
    # Memoize cutouts
    key = "%d|%f|%f|%d|%d|True|True"%(epoch,ra,dec,band,size)
    cache_im = uwsgi.cache_get("IM"+key)
    if cache_im is None:
        cutout = unwcutout.get_by_tile_epoch(tile,epoch,
                                             ra,dec,
                                             band,size=size,
                                             fits=True,covmap=True)
        uwsgi.cache_set("IM"+key,pickle.dumps(cutout[0],protocol=0))
        uwsgi.cache_set("CM"+key,pickle.dumps(cutout[1],protocol=0))
    else:
        cache_im = pickle.loads(cache_im)
        cache_cm = pickle.loads(uwsgi.cache_get("CM"+key))
        cutout = (cache_im,cache_cm)
    return cutout


def _build_cutout(ra,dec,size,band,epochs,px,py,tile):
    ims = []
    cms = []
    projecting = False
    for i in xrange(len(epochs)):
        e_ = epochs[i]
        
        if px is not None and i < len(px):
            px_ = px[i]
            if px != 0: projecting = True
        else: px_ = 0
        
        if py is not None and i < len(py):
            py_ = py[i]
            if py != 0: projecting = True
        else: py_ = 0
        im,cm = request_tspot_cutout(ra,dec,size,band,e_,tile)

        # TODO: difference imaging
        # issue is the subselection of ims to create background
        # needs too much data to really pass in a GET
        if projecting:
            im = project_im(im,px_,py_)
            cm = project_im(cm,px_,py_)
        
        ims.append(im)
        cms.append(cm)

    return np.ma.average(ims,weights=cms,axis=0)


def get_cutout(ra,dec,size,band,epochs,px,py,
               tile,mode,color,linear,trimbright):
    cutout = _build_cutout(ra,dec,size,band,epochs,px,py,tile)
    return StringIO(convert_img(cutout,color,mode,linear,
                                     trimbright)), 200


def get_composite(ra,dec,size,epochs,px,py,tile,mode,color,linear,trimbright):
    """Fetch w1 and w2 images from tspot and build a w1+w2 composite"""
    w1 = _build_cutout(ra,dec,size,1,epochs,px,py,tile)
    w2 = _build_cutout(ra,dec,size,2,epochs,px,py,tile)

    # Normalize to w1
    w2 = w2 + (np.median(w1) - np.median(w2))
    #w12 = (w1+w2)/2.
    # Complex scales to 0,1, works w/ uint
    w1 = imp.complex(w1,mode,linear,trimbright)
    w2 = imp.complex(w2,mode,linear,trimbright)
    #w12 = imp.complex(w12,mode,linear,trimbright)
    # Invert
    w1 = 1-w1
    w2 = 1-w2
    #w12 = 1-w12
    # Scale to 0,255
    w1 = skid.img_as_ubyte(w1)
    w2 = skid.img_as_ubyte(w2)
    #w12 = skid.img_as_ubyte(w12)
    # merge images
    sio = StringIO()
    arr = np.zeros((w1.shape[0],w1.shape[1],3),"uint8")
    arr[..., 0] = w1
    arr[..., 1] = np.mean([w1,w2],axis=0)
    arr[..., 2] = w2
    #im = ImageOps.invert(Image.fromarray(arr)).transpose(Image.FLIP_TOP_BOTTOM)
    im = Image.fromarray(arr).transpose(Image.FLIP_TOP_BOTTOM)
    im.save(sio,format="png")
    sio.seek(0)

    # Merge images
    return sio, 200


class Convert(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        parser.add_argument("size", type=int, default=100)
        parser.add_argument("band", type=int, default=3, choices=[1,2,3])
        parser.add_argument("version", type=str)
        parser.add_argument("epochs", type=int, action="append")
        parser.add_argument("px", type=int, action="append")
        parser.add_argument("py", type=int, action="append")
        parser.add_argument("tile", type=str)
        parser.add_argument("mode", type=str, default="adapt",
                            choices=["adapt","percent","fixed"])
        parser.add_argument("color", type=str, default="Greys",
                            choices=["viridis","plasma","inferno","magma","Greys","Purples","Blues","Greens","Oranges","Reds","YlOrBr","YlOrRd","OrRd","PuRd","RdPu","BuPu","GnBu","PuBu","YlGnBu","PuBuGn","BuGn","YlGn","binary","gist_yarg","gist_gray","gray","bone","pink","spring","summer","autumn","winter","cool","Wistia","hot","afmhot","gist_heat","copper","PiYG","PRGn","BrBG","PuOr","RdGy","RdBu","RdYlBu","RdYlGn","Spectral","coolwarm","bwr","seismic","Pastel1","Pastel2","Paired","Accent","Dark2","Set1","Set2","Set3","tab10","tab20","tab20b","tab20c","flag","prism","ocean","gist_earth","terrain","gist_stern","gnuplot","gnuplot2","CMRmap","cubehelix","brg","hsv","gist_rainbow","rainbow","jet","nipy_spectral","gist_ncar"])
        parser.add_argument("linear",type=float,default=0.2)
        parser.add_argument("trimbright",type=float,default=99.2)
        args = parser.parse_args()

        if args.linear <= 0.0: args.linear = 0.0000000001
        elif args.linear > 1.0: args.linear = 1.0

        if args.trimbright <= 0.0: args.trimbright = 0.0000000001
        elif args.mode == "percent" and args.trimbright > 100.0: args.trimbright = 100.0

        if args.version is None:
            if args.band in (1,2):
                cutout, status = get_cutout(args.ra,args.dec,args.size,args.band,
                                            args.epochs,args.px,args.py,
                                            args.tile,
                                            args.mode,args.color,args.linear,
                                            args.trimbright)
            elif args.band == 3:
                cutout, status = get_composite(args.ra,args.dec,args.size,
                                               args.epochs,args.px,args.py,
                                               args.tile,
                                               args.mode,args.color,args.linear,
                                               args.trimbright)
        else:
            if args.band in (1,2):
                cutout, status = get_unwise_cutout(args.ra,args.dec,args.size,
                                                   args.band,args.version,
                                                   args.mode,args.color,
                                                   args.linear,args.trimbright)
            elif args.band == 3:
                cutout, status = get_unwise_composite(args.ra,args.dec,args.size,
                                                      args.band,args.version,
                                                      args.mode,args.color,
                                                      args.linear,args.trimbright)                
        
        if status != 200:
            return "Request failed", 500

        return send_file(cutout, mimetype="image/png")


api.add_resource(Convert, "/convert")


class Pawnstars_Composite(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        parser.add_argument("size", type=int, required=True)
        args = parser.parse_args()

        response = requests.get("http://ps1images.stsci.edu/cgi-bin/ps1filenames.py", params={
            "RA": args.ra,
            "DEC": args.dec,
            "filters": "giy",
            "sep": "comma"
        })

        files = {}
        reader = csv.DictReader(StringIO(response.content))
        for row in reader:
            files[row["filter"]] = row["filename"]

        url = "http://ps1images.stsci.edu/cgi-bin/fitscut.cgi?" + urllib.urlencode({
            "red": files["y"],
            "green": files["i"],
            "blue": files["g"],
            "x": args.ra,
            "y": args.dec,
            "size": args.size,
            "wcs": 1,
            "asinh": True,
            "autoscale": 98.00,
            "output_size": 256
        })
        return url


api.add_resource(Pawnstars_Composite, "/pawnstars")



class Search_Page(Resource):
    def get(self):
        return make_response(render_template("flash.html"))


api.add_resource(Search_Page, "/wiseview")



class Xref_Page(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        args = parser.parse_args()

        subs = xref.get_subjects_by_coordinates(args.ra,args.dec)
        return jsonify({"ids":[str(s[0]) for s in subs]})


api.add_resource(Xref_Page, "/xref")



class Comover_Page(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("e_ra", type=float, required=False)
        parser.add_argument("dec", type=float, required=True)
        parser.add_argument("e_dec", type=float, required=False)
        parser.add_argument("pmRA", type=float, required=True)
        parser.add_argument("e_pmRA", type=float, required=False)
        parser.add_argument("pmDE", type=float, required=True)
        parser.add_argument("e_pmDE", type=float, required=False)
        parser.add_argument("radius", type=float, required=False,
                            default=0.2)
        args = parser.parse_args()
        if args.radius > 0.4:
            return "Max radius is 0.4 degrees",500
        
        entries = comover.get_entries(args.ra,args.dec,args.pmRA,args.pmDE,
                                      radius=args.radius,
                                      e_ra=args.e_ra,
                                      e_dec=args.e_dec,
                                      e_pmRA=args.e_pmRA,
                                      e_pmDE=args.e_pmDE)

        return jsonify(entries)


api.add_resource(Comover_Page, "/comover")



class Tiles_Page(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        args = parser.parse_args()

        res = {"tiles":[]}

        for coadd_id,coadds in unwtiles.get_tiles(args.ra,args.dec).groupby(level=[0]):
            res["tiles"].append({"coadd_id":str(coadd_id),
                                 "epochs":[{"band":int(coadd.name[2]),
                                            "epoch":int(coadd.name[1]),
                                            "mjdmean":float(coadd["MJDMEAN"])}
                                           for _,coadd in coadds.iterrows()]})

        return jsonify(res)


api.add_resource(Tiles_Page, "/tiles")



class Cutout_Page(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        parser.add_argument("size", type=int, required=True)
        parser.add_argument("band", type=int, choices=(1,2), required=True)
        parser.add_argument("epoch", type=int, required=True)
        args = parser.parse_args()

        coadds = unwtiles.get_tiles(args.ra,args.dec).loc[(slice(None),
                                                           args.epoch,
                                                           args.band),:]
        # Take the first (should be closest, by sort?)
        coadd = coadds.iloc[0,:]
        coadd_id,epoch,band = coadd.name
            

        # Get cutout
        cutout = unwcutout.get_by_tile_epoch(
            coadd_id,
            epoch,args.ra,args.dec,
            band,size=args.size,
            fits=True,
            # TODO: FIX FOR SCAMP
            )
            #scamp=unwtiles.array_to_cards(e))
        
        sio = StringIO(cutout)
        sio.seek(0)
        
        return send_file(sio,"application/binary")
        
        
api.add_resource(Cutout_Page, "/cutout")

"""
class Coadd_Page(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        parser.add_argument("size", type=int, required=True)
        parser.add_argument("band", type=int, choices=(1,2), required=True)
        parser.add_argument("epoch", type=int, required=True, action="append")
        args = parser.parse_args()

        # Get coadd ids
        _,epochs = unwtiles.get_tiles(args.ra,args.dec)[0]
        cutouts = []
        for epoch in args.epoch:
            for e in epochs:
                if e["BAND"] == args.band and e["EPOCH"] == epoch: break
            else:
                return "Error: coadd with given band and epoch not found", 404

            # Get cutout
            cutouts.append(unwcutout.get_by_tile_epoch(e["COADD_ID"],epoch,
                                                       args.ra,args.dec,
                                                       args.band,size=args.size,
                                                       fits=True,covmap=True))
        
        # Add cutouts together
        cutout = add_arrs(cutouts)
        
        sio = StringIO(cutout)
        sio.seek(0)
        
        return send_file(sio,"application/binary")
"""        
# TODO: See if anything is using /coadd       
#api.add_resource(Coadd_Page, "/coadd")


class Coadd_Strategy_Page(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        parser.add_argument("band", type=int, required=True,
                            choices=[1,2])
        parser.add_argument("coadd_mode", type=str, required=True,
                            choices=("time-resolved",
                                     "parallax-cancelling-forward",
                                     "parallax-cancelling-backward",
                                     "window-0.5-year",
                                     "window-1.0-year",
                                     "window-1.5-year",
                                     "window-2.0-year",
                                     "window-2.5-year",
                                     "window-3.0-year",
                                     "pre-post",
                                     "parallax-enhancing",
                                     "shift-and-add"))
        parser.add_argument("pmra", type=float, required=False)
        parser.add_argument("pmdec", type=float, required=False)
        args = parser.parse_args()

        solutions = []            
            
        # Get coadd ids, pick just one tile
        coadds = unwtiles.get_tiles(args.ra,args.dec)
        # First coadd_id =
        if coadds.shape[0] == 0:
            return jsonify({"solutions":solutions})
            
        coadd_id,_,_ = coadds.iloc[0,:].name
        # All coadds for this coadd_id
        coadds = coadds.loc[(coadd_id,slice(None),slice(None)),:]

        
        def dictit(coadds):
            """Convert coadds to dict"""
            solutions = []
            for _,coadd in coadds.iterrows():
                coadd_id,epoch,band = coadd.name
                solutions.append({"tile":str(coadd_id),
                                  "band":int(band),
                                  "epochs":[int(epoch)],
                                  "mjdmeans":[float(coadd["MJDMEAN"])],
                })
            return solutions

        
        def fwd(coadds,coadd_id,band,fwd=1):
            """Select only FORWARD == fwd coadds"""
            return coadds.loc[(coadd_id,slice(None),band),:].loc[
                              coadds["FORWARD"] == fwd,:]

        
        if args.coadd_mode == "time-resolved":
            # All epochs
            for _,coadd in coadds.iterrows():
                coadd_id,epoch,band = coadd.name
                if band != args.band: continue
                solutions.append({"tile":str(coadd_id),
                                  "band":int(band),
                                  "epochs":[int(epoch)],
                                  "mjdmeans":[float(coadd["MJDMEAN"])],
                })
        elif args.coadd_mode == "parallax-cancelling-forward":
            # Only forward
            solutions.extend(dictit(fwd(coadds,coadd_id,args.band,1)))
        elif args.coadd_mode == "parallax-cancelling-backward":
            # Only backward
            solutions.extend(dictit(fwd(coadds,coadd_id,args.band,0)))
        elif args.coadd_mode == "parallax-enhancing":
            # All FORWARD vs all BACKWARD
            forward = fwd(coadds,coadd_id,args.band,1)
            backward = fwd(coadds,coadd_id,args.band,0)
                    
            solutions.append({"tile":str(coadd_id),
                              "band":int(args.band),
                              "epochs":[int(x[1])
                                        for x in forward.index],
                              "mjdmeans":[float(x)
                                          for x in forward["MJDMEAN"]],
            })

            solutions.append({"tile":str(coadd_id),
                              "band":int(args.band),
                              "epochs":[int(x[1])
                                        for x in backward.index],
                              "mjdmeans":[float(x)
                                          for x in backward["MJDMEAN"]],
            })
            
        elif args.coadd_mode.startswith("window-"):
            time_bases = {"window-0.5-year":274.5,
                          "window-1.0-year":457.5,
                          "window-1.5-year":640.5,
                          "window-2.0-year":823.5,
                          "window-2.5-year":1006.5,
                          "window-3.0-year":1189.5}
            
            if args.coadd_mode not in time_bases:
                return "%s invalid coadd_mode"%args.coadd_mode,500

            time_basis = time_bases[args.coadd_mode]
            sub = coadds.loc[(coadd_id,slice(None),args.band),:]
            for _,coadd in sub.iterrows():
                # Build window
                window = sub[abs(sub["MJDMEAN"] - coadd["MJDMEAN"]) <= time_basis]
                sol = {"tile":str(coadd_id),
                       "band":int(args.band),
                       "epochs":[int(x[1])
                                 for x in window.index],
                       "mjdmeans":[float(x)
                                   for x in window["MJDMEAN"]]}
                if len(solutions) == 0 or sol != solutions[-1]:
                    solutions.append(sol)
        elif args.coadd_mode == "pre-post":
            mjdlim = 55609.8333333333

            sub = coadds.loc[(coadd_id,slice(None),args.band),:]
            
            pre = sub[sub["MJDMEAN"] < mjdlim]
            post = sub[sub["MJDMEAN"] >= mjdlim]

            for s in (pre,post):
                sol = {"tile":str(coadd_id),
                       "band":int(args.band),
                       "epochs":[int(x[1])
                                 for x in s.index],
                       "mjdmeans":[float(x)
                                   for x in s["MJDMEAN"]]}
                solutions.append(sol)

        elif args.coadd_mode == "shift-and-add":
            if args.pmra is None or args.pmdec is None:
                return "Provide pmra and pmdec parameters to shift-and-add",500

            coadds = coadds.loc[(coadd_id,slice(None),args.band),:].copy()
            c = coadds.loc[np.abs(coadds["MJDMEAN"].mean()-coadds["MJDMEAN"]).argmin()]

            coadds["PX"] = (-(((c["MJDMEAN"]-coadds["MJDMEAN"])/365)*(args.pmra/1000.))/2.75).round().astype(int)
            coadds["PY"] = ((((c["MJDMEAN"]-coadds["MJDMEAN"])/365)*(args.pmdec/1000.))/2.75).round().astype(int)

            sol = {"tile":str(coadd_id),
                   "band":int(args.band),
                   "epochs":[int(x[1])
                             for x in coadds.index],
                   "mjdmeans":[float(x)
                               for x in coadds["MJDMEAN"]],
                   "px":[int(x) for x in coadds["PX"]],
                   "py":[int(x) for x in coadds["PY"]]}

            solutions = [sol]

        return jsonify({"solutions":solutions})
        
        
api.add_resource(Coadd_Strategy_Page, "/coadd_strategy")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0")

    

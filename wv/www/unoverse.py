import cPickle as pickle
from cStringIO import StringIO
from tempfile import NamedTemporaryFile

import csv
import tarfile
import urllib
import subprocess
import json
import random
import pandas as pd

from flask import Flask, redirect
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
import scipy.misc as spm
import scipy.ndimage as ndim
import astropy.io.fits as aif
import skimage.exposure as skie
import skimage.util.dtype as skid
from PIL import Image,ImageOps
import imageio
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
    #sim = imp
    #sim = skie.rescale_intensity(img,out_range=(0,1)) # This OR the one above
    opt_img = skid.img_as_ubyte(sim)
    
    im = ImageOps.invert(Image.fromarray(opt_img)).transpose(Image.FLIP_TOP_BOTTOM)

    return im


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
        im = convert_img(cutout, color, mode, linear,
                         trimbright)
        sio = StringIO()
        if color is not None:
            plt.imsave(sio,im,#vmax=trimbright,
                       format="png",cmap=color)
        else:
            im.save(sio,format="png")
        converted.append(sio.getvalue())

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
    cache_im = uwsgi.cache_get(key,"wvim")
    if cache_im is None:
        im,cm = unwcutout.get_by_tile_epoch(tile,epoch,
                                            ra,dec,
                                            band,size=size,
                                            fits=False,
                                            covmap=True)
        uwsgi.cache_set(key,pickle.dumps((im,cm),protocol=0),0,"wvim")
    else:
        im,cm = pickle.loads(cache_im)
    return im,cm


def _build_cutout(ra,dec,size,band,epochs,px,py,mods,tile,linear,mode,trimbright):
    ims = []
    cms = []
    negims = []
    negcms = []
    allims = []
    allcms = []
    for i in random.sample(range(len(epochs)),len(epochs)):
        e_ = epochs[i]
        
        im,cm = request_tspot_cutout(ra,dec,size,band,e_,tile)

        # TODO: difference imaging
        # issue is the subselection of ims to create background
        # needs too much data to really pass in a GET
        if px is not None and i < len(px):
            px_ = px[i]
        else: px_ = 0
        
        if py is not None and i < len(py):
            py_ = py[i]
        else: py_ = 0

        if px != 0 or py != 0:
            im = project_im(im,px_,py_)
            cm = project_im(cm,px_,py_)

        # Prevent 0's in averaging by changing 0's to epsilon
        cm = np.clip(cm,np.finfo(np.float32).eps,None)
        
        allims.append(im)
        allcms.append(cm)
        if mods is not None and i < len(mods):
            if "s" in mods[i]:
                negims.append(im)
                negcms.append(cm)
            else:
                ims.append(im)
                cms.append(cm)
        else:
            ims.append(im)
            cms.append(cm)

    if len(ims) == 0:
        raise Exception("No positive images")

    im = np.average(ims,weights=cms,axis=0)
    allim = np.average(allims,weights=allcms,axis=0)
    
    if len(negims) > 0:
        negim = np.average(negims,weights=negcms,axis=0)
        #negim = ndim.gaussian_filter(negim,sigma=.5)
        #im = ndim.gaussian_filter(im,sigma=.5)

        # Rebase images by full-depth mode
        negim_ = negim
        negim_ = negim_ + (np.median(allim)-np.median(negim_))
        im_ = im
        im_ = im_ + (np.median(allim)-np.median(im_))

        negim_ = imp.clip(negim_,mode,trimbright)
        im_ = imp.clip(im_,mode,trimbright)
        
    
        im2 = np.average([im_,-negim_],axis=0)
        im = im2
        im = ndim.gaussian_filter(im,sigma=0.75)
        
    return im


def get_cutout(ra,dec,size,band,epochs,px,py,mods,
               tile,mode,color,linear,trimbright):
    cutout = _build_cutout(ra,dec,size,band,epochs,px,py,mods,tile,linear,mode,trimbright)
    return convert_img(cutout,color,mode,linear,trimbright),200


def get_composite(ra,dec,size,epochs,px,py,mods,tile,mode,color,linear,trimbright):
    """Fetch w1 and w2 images from tspot and build a w1+w2 composite"""
    w1 = _build_cutout(ra,dec,size,1,epochs,px,py,mods,tile,linear,mode,trimbright)
    w2 = _build_cutout(ra,dec,size,2,epochs,px,py,mods,tile,linear,mode,trimbright)

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

    # Merge images
    return im, 200


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
        parser.add_argument("mods", type=str, action="append")
        parser.add_argument("tile", type=str)
        parser.add_argument("mode", type=str, default="adapt",
                            choices=["adapt","percent","fixed"])
        parser.add_argument("color", type=str, default="Greys",
                            choices=["viridis","plasma","inferno","magma","Greys","Purples","Blues","Greens","Oranges","Reds","YlOrBr","YlOrRd","OrRd","PuRd","RdPu","BuPu","GnBu","PuBu","YlGnBu","PuBuGn","BuGn","YlGn","binary","gist_yarg","gist_gray","gray","bone","pink","spring","summer","autumn","winter","cool","Wistia","hot","afmhot","gist_heat","copper","PiYG","PRGn","BrBG","PuOr","RdGy","RdBu","RdYlBu","RdYlGn","Spectral","coolwarm","bwr","seismic","Pastel1","Pastel2","Paired","Accent","Dark2","Set1","Set2","Set3","tab10","tab20","tab20b","tab20c","flag","prism","ocean","gist_earth","terrain","gist_stern","gnuplot","gnuplot2","CMRmap","cubehelix","brg","hsv","gist_rainbow","rainbow","jet","nipy_spectral","gist_ncar"])
        parser.add_argument("linear",type=float,default=0.2)
        parser.add_argument("trimbright",type=float,default=99.2)
        args = parser.parse_args()

        cutout, status_code = self.convert(args.ra,args.dec,args.size,args.band,args.version,args.epochs,args.px,args.py,args.mods,args.tile,args.mode,args.color,args.linear,args.trimbright,raw=False)
        
        if status_code != 200:
            return cutout, status_code
        
        return send_file(cutout, mimetype="image/png")

    
    @staticmethod
    def convert(ra,dec,size,band,version,epochs,px,py,mods,tile,mode,color,linear,trimbright,raw=False):

        if linear <= 0.0: linear = 0.0000000001
        elif linear > 1.0: linear = 1.0

        if trimbright <= 0.0: trimbright = 0.0000000001
        elif mode == "percent" and trimbright > 100.0: trimbright = 100.0

        if version is None:
            if band in (1,2):
                cutout, status = get_cutout(ra,dec,size,band,
                                            epochs,px,py,mods,
                                            tile,
                                            mode,color,linear,
                                            trimbright)
                
                if status != 200: return "Request failed.",500
                
                if raw: return cutout
                
                sio = StringIO()
                if color is not None:
                    plt.imsave(sio,cutout,
                               format="png",cmap=color)
                else:
                    cutout.save(sio,format="png")
                sio.seek(0)
                return sio, status
            
            elif band == 3:
                cutout, status = get_composite(ra,dec,size,
                                               epochs,px,py,mods,
                                               tile,
                                               mode,color,linear,
                                               trimbright)
                
                if status != 200: return "Request failed.",500
                
                if raw: return cutout

                sio = StringIO()
                cutout.save(sio,format="png")
                sio.seek(0)
                return sio, status
            
        else:
            # Raw & legacy unWISE unsupported
            if raw: raise Exception("Raw and legacy unWISE unsupported")
            
            if band in (1,2):
                cutout, status = get_unwise_cutout(ra,dec,size,
                                                   band,version,
                                                   mode,color,
                                                   linear,trimbright)
            elif band == 3:
                cutout, status = get_unwise_composite(ra,dec,size,
                                                      band,version,
                                                      mode,color,
                                                      linear,trimbright)

        if status != 200:
            return "Request failed", 500

        return cutout, status


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


class SearchV2_Page(Resource):
    def get(self):
        return make_response(render_template("flash2.html"))


api.add_resource(SearchV2_Page, "/wiseview-v2")



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
            wcs = unwtiles.tr_cutout_solutions[coadd_id]
            px,py = wcs.wcs_world2pix(np.array([[args.ra,args.dec]]),0)[0]
            res["tiles"].append({"coadd_id": str(coadd_id),
                                 "px": px, "py": py,
                                 "epochs": [{"band":int(coadd.name[2]),
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
        parser.add_argument("covmap", type=bool, required=False, default=False)
        args = parser.parse_args()

        coadds = unwtiles.get_tiles(args.ra,args.dec).loc[(slice(None),
                                                           args.epoch,
                                                           args.band),:]

        if len(coadds) == 0:
            return "unWISE data not available for parameters", 404
        
        # Take the first (should be closest, by sort?)
        coadd = coadds.iloc[0,:]
        coadd_id,epoch,band = coadd.name
            

        # Get cutout
        if args.covmap:
            im,cm = unwcutout.get_by_tile_epoch(
                coadd_id,
                epoch,args.ra,args.dec,
                band,size=args.size,
                fits=True,
                covmap=True
            )
            im = aif.open(StringIO(im))
            cm = aif.open(StringIO(cm))
            im = aif.PrimaryHDU(im[0].data,header=im[0].header)
            cm = aif.ImageHDU(cm[0].data,header=cm[0].header)
            sio = StringIO()
            aif.HDUList([im,cm]).writeto(sio)
            sio.seek(0)
        else:
            cutout = unwcutout.get_by_tile_epoch(
                coadd_id,
                epoch,args.ra,args.dec,
                band,size=args.size,
                fits=True,
            )
        
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
                                     "window-0.5-year-parallax-enhancing",
                                     "window-1.0-year-parallax-enhancing",
                                     "window-1.5-year-parallax-enhancing",
                                     "window-2.0-year-parallax-enhancing",
                                     "window-2.5-year-parallax-enhancing",
                                     "window-3.0-year-parallax-enhancing",
                                     "swindow-0.5-year",
                                     "swindow-1.0-year",
                                     "swindow-1.5-year",
                                     "swindow-2.0-year",
                                     "swindow-2.5-year",
                                     "swindow-3.0-year",
                                     "pre-post",
                                     "spre-post",
                                     "parallax-enhancing",
                                     "shift-and-add",
                                     "daniella"))
        parser.add_argument("pmra", type=float, required=False)
        parser.add_argument("pmdec", type=float, required=False)
        args = parser.parse_args()

        try:
            solutions = self.coadd_strategy(args.ra,args.dec,args.band,args.coadd_mode,args.pmra,args.pmdec)
        except Exception,e:
            return e.message,500
            
        return jsonify({"solutions":solutions})

    @staticmethod
    def coadd_strategy(ra,dec,band,coadd_mode,pmra=None,pmdec=None):
        solutions = []            
            
        # Get coadd ids, pick just one tile
        coadds = unwtiles.get_tiles(ra,dec)
        # First coadd_id =
        if coadds.shape[0] == 0:
            return solutions
            
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
            coadds = coadds.loc[(coadd_id,slice(None),band),:]
            first_mjd = coadds.iloc[0]["MJDMEAN"]
            mjdmod = (first_mjd-coadds["MJDMEAN"]).abs() % 365.25
            forward = (mjdmod < (365.25/4.)) | (mjdmod >= (365.25*3/4.))
            if fwd != 1:
                forward = ~forward
            return coadds.loc[forward,:]

        
        if coadd_mode == "time-resolved":
            # All epochs
            for _,coadd in coadds.iterrows():
                coadd_id,epoch,band_ = coadd.name
                if band_ != band: continue
                solutions.append({"tile":str(coadd_id),
                                  "band":int(band_),
                                  "epochs":[int(epoch)],
                                  "mjdmeans":[float(coadd["MJDMEAN"])],
                })
        elif coadd_mode == "parallax-cancelling-forward":
            # Only forward
            solutions.extend(dictit(fwd(coadds,coadd_id,band,1)))
            print "MAH SOLUTIONS",solutions
        elif coadd_mode == "parallax-cancelling-backward":
            # Only backward
            solutions.extend(dictit(fwd(coadds,coadd_id,band,0)))
        elif coadd_mode == "parallax-enhancing":
            # All FORWARD vs all BACKWARD
            forward = fwd(coadds,coadd_id,band,1)
            backward = fwd(coadds,coadd_id,band,0)
                    
            solutions.append({"tile":str(coadd_id),
                              "band":int(band),
                              "epochs":[int(x[1])
                                        for x in forward.index],
                              "mjdmeans":[float(x)
                                          for x in forward["MJDMEAN"]],
            })

            solutions.append({"tile":str(coadd_id),
                              "band":int(band),
                              "epochs":[int(x[1])
                                        for x in backward.index],
                              "mjdmeans":[float(x)
                                          for x in backward["MJDMEAN"]],
            })
            
        elif coadd_mode.startswith("window-") and coadd_mode.endswith("-year"):
            time_bases = {"window-0.5-year":274.5,
                          "window-1.0-year":457.5,
                          "window-1.5-year":640.5,
                          "window-2.0-year":823.5,
                          "window-2.5-year":1006.5,
                          "window-3.0-year":1189.5}
            
            if coadd_mode not in time_bases:
                raise Exception("%s invalid coadd_mode"%coadd_mode)

            time_basis = time_bases[coadd_mode]
            sub = coadds.loc[(coadd_id,slice(None),band),:]
            for _,coadd in sub.iterrows():
                # Build window
                window = sub[abs(sub["MJDMEAN"] - coadd["MJDMEAN"]) <= time_basis]
                sol = {"tile":str(coadd_id),
                       "band":int(band),
                       "epochs":[int(x[1])
                                 for x in window.index],
                       "mjdmeans":[float(x)
                                   for x in window["MJDMEAN"]]}
                if len(solutions) == 0 or sol != solutions[-1]:
                    solutions.append(sol)

        elif coadd_mode.startswith("window-") and coadd_mode.endswith("-parallax-enhancing"):
            coadd_mode_time = coadd_mode[:coadd_mode.rfind("-parallax")]
            time_bases = {"window-0.5-year":274.5,
                          "window-1.0-year":457.5,
                          "window-1.5-year":640.5,
                          "window-2.0-year":823.5,
                          "window-2.5-year":1006.5,
                          "window-3.0-year":1189.5}
            
            if coadd_mode_time not in time_bases:
                raise Exception("%s invalid coadd_mode"%coadd_mode)

            time_basis = time_bases[coadd_mode_time]
            #sub = coadds.loc[(coadd_id,slice(None),band),:]
            sub = fwd(coadds,coadd_id,band,fwd=1)
            for _,coadd in sub.iterrows():
                # Build window
                window = sub[abs(sub["MJDMEAN"] - coadd["MJDMEAN"]) <= time_basis]
                sol = {"tile":str(coadd_id),
                       "band":int(band),
                       "epochs":[int(x[1])
                                 for x in window.index],
                       "mjdmeans":[float(x)
                                   for x in window["MJDMEAN"]]}
                if len(solutions) == 0 or sol != solutions[-1]:
                    solutions.append(sol)
            sub = fwd(coadds,coadd_id,band,fwd=0)
            for _,coadd in sub.iterrows():
                # Build window
                window = sub[abs(sub["MJDMEAN"] - coadd["MJDMEAN"]) <= time_basis]
                sol = {"tile":str(coadd_id),
                       "band":int(band),
                       "epochs":[int(x[1])
                                 for x in window.index],
                       "mjdmeans":[float(x)
                                   for x in window["MJDMEAN"]]}
                if len(solutions) == 0 or sol != solutions[-1]:
                    solutions.append(sol)
                

        elif coadd_mode.startswith("swindow-"):
            time_bases = {"swindow-0.5-year":274.5,
                          "swindow-1.0-year":457.5,
                          "swindow-1.5-year":640.5,
                          "swindow-2.0-year":823.5,
                          "swindow-2.5-year":1006.5,
                          "swindow-3.0-year":1189.5}
            
            if coadd_mode not in time_bases:
                raise Exception("%s invalid coadd_mode"%coadd_mode)

            time_basis = time_bases[coadd_mode]
            sub = coadds.loc[(coadd_id,slice(None),band),:]
            for _,coadd in sub.iterrows():
                # Build window
                window = sub[abs(sub["MJDMEAN"] - coadd["MJDMEAN"]) <= time_basis]
                notwindow = sub[~(abs(sub["MJDMEAN"] - coadd["MJDMEAN"]) <= time_basis)]
                sol = {"tile":str(coadd_id),
                       "band":int(band),
                       "epochs":[int(x[1])
                                 for x in window.index],
                       "mods":["" for x in window.index],
                       "mjdmeans":[float(x)
                                   for x in window["MJDMEAN"]]}
                sol["epochs"].extend([int(x[1]) for x in notwindow.index])
                sol["mods"].extend(["s" for x in notwindow.index])
                sol["mjdmeans"].extend([float(x) for x in notwindow["MJDMEAN"]])
                
                if len(solutions) == 0 or sol != solutions[-1]:
                    solutions.append(sol)

        elif coadd_mode == "pre-post":
            mjdlim = 55609.8333333333

            sub = coadds.loc[(coadd_id,slice(None),band),:]
            
            pre = sub[sub["MJDMEAN"] < mjdlim]
            post = sub[sub["MJDMEAN"] >= mjdlim]

            for s in (pre,post):
                sol = {"tile":str(coadd_id),
                       "band":int(band),
                       "epochs":[int(x[1])
                                 for x in s.index],
                       "mjdmeans":[float(x)
                                   for x in s["MJDMEAN"]]}
                solutions.append(sol)

        elif coadd_mode == "spre-post":
            mjdlim = 55609.8333333333

            sub = coadds.loc[(coadd_id,slice(None),band),:]
            
            pre = sub[sub["MJDMEAN"] < mjdlim]
            post = sub[sub["MJDMEAN"] >= mjdlim]

            epochs = [int(x[1]) for x in pre.index]
            epochs.extend([int(x[1]) for x in post.index])
            mods = ["" for x in pre.index]
            mods.extend(["s" for x in post.index])
            mjdmeans = [float(x) for x in pre["MJDMEAN"]]
            mjdmeans.extend([float(x) for x in pre["MJDMEAN"]])
            solutions.append({"tile":str(coadd_id),
                              "band":int(band),
                              "epochs":epochs,
                              "mods":mods,
                              "mjdmeans":mjdmeans,
                              })

            epochs = [int(x[1]) for x in post.index]
            epochs.extend([int(x[1]) for x in pre.index])
            mods = ["" for x in post.index]
            mods.extend(["s" for x in pre.index])
            mjdmeans = [float(x) for x in post["MJDMEAN"]]
            mjdmeans.extend([float(x) for x in post["MJDMEAN"]])
            solutions.append({"tile":str(coadd_id),
                              "band":int(band),
                              "epochs":epochs,
                              "mods":mods,
                              "mjdmeans":mjdmeans,
                              })

        elif coadd_mode in ("shift-and-add","daniella"):
            if pmra is None or pmdec is None:
                raise Exception("Provide pmra and pmdec parameters to shift-and-add")

            coadds = coadds.loc[(coadd_id,slice(None),band),:].copy()
            cidx = np.abs(coadds["MJDMEAN"].mean()-coadds["MJDMEAN"]).idxmin()
            c = coadds.loc[cidx]

            coadds["PX"] = (-(((c["MJDMEAN"]-coadds["MJDMEAN"])/365.25)*(pmra/1000.))/2.75).round().astype(int)
            coadds["PY"] = ((((c["MJDMEAN"]-coadds["MJDMEAN"])/365.25)*(pmdec/1000.))/2.75).round().astype(int)
            
            c0 = coadds.loc[coadds["MJDMEAN"].idxmin()]

            # Project RA and Dec
            pxc = ((c0["PX"]*2.75)/3600.)/np.cos(np.deg2rad(dec))
            pyc = (c0["PY"]*2.75)/3600.
            ra_ = ra-pxc
            dec_ = dec+pyc
            sol = {"tile":str(coadd_id),
                   "band":int(band),
                   "epochs":[int(x[1])
                             for x in coadds.index],
                   "mjdmeans":[float(x)
                               for x in coadds["MJDMEAN"]],
                   "px":[int(x) for x in coadds["PX"]],
                   "py":[int(x) for x in coadds["PY"]],
                   "ra":float(ra_),
                   "dec":float(dec_),
            }

            if coadd_mode == "daniella":
                sol["mods"] = ["d" for x in coadds.index]


            solutions = [sol]

        return solutions
        
        
api.add_resource(Coadd_Strategy_Page, "/coadd_strategy")


class Gif_Page(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        parser.add_argument("band", type=int, required=True,
                            choices=[1,2,3])
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
                                     "window-0.5-year-parallax-enhancing",
                                     "window-1.0-year-parallax-enhancing",
                                     "window-1.5-year-parallax-enhancing",
                                     "window-2.0-year-parallax-enhancing",
                                     "window-2.5-year-parallax-enhancing",
                                     "window-3.0-year-parallax-enhancing",
                                     "swindow-0.5-year",
                                     "swindow-1.0-year",
                                     "swindow-1.5-year",
                                     "swindow-2.0-year",
                                     "swindow-2.5-year",
                                     "swindow-3.0-year",
                                     "pre-post",
                                     "spre-post",
                                     "parallax-enhancing"))
        parser.add_argument("size", type=int, default=120)
        parser.add_argument("mode", type=str, default="adapt",
                            choices=["adapt","percent","fixed"])
        parser.add_argument("color", type=str, default="Greys",
                            choices=["viridis","plasma","inferno","magma","Greys","Purples","Blues","Greens","Oranges","Reds","YlOrBr","YlOrRd","OrRd","PuRd","RdPu","BuPu","GnBu","PuBu","YlGnBu","PuBuGn","BuGn","YlGn","binary","gist_yarg","gist_gray","gray","bone","pink","spring","summer","autumn","winter","cool","Wistia","hot","afmhot","gist_heat","copper","PiYG","PRGn","BrBG","PuOr","RdGy","RdBu","RdYlBu","RdYlGn","Spectral","coolwarm","bwr","seismic","Pastel1","Pastel2","Paired","Accent","Dark2","Set1","Set2","Set3","tab10","tab20","tab20b","tab20c","flag","prism","ocean","gist_earth","terrain","gist_stern","gnuplot","gnuplot2","CMRmap","cubehelix","brg","hsv","gist_rainbow","rainbow","jet","nipy_spectral","gist_ncar"])
        parser.add_argument("linear",type=float,default=0.2)
        parser.add_argument("trimbright",type=float,default=99.2)
        parser.add_argument("duration",type=float,default=0.25)
        parser.add_argument("zoom",type=float,default=9.0)
        args = parser.parse_args()

        solutions = Coadd_Strategy_Page.coadd_strategy(args.ra,args.dec,
                                                       2 if args.band == 3 else args.band,
                                                       args.coadd_mode)

        ims = []
        first = True
        for sol in solutions:
            # Relying on it being sorted by epoch
            cutout = Convert.convert(args.ra,args.dec,(args.size/2.75)+1,args.band,None,
                                     sol["epochs"],
                                     sol["px"] if "px" in sol else [],
                                     sol["py"] if "py" in sol else [],
                                     sol["mods"] if "mods" in sol else [],
                                     sol["tile"],args.mode,args.color,args.linear,args.trimbright,raw=True)
            #sio = StringIO(cutout)
            #sio.seek(0)
            #ims.append(sio)
            
            cutout = np.array(cutout)

            # Resize
            cutout = spm.imresize(cutout,args.zoom,interp="nearest")

            # Add a pixel to the edge
            if len(cutout.shape) == 3:
                if first:
                    padded = None
                    min_ = cutout.min()
                    for i in xrange(cutout.shape[-1]):
                        sub = cutout[...,i]
                        padded_ = np.pad(sub,max(int(args.zoom/3.),1),mode="constant",constant_values=min_)
                        if padded is None:
                            padded = np.zeros((padded_.shape[0],padded_.shape[1],cutout.shape[2]),"uint8")
                        padded[...,i] = padded_
                    
                    first = False
                else:
                    padded = None
                    max_ = cutout.max()
                    for i in xrange(cutout.shape[-1]):
                        sub = cutout[...,i]
                        padded_ = np.pad(sub,max(int(args.zoom/3.),1),mode="constant",constant_values=max_)
                        if padded is None:
                            padded = np.zeros((padded_.shape[0],padded_.shape[1],cutout.shape[2]),"uint8")
                        padded[...,i] = padded_
                cutout = padded
            else:
                if first:
                    cutout = np.pad(cutout,max(int(args.zoom/3.),1),mode="constant",constant_values=cutout.min())
                    first = False
                else:
                    cutout = np.pad(cutout,max(int(args.zoom/3.),1),mode="constant",constant_values=cutout.max())


            ims.append(cutout)

        gif = StringIO()
        imageio.mimwrite(gif,ims,format="GIF-PIL",loop=0,duration=args.duration)
        gif.seek(0)

        return send_file(gif, mimetype="image/gif")        
        

api.add_resource(Gif_Page, "/gif")
        


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0")

    

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


app = Flask(__name__)
api = Api(app)
app.config['PROPAGATE_EXCEPTIONS'] = True

PATH = "http://unwise.me/cutout_fits?file_img_m=on&version={version}&ra={ra}&dec={dec}&size={size}&bands={band}"


GRAD = [
    "gradient:blueviolet-blue",
    "gradient:blue-cyan",
    "gradient:cyan-green1",
    "gradient:green1-yellow",
    "gradient:yellow-orange",
    "gradient:orange-red",
    "gradient:red-black",
]

GREY = [
    "gradient:white-black",
]


# input fits img data, receive png data
def convert_img(file_data,color,mode,linear,trimbright,right_pad=False):
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
        cms.append(cm)

    return np.average(ims,weights=cms,axis=0)


def request_cutouts(ra, dec, size, band, version):
    if version in ("allwise","neo1","neo2"):
        url = PATH.format(ra=ra, dec=dec, size=size, band=band, version=version)
        response = requests.get(url)
        if response.status_code != 200:
            raise Exception("Invalid response")

        cutouts = [aif.getdata(StringIO(c.read())) for c in find_tar_fits(response.content)]
        if not cutouts:
            raise Exception("No fits files found")
    elif version in ("pre","post"):
        if version == "pre":
            # Fetch all pre-hibernation coadds
            cutouts = unwcutout.get_by_mjd(ra,dec,band,
                                           end_mjd=55609.8333333333,
                                           size=size,
                                           covmap=True)
            
            # Add them together
            cutouts = [add_arrs(cutouts)]
        else:
            # Fetch all post-hibernation coadds
            cutouts = unwcutout.get_by_mjd(ra,dec,band,
                                           start_mjd=55609.8333333333,
                                           size=size,
                                           covmap=True)
            
            # Add them together
            cutouts = [add_arrs(cutouts)]
        
    elif version[4] in "pm" and version[8] == "/":
        tile,epoch = version.split("/")
        cutouts = [unwcutout.get_by_tile_epoch(tile,epoch,ra,dec,band,size=size)]
    else:
        raise Exception("Invalid version %s"%version)
    return cutouts


def get_cutouts(ra, dec, size, band, version, mode, color, linear, trimbright):
    images = {1:[],2:[]}
    for band in images:
        try:
            cutouts = request_cutouts(ra, dec, size, band, version)
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


def get_cutout(ra, dec, size, band, version, mode, color, linear, trimbright):
    try:
        cutouts = request_cutouts(ra, dec, size, band, version)
    except Exception as e:
        print e
        return "Error: {0}".format(str(e)), 500

    converted = []
    for offset, cutout in enumerate(cutouts):
        pad = offset != (len(cutouts) - 1)
        converted.append(convert_img(cutout, color, mode, linear,
                                     trimbright, right_pad=pad))

    image = merge_imgs(converted)

    return StringIO(image), 200


class Convert(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        parser.add_argument("size", type=int, default=100)
        parser.add_argument("band", type=int, default=3, choices=[1,2,3])
        parser.add_argument("version", type=str, default="neo2")
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

        if args.band in (1,2):
            cutout, status = get_cutout(**args)
        else:
            cutout, status = get_cutouts(**args)
        
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

        for _,epochs in unwtiles.get_tiles(args.ra,args.dec):
            res["tiles"].append({"coadd_id":str(epochs[0]["COADD_ID"]),
                                 "epochs":[{"band":int(e["BAND"]),
                                            "epoch":int(e["EPOCH"]),
                                            "mjdmean":float(e["MJDMEAN"])}
                                           for e in epochs]})

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

        # Get coadd ids
        _,epochs = unwtiles.get_tiles(args.ra,args.dec)[0]
        for e in epochs:
            if e["BAND"] == args.band and e["EPOCH"] == args.epoch: break
        else:
            return "Error: coadd with given band and epoch not found", 404

        # Get cutout
        cutout = unwcutout.get_by_tile_epoch(
            e["COADD_ID"],
            args.epoch,args.ra,args.dec,
            args.band,size=args.size,
            fits=True,
            scamp=unwtiles.array_to_cards(e))
        
        sio = StringIO(cutout)
        sio.seek(0)
        
        return send_file(sio,"application/binary")
        
        
api.add_resource(Cutout_Page, "/cutout")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0")

    

from io import BytesIO, StringIO
import csv
import urllib

from flask import Flask, redirect, make_response, render_template, send_file, jsonify, url_for, request
from flask_restful import Api,Resource,reqparse

import requests

# Image processing
import numpy as np
import astropy.io.fits as aif

import wv.common.xref as xref
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
        }, timeout = 5)

        files = {}
        reader = csv.DictReader(StringIO(response.content.decode("ascii")))
        for row in reader:
            files[row["filter"]] = row["filename"]

        url = "http://ps1images.stsci.edu/cgi-bin/fitscut.cgi?" + urllib.parse.urlencode({
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


class SearchV3_Page(Resource):
    def get(self):
        return make_response(render_template("flash3.html"))

api.add_resource(SearchV3_Page, "/wiseview-v3", "/wiseview-v2", "/wiseview")


class Xref_Page(Resource):
    def get(self):
        parser = reqparse.RequestParser()
        parser.add_argument("ra", type=float, required=True)
        parser.add_argument("dec", type=float, required=True)
        args = parser.parse_args()

        subs = xref.get_subjects_by_coordinates(args.ra,args.dec)
        return jsonify({"ids":[str(s[0]) for s in subs]})

api.add_resource(Xref_Page, "/xref")


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
                                             "mjdmean":float(coadd["MJDMEAN"]),
                                             "forward":int(coadd["FORWARD"])}
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
            im = aif.open(BytesIO(im))
            cm = aif.open(BytesIO(cm))
            im = aif.PrimaryHDU(im[0].data,header=im[0].header)
            cm = aif.ImageHDU(cm[0].data,header=cm[0].header)
            sio = BytesIO()
            aif.HDUList([im,cm]).writeto(sio)
            sio.seek(0)
        else:
            cutout = unwcutout.get_by_tile_epoch(
                coadd_id,
                epoch,args.ra,args.dec,
                band,size=args.size,
                fits=True,
            )
        
            sio = BytesIO(cutout)
            sio.seek(0)
        
        return send_file(sio,"application/binary")
        
api.add_resource(Cutout_Page, "/cutout")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0")

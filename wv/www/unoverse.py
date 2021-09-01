from io import BytesIO, StringIO
import re
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


def mode_tr(new_args,args):
    if args.coadd_mode == "time-resolved":
        new_args["window"] = 0
        return True
    return False

def mode_plx_can(new_args,args):
    if args.coadd_mode.startswith("parallax-cancelling"):
        new_args["window"] = 0
        new_args["scandir"] = 1
        return True
    return False

def mode_full_depth(new_args,args):
    if args.coadd_mode == "full-depth":
        new_args["window"] = 1.5
        return True
    return False

def mode_pre_post(new_args,args):
    if args.coadd_mode == "pre-post":
        new_args["window"] = 1.5
        new_args["outer_epochs"] = 1
        return True
    return False

def mode_plx_en(new_args,args):
    if args.coadd_mode == "parallax-enhancing":
        new_args["window"] = 100
        new_args["scandir"] = 1

def mode_window(new_args,args):
    r = re.match("window-([0-9\.]+)-year",args.coadd_mode)
    if r == None:
        return False
    print(args.coadd_mode)
    print(r)
    print(r.groups)
    try:
        yr = float(r.group(1))
    except:
        return False
    if yr < 0:
        yr = 0
    new_args["window"] = yr
    return True

def mode_window_plx(new_args,args):
    r = re.match("window-([0-9\.]+)-year-parallax-enhancing",args.coadd_mode)
    if r == None:
        return False
    try:
        yr = float(r.group(1))
    except:
        return False
    if yr < 0:
        yr = 0
    new_args["window"] = yr
    new_args["scandir"] = 1
    return True

def mode_sa(new_args,args):
    if args.coadd_mode == "shift-and-add":
        new_args["window"] = 100
        new_args["shift"] = 1
        new_args["pmra"] = args.pmra
        new_args["pmdec"] = args.pmdec
        return True
    return False


class Search_Page(Resource):
    def get(self,args=None):
        """
        Translate v1 args to v3
        """
        arg_templates = {
            "ra":(float,133.786246), "dec":(float,-7.244372),
            "size":(int,176), "band":(int,3), "speed":(float,150),
            "trimbright":(float,150.), "linear":(float,1.),
            "mode":(str,"fixed"),
            "coadd_mode":(str,"window-1.5-year"),"zoom":(int,9),
            "border":(int,1), "pmra":(float,0),"pmdec":(float,0)}
        
        if args is None:
            print(request.args)
            parser = reqparse.RequestParser()
            for k, v in arg_templates.items():
                parser.add_argument(k, type=v[0], default=v[1], required=False)
            args = parser.parse_args()
            print(args)

        new_args = {}
        dflt = lambda k: arg_templates[k][0](arg_templates[k][1])
        if args.ra < 0 or args.ra > 360:
            new_args["ra"] = dflt("ra")
        else:
            new_args["ra"] = args.ra
            
        if args.dec < -90 or args.dec > 90:
            new_args["dec"] = dflt("dec")
        else:
            new_args["dec"] = args.dec

        if args.size < 3:
            new_args["size"] = 3
        elif args.size > 2048:
            new_args["size"] = 2048
        else:
            new_args["size"] = args.size

        if args.band not in (1,2,3):
            new_args["band"] = dflt("band")
        else:
            new_args["band"] = args.band

        if args.speed < 2:
            new_args["speed"] = 2
        elif args.speed > 1000:
            new_args["speed"] = 1000
        else:
            new_args["speed"] = args.speed

        if args.mode == "fixed":
            new_args["maxbright"] = args.trimbright
        else:
            new_args["maxbright"] = dflt("trimbright")
        new_args["minbright"] = -25

        if args.linear < 0 or args.linear > 1:
            new_args["linear"] = dflt("linear")
        else:
            new_args["linear"] = args.linear

        new_args["zoom"] = args.zoom
        if args.border not in (0,1):
            new_args["border"] = dflt("border")
        else:
            new_args["border"] = args.border

        for fun in [mode_tr, mode_plx_can, mode_full_depth, mode_pre_post,
                    mode_plx_en, mode_window, mode_window_plx, mode_sa]:
            if fun(new_args,args):
                print("I PICKED:",fun)
                break
        else:
            # Not successful in matching with old mode. Set defaults    
            new_args["window"] = 1.5

        #return redirect("/wiseview-v3#"+"&".join([k+"="+str(v) for k,v in new_args.items()]))
        return redirect("/wiseview-v3")

api.add_resource(Search_Page, "/wiseview")


class SearchV3_Page(Resource):
    def get(self):
        return make_response(render_template("flash3.html"))

api.add_resource(SearchV3_Page, "/wiseview-v3", "/wiseview-v2")


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
    zz = Search_Page()
    import argparse
    def thing(arg_templates):
        print(arg_templates)
        ap = argparse.ArgumentParser()
        for k,v in arg_templates.items():
            ap.add_argument("--"+k, type=v[0], default=v[1], required=False)
        print(zz.get(args=ap.parse_args()))
    thing({"ra":(float,133.786246), "dec":(float,-7.244372),
           "mode":(str,"fixed"),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"window-1.5-year"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.786246), "dec":(float,-7.344372),
           "size":(int,176), "band":(int,1), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"window-1.5-year"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.786246), "dec":(float,-7.444372),
           "size":(int,176), "band":(int,2), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"window-1.5-year"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.786246), "dec":(float,-7.544372),
           "size":(int,176), "band":(int,3), "speed":(float,10),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"window-1.5-year"),"zoom":(int,5),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.786246), "dec":(float,-7.644372),
           "size":(int,50), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"window-1.5-year"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.786246), "dec":(float,-7.744372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,125), "linear":(float,1.),
           "coadd_mode":(str,"window-1.5-year"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.686246), "dec":(float,-7.844372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"window-0.5-year"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.586246), "dec":(float,-7.844372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"window-1.5-year-parallax-enhancing"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.486246), "dec":(float,-7.844372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"full-depth"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.386246), "dec":(float,-7.844372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"pre-post"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.286246), "dec":(float,-7.844372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"shift-and-add"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.186246), "dec":(float,-7.844372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"time-resolved"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.186246), "dec":(float,-7.844372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"parallax-cancelling-backward"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.186246), "dec":(float,-7.844372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"parallax-cancelling-forward"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    thing({"mode":(str,"fixed"),"ra":(float,133.186246), "dec":(float,-7.844372),
           "size":(int,176), "band":(int,3), "speed":(float,150),
           "trimbright":(float,150.), "linear":(float,1.),
           "coadd_mode":(str,"parallax-enhancing"),"zoom":(int,9),
           "border":(int,1), "pmra":(float,0),"pmdec":(float,0)})
    

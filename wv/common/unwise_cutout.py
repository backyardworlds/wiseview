import cPickle as pickle
import cStringIO as StringIO
import numpy as np
import wv.common.unwise_tiles as ut
import wv.common.touchspot as tspot
import astropy.io.fits as aif
import astropy.wcs as awcs
import gzip

try:
    import uwsgi
except ImportError:
    # Dan doesn't really know why UWSGI starts twice, but he's hoping that the first ime
    # is just.... i dunno... loading a master or something?
    # Then the rest does the real work?
    pass

path = "unwise/data/timeresolved"

def cutout(fitsfileobj,ra,dec,size,fits=False,scamp=None,
           wcs=None):
    # TODO: FIX SCAMP
    scamp=None
    hdul = aif.open(fitsfileobj)

    # Using template headers for cutouts isntead of SCAMP
    if wcs is None:
        wcs = awcs.WCS(hdul[0].header)

    # Get pixel coordinates from ra,dec
    px,py = wcs.wcs_world2pix(np.array([[ra,dec]]),0)[0]

    # Calculate bottom and left positions of cutout
    bot = int(py)-int(size/2)
    left = int(px)-int(size/2)

    # Perform cutout
    cut = hdul[0].data[max(bot,0):min(int(py)+int(size/2)+1,2048),
                       max(left,0):min(int(px)+int(size/2)+1,2048)]
    
    
    # Convert to fits
    if fits:
        cutf = aif.PrimaryHDU(cut,header=hdul[0].header)
        cutf.header["NAXIS1"] = cut.shape[1] # X, RA
        cutf.header["NAXIS2"] = cut.shape[0] # Y, Dec
        cpx = min(px,int(size/2)
                  # Preserve fractional pixel value
                  +(px-int(px)))
        cpy = min(py,int(size/2)
                  # Preserve fractional pixel value
                  +(py-int(py)))
        cutf.header["CRPIX1"] = cpx+1 # Fits counts px starting at 1
        cutf.header["CRPIX2"] = cpy+1 # Fits counts px starting at 1
        cutf.header["CRVAL1"] = ra
        cutf.header["CRVAL2"] = dec
        
        sio = StringIO.StringIO()
        cutf.writeto(sio)
        sio.seek(0)
        return sio.getvalue()

    return cut


def get_by_tile_epoch(coadd_id,epoch_num,ra,dec,band,size=None,fits=False,
                      scamp=None,covmap=False,cache=None):
    """
    Download cutouts or full tiles given

    Optionally provide a scamp header via "scamp".

    May return fits images instead of flat arrays via "fits".

    May return coverage maps alongside images with "covmap"
    """

    # Build the URL
    path_ = "/".join(
        (path,
         "e%03d"%int(epoch_num), # epoch in e### form
         coadd_id[:3], # first 3 digits of RA
         coadd_id, # the tile name itself
         "unwise-%s-w%d-img-m.fits"%(coadd_id,band)))

    # Fetch pre-built WCS solution
    wcs = ut.tr_cutout_solutions[coadd_id]

    # Get content from S3
    sio = StringIO.StringIO()
    try:
        tspot.bucket.download_fileobj(path_,sio)
    except Exception,e:
        raise Exception("%s %s"%(str(e),path_))
    sio.seek(0)

    # Perform cutouts if size is specified
    if size is not None:
        im = cutout(sio,ra,dec,size,fits=fits,scamp=scamp,wcs=wcs)
    else:
        im = sio.getvalue()


    if covmap:
        # Build coverage map path
        path_ = "/".join(
            (path,
             "e%03d"%int(epoch_num), # epoch in e### form
             coadd_id[:3], # first 3 digits of RA
             coadd_id, # the tile name itself
             "unwise-%s-w%d-n-m.fits.gz"%(coadd_id,band)))

        # Get content from S3
        sio = StringIO.StringIO()
        tspot.bucket.download_fileobj(path_,sio)
        sio.seek(0)
        
        gz = gzip.GzipFile(fileobj=sio,mode="rb").read()
        
        # Perform cutouts if size is specified
        if size is not None:
            sio = StringIO.StringIO(gz)
            sio.seek(0)
            cm = cutout(sio,ra,dec,size,fits=fits,scamp=scamp)
        else:
            cm = gz
            
        return im,cm
    
    return im



def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("ra",type=float)
    ap.add_argument("dec",type=float)
    ap.add_argument("band",type=int,choices=(1,2))
    ap.add_argument("epoch",type=int)
    ap.add_argument("--size",default=None,type=int)
    args = ap.parse_args()

    tiles = ut.get_tiles(args.ra,args.dec).iloc[0,:]
    print tiles
    cutout = get_by_tile_epoch(tiles.name[0],args.ra,args.dec,
                               args.band,args.epoch,
                               size=args.size,fits=True)
    #import sys
    #sys.stdout.write(tiles[0])
    print "tiles",len(tiles)
    print [len(t) for t in tiles]

    
if __name__ == "__main__": main()

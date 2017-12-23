import math
import numpy as np
import astropy.table as at # need to do this first, or astropy will barf?
import astropy.io as aio
import sklearn.neighbors as skn
import astropy.wcs as awcs
import astropy.io.fits as aif
import wv.common.rdballtree as rdbt
import cPickle as pickle
import collections

# Units are degrees unless stated
tile_width = (  2048 # pixels
              * 2.75 # arcseconds per pixel
                ) / 3600.0 # arcseconds per degree
tile_corner_radius = math.sqrt((
    (tile_width/2.0) # Degrees from center to edge
    **2)*2) # Euclidean distance


tile_tree = None
# Store RA, Dec, Idx in indices
# Use positional lookups to get offset into
# _data, _epochs
tr_atlas_indices = None
# Store one fitsy Header per coadd_id for testing
# position within coadd with WCS
tr_atlas_headers = None
tr_atlas_epochs = None


def array_to_cards(arr,full=False):
    # ('COADD_ID', 'S8'), ('BAND', '>i2'), ('EPOCH', '>i2'), ('RA', '>f8'),
    # ('DEC', '>f8'), ('FORWARD', 'u1'), ('MJDMIN', '>f8'),
    # ('MJDMAX', '>f8'), ('MJDMEAN', '>f8'), ('DT', '>f8'),
    # ('N_EXP', '>f4'), ('COVMIN', '>i4'), ('COVMAX', '>i4'),
    # ('COVMED', '>f4'), ('NPIX_COV0', '>i4'), ('NPIX_COV1', '>i4'),
    # ('NPIX_COV2', '>i4'), ('LGAL', '>f8'), ('BGAL', '>f8'),
    # ('LAMBDA', '>f8'), ('BETA', '>f8'), ('SCAMP_HEADER_EXISTS', 'u1'),
    # ('SCAMP_CONTRAST', '>f4'), ('ASTRRMS1', '>f8'), ('ASTRRMS2', '>f8'),
    # ('N_CALIB', '>i4'), ('N_BRIGHT', '>i4'), ('N_SE', '>i4'),
    # ('NAXIS', '>i4', (2,)), ('CD', '>f8', (2, 2)), ('CDELT', '>f8', (2,)),
    # ('CRPIX', '>f8', (2,)), ('CRVAL', '>f8', (2,)), ('CTYPE', 'S8', (2,)),
    # ('LONGPOLE', '>f8'), ('LATPOLE', '>f8'), ('PV2', '>f8', (2,))
    if full:
        if arr["SCAMP_HEADER_EXISTS"] == 0:
            kwds = ("COADD_ID","BAND","EPOCH","RA","DEC","FORWARD","MJDMIN","MJDMAX","MJDMEAN","DT","N_EXP","COVMIN","COVMAX","COVMED","HIERARCH NPIX_COV0","HIERARCH NPIX_COV1","HIERARCH NPIX_COV2","LGAL","BGAL","LAMBDA","BETA","HIERARCH SCAMP_HEADER_EXISTS","HIERARCH SCAMP_CONTRAST","ASTRRMS1","ASTRRMS2","N_CALIB","N_BRIGHT","N_SE","NAXIS","NAXIS1","NAXIS2","CTYPE1","CTYPE2")
            vals = (arr["COADD_ID"],arr["BAND"],arr["EPOCH"],arr["RA"],arr["DEC"],arr["FORWARD"],arr["MJDMIN"],arr["MJDMAX"],arr["MJDMEAN"],arr["DT"],arr["N_EXP"],arr["COVMIN"],arr["COVMAX"],arr["COVMED"],arr["NPIX_COV0"],arr["NPIX_COV1"],arr["NPIX_COV2"],arr["LGAL"],arr["BGAL"],arr["LAMBDA"],arr["BETA"],arr["SCAMP_HEADER_EXISTS"],arr["SCAMP_CONTRAST"],arr["ASTRRMS1"],arr["ASTRRMS2"],arr["N_CALIB"],arr["N_BRIGHT"],arr["N_SE"],2,arr["NAXIS"][0],arr["NAXIS"][1],arr["CTYPE"][0],arr["CTYPE"][1])
        else:
            kwds = ("COADD_ID","BAND","EPOCH","RA","DEC","FORWARD","MJDMIN","MJDMAX","MJDMEAN","DT","N_EXP","COVMIN","COVMAX","COVMED","HIERARCH NPIX_COV0","HIERARCH NPIX_COV1","HIERARCH NPIX_COV2","LGAL","BGAL","LAMBDA","BETA","HIERARCH SCAMP_HEADER_EXISTS","HIERARCH SCAMP_CONTRAST","ASTRRMS1","ASTRRMS2","N_CALIB","N_BRIGHT","N_SE","NAXIS","NAXIS1","NAXIS2","CD1_1","CD1_2","CD2_1","CD2_2","CDELT1","CDELT2","CRPIX1","CRPIX2","CRVAL1","CRVAL2","LONGPOLE","LATPOLE","PV2_1","PV2_2","CTYPE1","CTYPE2")
            vals = (arr["COADD_ID"],arr["BAND"],arr["EPOCH"],arr["RA"],arr["DEC"],arr["FORWARD"],arr["MJDMIN"],arr["MJDMAX"],arr["MJDMEAN"],arr["DT"],arr["N_EXP"],arr["COVMIN"],arr["COVMAX"],arr["COVMED"],arr["NPIX_COV0"],arr["NPIX_COV1"],arr["NPIX_COV2"],arr["LGAL"],arr["BGAL"],arr["LAMBDA"],arr["BETA"],arr["SCAMP_HEADER_EXISTS"],arr["SCAMP_CONTRAST"],arr["ASTRRMS1"],arr["ASTRRMS2"],arr["N_CALIB"],arr["N_BRIGHT"],arr["N_SE"],2,arr["NAXIS"][0],arr["NAXIS"][1],arr["CD"][0][0],arr["CD"][0][1],arr["CD"][1][0],arr["CD"][1][1],arr["CDELT"][0],arr["CDELT"][1],arr["CRPIX"][0],arr["CRPIX"][1],arr["CRVAL"][0],arr["CRVAL"][1],arr["LONGPOLE"],arr["LATPOLE"],arr["PV2"][0],arr["PV2"][1],arr["CTYPE"][0],arr["CTYPE"][1])
    else:
        if arr["SCAMP_HEADER_EXISTS"] == 0:
            kwds = ("RA","DEC","FORWARD","NAXIS","NAXIS1","NAXIS2","CRPIX1","CRPIX2","CRVAL1","CRVAL2","CTYPE1","CTYPE2")
            vals = (arr["RA"],arr["DEC"],arr["FORWARD"],2,2048,2048,1024.5,1024.5,arr["RA"],arr["DEC"],"RA---TAN","DEC--TAN")
        else:
            kwds = ("RA","DEC","FORWARD","ASTRRMS1","ASTRRMS2","NAXIS","NAXIS1","NAXIS2","CD1_1","CD1_2","CD2_1","CD2_2","CDELT1","CDELT2","CRPIX1","CRPIX2","CRVAL1","CRVAL2","LONGPOLE","LATPOLE","PV2_1","PV2_2","CTYPE1","CTYPE2")
            vals = (arr["RA"],arr["DEC"],arr["FORWARD"],arr["ASTRRMS1"],arr["ASTRRMS2"],2,arr["NAXIS"][0],arr["NAXIS"][1],arr["CD"][0][0],arr["CD"][0][1],arr["CD"][1][0],arr["CD"][1][1],arr["CDELT"][0],arr["CDELT"][1],arr["CRPIX"][0],arr["CRPIX"][1],arr["CRVAL"][0],arr["CRVAL"][1],arr["LONGPOLE"],arr["LATPOLE"],arr["PV2"][0],arr["PV2"][1],arr["CTYPE"][0],arr["CTYPE"][1])

    h = aif.Header()
    cards = []
    for i in xrange(len(kwds)):
        kwd = kwds[i]
        cards.append((kwd,vals[i],""))

    h.extend(cards)
    return h


def __init(atlas):
    global tile_tree, tr_atlas_epochs, tr_atlas_indices, tr_atlas_headers

    # Initialize atlas
    # !!!ERRATUM!!!
    # astropy's HDUList is NOT concurrency safe.
    tr_atlas_epochs = aif.open(atlas)[1].data
    tr_atlas_headers = []
    
    tr_indices_ = []
    last = None
    # 110843,110860):#
    for i in xrange(len(tr_atlas_epochs)):
        row = tr_atlas_epochs[i]
        
        # Track when switching coadds and add index to tr_indices
        coadd_id = row[0]
        if coadd_id != last:
            # Switching to new coadd_id
            ra,dec = row[3],row[4]
            
            # Add index
            tr_indices_.append((i,ra,dec))

            # Add one header
            # This is... slow. very very very very very slow.
            head = array_to_cards(row)
            tr_atlas_headers.append(head)

            last = coadd_id

    tr_atlas_indices = np.array(tr_indices_,dtype=[("IDX","i4"),("RA","f4"),
                                                   ("DEC","f4")])
    
    # Build global tile tree (insignificant improvement w/ cache file)
    tile_tree = rdbt.rdtree(tr_atlas_indices)


def _tile_contains_position(idx,ra,dec):
    """
    Test whether tile contains position.
    Return summed distance to nearest edges, epochs if contained
    Return None,epochs if not contained
    """
    # Get a WCS
    wcs = awcs.WCS(tr_atlas_headers[idx])
    
    # Find pixel coordinates of ra, dec
    px,py = wcs.wcs_world2pix(np.array([[ra,dec]]),0)[0]

    # Calculate sum of distance to two closest edges
    if px > 1024.5: px = 2048-px
    if py > 1024.5: py = 2048-py

    # Don't return tiles not containing position or
    # with very small cutouts
    if px <= 1 or py <= 1: return None

    return px+py


def get_tiles(ra,dec):
    """
    Get tiles containing ra, dec

    Sort by furthest from edges, and find epochs (and WCS template)

    Returns sum distance to nearest 2 edges, tile, epochs
    """
    # First, get all tiles that *could* hold the position,
    # by radius    
    nearby_tiles = tile_tree.query_radius(ra,dec,tile_corner_radius)
    
    # Test actually within tiles, and capture shortest distance
    # to nearest edge
    within_tiles = []
    for tileofs in nearby_tiles[0][0]:
        nearest_edge = _tile_contains_position(tileofs,ra,dec)
        if nearest_edge is not None:
            idx = tr_atlas_indices[tileofs]
            within_tiles.append((nearest_edge,get_epochs_by_idx(idx)))

    # Sort by furthest from an edge. This is a better metric than
    # distance to tile center, because it accurately expresses
    # how complete the cutout will be in the corners versus edges
    return sorted(within_tiles,key=lambda x: x[0], reverse=True)


def get_epochs_by_idx(idx):
    # Grab rows until hitting the next coadd_id or
    # end of the atlas
    last = None
    idx = idx[0]
    for i in xrange(idx,len(tr_atlas_epochs)):
        coadd_id = tr_atlas_epochs[i][0]
        if last is not None and last != coadd_id:
            break
        last = coadd_id
    return tr_atlas_epochs[idx:i]


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("ra",type=float)
    ap.add_argument("dec",type=float)
    ap.add_argument("--atlas",default="tr_neo2_index.fits")
    args = ap.parse_args()

    __init(args.atlas)

    for x,epochs in get_tiles(float(args.ra),float(args.dec)):
        for e in epochs:
            print e
        print


if __name__ == "__main__": main()
else: __init("tr_neo2_index.fits")

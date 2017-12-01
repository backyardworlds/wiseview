import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

import skimage.exposure
import numpy as np
import astropy.table as at
from cStringIO import StringIO
import astropy.io.fits as aif
import astropy.wcs as awcs
from astropy.stats import sigma_clipped_stats
from photutils import DAOStarFinder,IRAFStarFinder
import statsmodels.api as sm
from statsmodels.sandbox.regression.predstd import wls_prediction_std

import wv.common.angsep as angsep
import wv.common.api_consumer as api


def _detect_sources(cutout):
    """
    Detect sources in given fits image
    
    Image should already be background subtracted
    """
    im = aif.getdata(StringIO(cutout))

    # Trim image to bring out fainter sources
    #im = skimage.exposure.exposure.rescale_intensity(
    #    im,in_range=(np.min(im),60))
    mean, median, std = sigma_clipped_stats(im, sigma=3.0, iters=5)

    daofind = DAOStarFinder(fwhm=3.0, threshold=3.*std)

    return daofind(im)
    #iraf = IRAFStarFinder(fwhm=1.5, threshold=2.5*std)
    #return iraf(im)


def organize_coadds(coadds):
    """Organize coadds into a table & group by mjdmean"""
    # Build table
    res = at.Table(rows=[(np.int16(c["band"]),
                          np.int16(c["epoch"]),
                          np.float64(c["mjdmean"]),
                          0,) # Parallax group TBD
                         for c in coadds["epochs"]],
                   names=("band","epoch","mjdmean",
                          "parallax_group"),
                   dtype=("u2","u2","f8","u2"))

    # Group by mjdmean
    first_mjdmean = res[0]["mjdmean"] # Pick any coadd
    
    for coadd in res:
        # Test within 180 days of first
        diff = (coadd["mjdmean"] - first_mjdmean) % 365.
        if diff < 90 or diff > (365-90):
            coadd["parallax_group"] = 0
        else:
            coadd["parallax_group"] = 1

    return res


def fetch_cutouts(coadds,ra,dec,size):
    """Add cutouts to coadds table"""
    cutouts = []
    for coadd in coadds:
        cutouts.append(api.get_cutout(ra,dec,size,
                                      coadd["band"],coadd["epoch"]))
    coadds.add_column(at.Column(cutouts,name="cutout",dtype="object"))

    return coadds


def detect_sources(coadds):
    """
    Detect sources in cutouts from coadds table.
    
    Return list of detected sources w/ info, like band, from coadds tbl
    """
    if len(coadds) == 0:
        raise Exception("detect_sources(...) called with empty coadds")

    # Capture WCS at epoch 0
    wcs0 = awcs.WCS(aif.open(StringIO(coadds[0]["cutout"]))[0])
    
    sources = []
    for i in xrange(len(coadds)):
        coadd = coadds[i]
        #if coadd["parallax_group"] != 1: continue
        # Get the sources
        tbl = _detect_sources(coadd["cutout"])

        # Build WCS from SCAMP solution in cutout header
        wcs = awcs.WCS(aif.open(StringIO(coadd["cutout"]))[0])

        ras,decs = [],[]
        xe0,ye0 = [],[]
        for source in tbl:
            # Use SCAMP solutions to convert px/py into RA/Dec
            ra,dec = wcs.wcs_pix2world(np.array([[
                source["xcentroid"],source["ycentroid"]
            ]]),0)[0]
            
            ras.append(ra); decs.append(dec)

            # Use SCAMP solution at epoch 0 to convert RA/Dec into
            # px,py in the epoch 0 cutout
            pxe0,pye0 = wcs0.wcs_world2pix(np.array([[
                ra,dec
            ]]),0)[0]

            xe0.append(pxe0); ye0.append(pye0)
            
        tbl.add_columns([at.Column([coadd["band"]]*len(tbl),
                                   name="band",dtype="i4"),
                         at.Column([coadd["parallax_group"]]*len(tbl),
                                   name="parallax_group",dtype="i4"),
                         at.Column(ras,name="ra",dtype="f8"),
                         at.Column(decs,name="dec",dtype="f8"),
                         at.Column(xe0,name="xe0",dtype="f8"),
                         at.Column(ye0,name="ye0",dtype="f8"),
                         at.Column([coadd["mjdmean"]]*len(tbl),
                                   name="mjdmean",dtype="f8"),
                         at.Column([-1]*len(tbl),
                                   name="group",dtype="i4"),
                         at.Column([i]*len(tbl),
                                   name="coadd",dtype="i4")])
        sources.append(tbl)
    
    return at.vstack(sources)


def _make_groups_within_bands(sources,band):
    groups = []
    for coadd in xrange(np.max(sources["coadd"])+1):
        subs = np.where((sources["band"] == band) &
                        (sources["coadd"] == coadd))[0]

        # Find best matches
        matches = []
        # n*m (n**2), can replace w/ balltree+haversine
        # for large cutouts
        for s in subs:
            for g in xrange(len(groups)):
                matches.append((angsep.angsep(sources[groups[g]][-1]["ra"],
                                              sources[groups[g]][-1]["dec"],
                                              sources[s]["ra"],
                                              sources[s]["dec"]),
                                s,g))
        
        seens = set()
        seeng = set()
        # Sort by separation
        # And add to existing groups
        for sep,s,g in sorted(matches):
            if s in seens or g in seeng:
                continue
            # Only group things that have moved <= 12"
            if sep*3600 > 12: break
            groups[g].append(s)
            seens.add(s)
            seeng.add(g)

        # If it didn't fit into an existing group,
        # make a new group
        for s in subs:
            if s in seens: continue
            groups.append([s])
            seens.add(s)
        
    return groups


def group_sources(sources):
    """
    Group detected sources across multiple coadds
    """
    # TODO: Also consider clustery clustercluster
    # For now, bin by closest. It doesn't take into account
    #   consistent magnitudes, shapes, colors, or anything,
    #   but it's a start...
    # TODO: for all of these, measure best fits and merge
    # by best to worst fit. for large collections, use
    # haversine+balltree
    w1_groups = _make_groups_within_bands(sources,1)
    w2_groups = _make_groups_within_bands(sources,2)
    
    if len(w1_groups) != 0 and len(w2_groups) != 0:    
        # Find best matches between w1 and w2
        matches = []
        for g1 in xrange(len(w1_groups)):
            for g2 in xrange(len(w2_groups)):
                s1 = sources[w1_groups[g1][0]]
                s2 = sources[w2_groups[g2][0]]
                matches.append((angsep.angsep(s1["ra"],
                                              s1["dec"],
                                              s2["ra"],
                                              s2["dec"]),
                                g1,g2))
        
        seen1 = set()
        seen2 = set()
        grps = 0
        # Sort by separation
        for sep,g1,g2 in sorted(matches):
            if g1 in seen1 or g2 in seen2:
                continue
            # Group groups within 12"
            if sep*3600 > 12: break
            for s in w1_groups[g1]:
                sources[s]["group"] = grps
            for s in w2_groups[g2]:
                sources[s]["group"] = grps
            grps += 1
            seen1.add(g1)
            seen2.add(g2)

        # groupify unmerged groups
        for g1 in xrange(len(w1_groups)):
            if g1 in seen1: continue
            for s in w1_groups[g1]:
                sources[s]["group"] = grps
            grps += 1
            seen1.add(g1)
        for g2 in xrange(len(w2_groups)):
            if g2 in seen2: continue
            for s in w2_groups[g2]:
                sources[s]["group"] = grps
            grps += 1
            seen2.add(g2)
                
    elif len(w1_groups) == 0:
        for i in xrange(len(w2_groups)):
            for s in w2_groups[i]:
                sources[s]["group"] = i
    elif len(w2_groups) == 0:
        for i in xrange(len(w1_groups)):
            for s in w1_groups[i]:
                sources[s]["group"] = i
    return sources


def px2ra(px):
    """Convert pixel separation to RA mas/yr separation"""
    return (px *
            -1 * # RA increases as PX decreases
            2.75 * # 2 arcseconds per unWISE pixel
            1000 * # 1000 arcseconds per mas
            365.2422 # days per year
            )


def px2dec(px):
    """Convert pixel separation to Dec mas/yr separation"""
    return (px *
            2.75 * # 2 arcseconds per unWISE pixel
            1000 * # 1000 arcseconds per mas
            365.2422 # days per year
            )


def measure_pm(sources):
    """Measure PM over groups of sources"""
    pms = []
    for i in xrange(np.max(sources["group"])+1):
        # Split sources by group
        group = sources[sources["group"] == i]

        # Split sources by band
        pmra = []; pmdec = []
        e_pmra = []; e_pmdec = []
        #for band in (1,2):
        for _ in range(1):
            subgroup = group#[group["band"] == band]
            if len(subgroup) <= 2: continue

            # h/t delta32
            # make the design matrix
            mjd = subgroup["mjdmean"]
            A = sm.add_constant(mjd)

            # OLS for RA
            b = subgroup["xe0"]

            fit_x = sm.OLS(b, A).fit()

            # OLS for Dec
            b = subgroup["ye0"]

            fit_y = sm.OLS(b, A).fit()
            pmra.append(fit_x.params[1])
            e_pmra.append(fit_x.bse[1])
            pmdec.append(fit_y.params[1])
            e_pmdec.append(fit_y.bse[1])
            
        pms.append((i,px2ra(np.mean(pmra)),px2dec(np.mean(e_pmra)),
                    px2dec(np.mean(pmdec)),px2dec(np.mean(e_pmdec))))
    if len(pms) == 0:
        return []
    return at.Table(rows=pms,
                    names=("group","pmra","e_pmra","pmdec","e_pmdec"),
                    dtype=("i4","f8","f8","f8","f8"))


def get_pms(ra,dec,size):
    """
    Takes RA, Dec (degrees, decimal)

    Returns tables of the coadds, detected sources, and proper motion measurements
    """
    print ra,dec,size
    # Get tiles
    tiles = api.list_tiles(ra,dec)

    # Just take the best one
    tile = tiles["tiles"][0]

    # TEMPORARY:
    # Debugging, just take a couple epoch for speed
    #tile["epochs"] = tile["epochs"][:4]

    # Coadds should already be sorted by mjdmean, but enforce here
    # This will prevent sorting a larger list of detected sources down the road
    tile["epochs"] = sorted(tile["epochs"],key=lambda x: x["mjdmean"])
    
    # Re-order coadds to split parallax-cancelling groups
    coadds = organize_coadds(tile)

    # Fetch cutouts
    coadds = fetch_cutouts(coadds,ra,dec,size)

    # Detect sources in cutouts
    sources = detect_sources(coadds)    

    # Group sources by proximity
    sources = group_sources(sources)
    
    # Measure PM across sources
    pms = measure_pm(sources)

    return coadds,sources,pms


def plot_sources(coadds,sources,path):
    """Plot sources over coadds in PDF"""
    pdf = PdfPages(path)
    # Build PDF
    cols = 3
    # Deduce # of rows
    rows = len(coadds)/cols
    if len(coadds)%cols != 0: rows += 1
    fig, farr = plt.subplots(rows,cols,
                             sharex="col",sharey="row")

    # Flatten array
    if len(farr) < len(coadds):
        farr = farr.reshape(len(farr)*cols)

    # Add coadds & overlay sources
    for i in xrange(len(coadds)):
        coadd = coadds[i]
        cut = aif.getdata(StringIO(coadd["cutout"]))

        farr[i].imshow(cut,origin="lower",aspect="equal",
                       interpolation="nearest",cmap="Greys")
        farr[i].set_title("band %d epoch %d"%(coadd["band"],coadd["epoch"]))
        srcs = sources[sources["coadd"] == i]
        farr[i].scatter(srcs["xcentroid"],srcs["ycentroid"],marker=".")

        for src in srcs:
            farr[i].annotate(
                src["group"],
                xy=(src["xcentroid"],src["ycentroid"]), xytext=(-10, 10),
                textcoords='offset points', ha='right', va='bottom',
                bbox=dict(boxstyle='round,pad=0.25', fc='yellow', alpha=0.5),
                arrowprops=dict(arrowstyle = '->', connectionstyle='arc3,rad=0'),
                fontsize=6)

    pdf.savefig(bbox_inches="tight")
    plt.close("all")
    """
    # List all proper motions
    if len(pms) != 0:
        txt = []
        for i in xrange(len(pms)):
            txt.append([str(k) for k in pms[i]])
        plt.table(cellText=txt,colLabels=("Group","Time Basis","pmRA (tot)","pmDec (tot)","pmRA","pmDec"),
                  loc="upper center")
        plt.axis("off")
        pdf.savefig(bbox_inches="tight")
        plt.close()
    """
    """
    # List all source positions and MJDMeans
    txt = []
    for i in xrange(len(global_sources)):
        for src in global_sources[i]:
            txt.append([str(i),str(src["mjdmean"]),str(src["ra"]),str(src["dec"])])
    plt.table(cellText=txt,colLabels=("Group","MJDMean","RA","Dec"),
              loc="upper center")
    plt.axis("off")
    pdf.savefig(bbox_inches="tight")
    plt.close()
    """
    
    pdf.close()


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("ra",type=float)
    ap.add_argument("dec",type=float)
    #ap.add_argument("band",type=int,choices=(1,2))
    ap.add_argument("size",type=int)
    ap.add_argument("pdfpath",type=str)
    args = ap.parse_args()

    coadds,sources,pms = get_pms(args.ra,args.dec,args.size)
    
    print sources
    print pms
    
    plot_sources(coadds,sources,args.pdfpath)

    
if __name__ == "__main__": main()
    

"""
Provide a coordinate-based lookup for ByW subjects

TODO: This all needs to be re-written to support WCS...
"""

import numpy as np
import astropy.table as at # need to do this first, or astropy will barf?
import astropy.io as aio
import wv.common.rdballtree as rdbt


# Field of View of a flipbook in degrees
byw_fov = np.sqrt(((0.0975*2)**2)*2)

# Hold all the subjects by center coordinate in a balltree
subject_tree = None


def get_subjects_by_coordinates(ra,dec):
    # Get subjects within fov
    res = subject_tree.query_radius(ra,dec,byw_fov)

    # Sort by nearest
    res = [(subject_tree.table["subject_id"][res[0][0][i]],res[1][0][i]) for i in xrange(len(res[0][0]))]
    
    return sorted(res,key=lambda x: x[1])


def read_cache(cachepath):
    """Read subjects from list on disk"""
    # Load subjects
    tbl = aio.ascii.Csv().read(cachepath)

    # Store in balltree (it's faster w/o a cache)
    rdtree = rdbt.rdtree(tbl,#filename="%s.rdbtcache"%cachepath,
                         rakey="ra",deckey="de")

    return rdtree


def __init(cachepath):
    """Populate subject_tree"""
    global subject_tree

    subject_tree = read_cache(cachepath)

__init("wsubcache.csv")

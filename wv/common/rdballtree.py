import os.path
import cPickle as pickle
import numpy as np
import sklearn.neighbors as skn

class rdtree:
    """
    Use sklearn's BallTree to do positional lookups.

    Support caching a pickled rdtree for faster subsequent loads
    """
    def __init__(self,table,filename=None,rakey="RA",deckey="DEC"):
        # Prep data
        self.table = table
        x = np.array(np.deg2rad([self.table[deckey],self.table[rakey]])).transpose()
        x = x.reshape(-1,2)

        # Test if cache file exists. If not, make noe
        if filename is not None and os.path.exists(filename):
            self.rdtree = pickle.load(open(filename,"rb"))
        else:
            self.rdtree = skn.BallTree(
                x,
                metric="haversine",
            )

        # Cache file doesn't exist. Write it
        if filename is not None and not os.path.exists(filename):
            pickle.dump(self.rdtree,open(filename,"wb"))

    def query_radius(self,ra,de,sep):        
        ra,de,sep = np.deg2rad(ra),np.deg2rad(de),np.deg2rad(sep)
        # TODO: all at once?
        x = np.array([[de,ra]])
        return self.rdtree.query_radius(x,sep,return_distance=True)


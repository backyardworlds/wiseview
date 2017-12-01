#!/usr/bin/python
# angsep.py
# Program to calculate the angular separation between two points
# whose coordinates are given in RA and Dec
# From angsep.py Written by Enno Middelberg 2001

from numpy import *

def angsep(ra1deg,dec1deg,ra2deg,dec2deg):
    """ Determine separation in degrees between two celestial objects 
        arguments are RA and Dec in decimal degrees. 
    """
    if abs(ra1deg-ra2deg) < 0.0000001 and abs(dec1deg-dec2deg) < 0.0000001:
        return 0.0
    ra1rad=deg2rad(ra1deg)
    dec1rad=deg2rad(dec1deg)
    ra2rad=deg2rad(ra2deg)
    dec2rad=deg2rad(dec2deg)

    # calculate scalar product for determination
    # of angular separation

    x=cos(ra1rad)*cos(dec1rad)*cos(ra2rad)*cos(dec2rad)
    y=sin(ra1rad)*cos(dec1rad)*sin(ra2rad)*cos(dec2rad)
    z=sin(dec1rad)*sin(dec2rad)
    
    rad=arccos(x+y+z) # Sometimes gives warnings when coords match

    # use Pythargoras approximation if rad < 1 arcsec
    # Is buggy when spanning RA 0/360 i think
    #sep = choose( rad<0.000004848 , (
    #sqrt((cos(dec1rad)*(ra1rad-ra2rad))**2+(dec1rad-dec2rad)**2),rad))
    sep = rad
    
    # Angular separation
    sep=rad2deg(sep)

    return sep

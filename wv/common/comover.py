import astroquery.vizier as viz
import astropy.coordinates as acoo
import astropy.units as u
import collections
import numpy as np

Vizier = viz.Vizier(columns=["*","pmRA","pmDE",
                             "e_pmRA","e_pmDE",
                             ],
                             keywords=["Proper_Motions"])
Vizier.ROW_LIMIT = -1

def query_region(ra,dec,radius):
    return Vizier.query_region(acoo.SkyCoord(ra=ra,dec=dec,
                                                 unit=(u.deg,u.deg),frame="icrs"),
                                   radius=acoo.Angle(radius, "deg"))

def select_keys(options,keys):
    for op in options:
        if op in keys:
            return op
    return None

def guess_unit(unit):
    keys = {
        "h:m:s":u.hourangle,
        "d:m:s":u.deg,
    }
    unit_ = str(unit).replace("\"","").lower()
    if unit_ in keys:
        return keys[unit_]
    raise ValueError("Unknown format '%s'"%unit)

def to_deg(val,unit):
    if val is None: return val
    if unit == u.deg or unit == "deg":
        return val
    if isinstance(unit,u.Unit):
        return acoo.Angle(val,unit).deg
    if isinstance(unit,u.UnrecognizedUnit):
        return acoo.Angle(val,guess_unit(unit)).deg
    raise ValueError("Unknown format '%s'"%unit)
def to_masyr(val,unit):
    if unit == "mas / yr":
        return val
    return (val*unit).to("mas/yr").value

PMEntryHeader = "cat,ra,e_ra,dec,e_dec,pmRA,e_pmRA,pmDE,e_pmDE"
class PMEntry(collections.namedtuple("PMEntry",PMEntryHeader)): pass

def extract_pm_entries(tables):
    entries = []
    badcats = []
    for t in tables:
        # CUT
        # Don't use allwise PM values
        if t.meta["name"] == "II/328/allwise":
            badcats.append((t.meta["name"],t.meta["description"],"Marc says ignore AllWISE"))
            continue
        keys = t.keys()
        rak = select_keys(("RAJ2000","RA_ICRS","_RA",
                           "RA2000","RA1950","RAB1950",
                           "RA1900","RAB1900"),keys)
        e_rak = select_keys(("e_RA","e_RAJ2000","e_RA_ICRS"),keys)
        dek = select_keys(("DEJ2000","DE_ICRS","_DE",
                           "DE2000","DE1950","DEB1950",
                           "DE1900","DEB1900"),keys)
        e_dek = select_keys(("e_DE","e_DEJ2000","e_DE_ICRS"),keys)
        if rak is None:
            badcats.append((t.meta["name"],t.meta["description"],"Unable to find RA column"))
            continue
        if dek is None:
            badcats.append((t.meta["name"],t.meta["description"],"Unable to find Dec column"))
            continue
        if "pmRA" not in keys:
            badcats.append((t.meta["name"],t.meta["description"],"Unable to find pmRA column"))
            continue            
        if "pmDE" not in keys:
            badcats.append((t.meta["name"],t.meta["description"],"Unable to find pmDE column"))
            continue            
        try:
            for entry in t:
                ra = to_deg(entry[rak],t[rak].info.unit)
                e_ra = to_deg(entry[e_rak],t[e_rak].info.unit) if e_rak is not None else None
                dec = to_deg(entry[dek],t[dek].info.unit)
                e_dec = to_deg(entry[e_dek],t[e_dek].info.unit) if e_dek is not None else None
                # Convert coordinate systems
                if "1950" in t[rak].info.name:
                    coo = acoo.SkyCoord(ra,dec,unit=u.deg,
                                        frame="fk5",equinox="B1950")
                    coo = coo.transform_to("icrs")
                    ra,dec = coo.ra,coo.dec
                elif "1900" in t[rak].info.name:
                    coo = acoo.SkyCoord(ra,dec,unit=u.deg,
                                        frame="fk5",equinox="B1900")
                    coo = coo.transform_to("icrs")
                    ra,dec = coo.ra,coo.dec
                pmRA = entry["pmRA"]
                pmDE = entry["pmDE"]
                # Ignore empty pmRA/pmDE rows
                if np.ma.is_masked(pmRA):
                    pmRA = 0
                if np.ma.is_masked(pmDE):
                    pmDE = 0
                if abs(pmRA) < 1 and abs(pmDE) < 1:
                    continue
                pmRA = to_masyr(pmRA,t["pmRA"].info.unit)
                pmDE = to_masyr(pmDE,t["pmDE"].info.unit)
                # CUT
                # Skip entries with e_pmRA or e_pmDE > 100mas/yr
                e_pmRA = None
                if "e_pmRA" in keys:
                    e_pmRA = entry["e_pmRA"]
                    if e_pmRA > 100:
                        continue
                e_pmDE = None
                if "e_pmDE" in keys:
                    e_pmDE = entry["e_pmDE"]
                    if e_pmDE > 100:
                        continue
                entries.append(
                    PMEntry(t.meta["name"],ra,e_ra,dec,e_dec,
                            pmRA,e_pmRA,pmDE,e_pmDE,
                    ))
        except ValueError,e:
            badcats.append((t.meta["name"],t.meta["description"],str(e)))
            continue
    return entries,badcats

def getsep(pme1,pme2):
    c1 = acoo.SkyCoord(pme1.ra,pme1.dec,unit=(u.deg,u.deg),frame="icrs")
    c2 = acoo.SkyCoord(pme2.ra,pme2.dec,unit=(u.deg,u.deg),frame="icrs")
    return c2.separation(c1)

def lb(pme1,pme2,sep):
    """
    R = pme1.pmRA
    T = pme1.pmDE
    AD = sep(pme1,pme2)
    LB_req = min((1000*(sqrt(R104^2+T104^2)/150)^3.8)/(60*AD104), 50)
    """
    lb_ = min((1000*(((((pme1.pmRA**2)+(pme1.pmDE**2))**(0.5))/150)**3.8))/(sep.arcsec),50)
    return lb_

def pmdiff(pme1,pme2):
    """
    pmmag_diff = SQRT((AG437-R437)^2+(AI437-T437)^2)
    """
    pmdiff = (((pme2.pmRA-pme1.pmRA)**2)+((pme2.pmDE-pme1.pmDE)**2))**(0.5)
    return pmdiff    
    
def get_entries_(ra,dec,pmRA,pmDE,radius=0.2,e_ra=None,e_dec=None,e_pmRA=None,e_pmDE=None):
    ent = PMEntry("Supplied",ra,e_ra,dec,e_dec,pmRA,e_pmRA,pmDE,e_pmDE)
    # Get all Vizier entries within radius of ra, dec
    tables = query_region(ra,dec,radius)
    # Find all rows with at least RA, Dec, pmRA, pmDE
    # Normalize until PMEntry objects
    entries,badcats = extract_pm_entries(tables)
    res = []
    for pme in entries:
        pmdiff_ = pmdiff(ent,pme)
        sep = getsep(ent,pme)
        lbcrit_ = lb(ent,pme,sep)
        res.append((
            # Entry
            pme,
            # Separation
            sep,
            # PM Diff
            pmdiff_,
            # LB Criteria
            lbcrit_,
            lbcrit_-pmdiff_,
            ))
    res = sorted(res,key=lambda k:k[4],reverse=True)
    return res,badcats

def stringify_entries(ents):
    res2 = [",".join([PMEntryHeader,"separation","pm_diff","lb_criterion","lb_minus_pm"])]
    for pme,sep,pmd,lbc,minus in ents:
        r = [str(k) for k in pme]
        r.append(sep.deg)
        r.append(pmd)
        r.append(lbc)
        r.append(minus)
        res2.append(",".join([str(k) for k in r]))
    return res2

def get_entries(ra,dec,pmRA,pmDE,radius=0.2,e_ra=None,e_dec=None,e_pmRA=None,e_pmDE=None):
    res,badcats = get_entries_(ra,dec,pmRA,pmDE,radius=radius,
                               e_ra=e_ra,e_dec=e_dec,e_pmRA=e_pmRA)
    return {"entries":stringify_entries(res),
            "failed catalogs":badcats,
            }

def main():
    print get_entries(195.174733,12.354089,-626.0,-41.7,0.01)

if __name__ == "__main__": main()

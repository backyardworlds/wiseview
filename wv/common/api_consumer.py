import requests


def list_tiles(ra,dec):
    tiles = requests.get("http://byw.tools/tiles?ra=%f&dec=%f"%
                         (ra,dec))
    return tiles.json()

def get_cutout(ra,dec,size,band,epoch):
    cutout = requests.get("http://byw.tools/cutout?ra=%f&dec=%f&size=%d&band=%d&epoch=%d"%
                          (ra,dec,size,band,epoch))
    return cutout.content


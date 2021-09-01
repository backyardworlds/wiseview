import boto3


bucket = None


def get_bucket(name="touchspot-astro",region="us-west-2"):
    s3 = boto3.resource("s3",region_name=region)
    return s3.Bucket(name)


def __init():
    global bucket
    bucket = get_bucket()


__init()

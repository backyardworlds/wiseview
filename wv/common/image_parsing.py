import numpy as np
import astropy.visualization as av
import skimage.exposure
import skimage.filters
import scipy.ndimage

def find_outlier_pixels(data,tolerance=3):
    """https://stackoverflow.com/questions/18951500/automatically-remove-hot-dead-pixels-from-an-image-in-python"""
    # Scale 0 to 1
    data = skimage.exposure.exposure.rescale_intensity(data,out_range=(0,1))
    
    blurred = scipy.ndimage.median_filter(data, size=3, mode="reflect")

    difference = data - blurred
    threshold = tolerance*np.std(difference)

    #find the hot pixels, but ignore the edges
    #hot_pixels = np.nonzero((np.abs(difference[1:-1,1:-1])>threshold))
    #hot_pixels = np.array(hot_pixels) + 1
    hot_pixels = np.nonzero((np.abs(difference)>threshold))

    fixed_image = np.copy(data) #This is the image with the hot pixels removed
    for y,x in zip(hot_pixels[0],hot_pixels[1]):
        fixed_image[y,x]=blurred[y,x]

    return hot_pixels,fixed_image

def shrink(arr,bounds=None,ax=None):
    if bounds is None:
        low = np.min(arr)
        high = np.max(arr)
    else:
        low,high = bounds
        
    # Rescale arr to 0,1
    arr_ = skimage.exposure.exposure.rescale_intensity(arr,in_range=(low,high),out_range=(0,1))

    # Remove hot pixels
    #hot,arr_ = find_outlier_pixels(arr_,tolerance=10)
    
    # Asinh stretch arr_
    stretch = av.AsinhStretch(0.005)
    arr_ = stretch(arr_)
    
    # Remove pixels again
    #hot,arr_ = find_outlier_pixels(arr_,tolerance=3)

    # Rescale arr_ to -1,1
    arr_ = skimage.exposure.exposure.rescale_intensity(arr_,out_range=(-1,1))
    
    # Find edges
    edge = skimage.filters.scharr(arr_)
    
    # Rescale edge to 0,1
    edge = skimage.exposure.exposure.rescale_intensity(edge,out_range=(0,1))
    
    # Asinh stretch edges
    #stretch = av.AsinhStretch(0.1)
    #edge = stretch(edge)

    # Rescale 
    avg = np.average(arr,weights=edge)
    dist = avg-arr
    dist = (1-edge)*dist
    res = arr+dist
        
    # Map low and high back to old scale
    return arr[np.unravel_index(res.argmin(), res.shape)],arr[np.unravel_index(res.argmax(), res.shape)]

def simple(arr,linear=0.00001):
    # Rescale arr to 0,1
    scaled_arr = skimage.exposure.exposure.rescale_intensity(arr,out_range=(0,1))

    # Remove hot pixels
    hot,filt_arr = find_outlier_pixels(scaled_arr,tolerance=10)
    
    # Asinh stretch arr
    stretch = av.AsinhStretch(linear)
    stretched_arr = stretch(filt_arr)
    
    # Remove pixels again
    hot,stretched_arr = find_outlier_pixels(stretched_arr,tolerance=3)
    
    return stretched_arr

def complex(arr,mode,linear=0.00001,trimbright=100.0):
    # shrink
    if mode == "adapt":
        bounds = shrink(arr)
    elif mode == "percent":
        bounds = np.min(arr),np.percentile(arr,trimbright)
    elif mode == "fixed":
        bounds = np.min(arr),trimbright
    else:
        raise Exception("Mode %s not supported"%mode)

    # Rescale arr to 0,1
    arr = skimage.exposure.exposure.rescale_intensity(arr,in_range=bounds,out_range=(0,1))

    # Remove hot pixels
    #hot,arr = find_outlier_pixels(arr,tolerance=10)
    
    # Asinh stretch arr
    stretch = av.AsinhStretch(linear)
    arr = stretch(arr)
    
    # Remove pixels again
    #hot,arr = find_outlier_pixels(arr,tolerance=3)

    # floating point stuff can bump values outside 0,1. re-force:
    arr = skimage.exposure.exposure.rescale_intensity(arr,out_range=(0,1))
    
    
    return arr

var url = "/convert?";

function mjd_to_aarondate(mjd) {
    d = new Date(-3506716800000+(mjd*86400000))
    return d.getFullYear()+"."+(((d.getMonth()/12.0)*10).toPrecision(1))
}


function arr_flat(arr) {
    return arr.reduce((acc, val) => acc.concat(val), []);
}


function arr_mean(arr) {
    return arr.reduce((acc, val) => acc+val) / arr.length
}


function median(arr) {
    const mid = Math.floor(arr.length / 2),
	  nums = [...arr].sort((a, b) => a - b);
    return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function average(list) {
    res = list[0]
    for (var i = 1; i < list.length; i ++) {
	res = res.add(list[i]);
    }
    return res.divide(list.length);
}


function asinh(x) {
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/asinh
    return nj.log(x.add(nj.sqrt(x.multiply(x).add(1))));
}


function asinh_stretch(x,a) {
    // stretch array x w/ linearity a
    // https://docs.astropy.org/en/stable/api/astropy.visualization.AsinhStretch.html
    return asinh(x.divide(a)).divide(asinh(nj.ones(x.shape,"float32").divide(a)));
}


function weighted_average(list,weights) {
    if (list.length == 1) {
	return list[0];
    }
    
    res = null;
    weights_sum = null;
    for (var i = 0; i < list.length; i++) {
	if (res == null) {
	    res = list[i].multiply(weights[i]);
	    weights_sum = weights[i];
	} else {
	    res = res.add(list[i].multiply(weights[i]));
	    weights_sum = weights_sum.add(weights[i]);
	}
    }
    
    return res.divide(weights_sum.add(0.0000001)); // Guard against 0
}


function symlog10 (x) {
    // return x;
    if (x == 0) {
	return 0;
    } else if (x < 0) {
	return -Math.log10(-x);
    } else {
	return Math.log10(x);
    }
}


function symexp10 (x) {
    // return x;
    if (x == 0) {
	return 0;
    } else if (x < 0) {
	return -(10**(-x));
    } else {
	return 10**x;
    }
}


function mjd_to_aarondate (mjd) {
    d = new Date(-3506716800000+(mjd*86400000))
    return d.getFullYear()+"."+(d.getMonth()/12.0).toFixed(1).substring(2)
}


function Memoizer (size) {
    this.size = size;
    this.keys = []
    this.cache = {}
    
    this.key = function () {
	return JSON.stringify(arguments);
    };
    
    this.add = function (k,v) {
	this.keys.push(k);

	if (this.keys.length = this.size) {
	    // Remove oldest item from cache
	    delete this.cache[this.keys.shift()];
	}
    };

    this.get = function (k) {
	return this.cache[k];
    };
}


function ComplicatedSlider (name) {
    // honestly...
    var that = this;
    this.name = name;
    this.elem = jQuery("#"+this.name+"Input");
    this.im_minbright = null; // Filled in from image min
    this.im_maxbright = null; // Filled in from image max
    
    this.elem.slider({
	range: true,
	min: 0.0,
	max: 100.0,
	values: [0.0, 100.0],
	slide: function(event, ui) {
	    that.minbright = symexp10(ui.values[0])
	    that.maxbright = symexp10(ui.values[1])
	    jQuery("#"+that.name+"Value").text(
		Math.round(symexp10(ui.values[0])) + " - "
		    + Math.round(symexp10(ui.values[1])));
	}
    });
    
    this.update_limits = function (min,max) {
	this.im_minbright = min; this.im_maxbright = max;
	this.elem.slider("option","min",symlog10(min));
	this.elem.slider("option","max",symlog10(max));
	this.elem.slider("option","step",
				     (Math.abs(symlog10(max))+Math.abs(symlog10(min)))/1000.);
    };
    
    this.update_values = function (low,high) {
	var low_ = parseFloat(low),
	    high_ = parseFloat(high);
	/*
	if (typeof low == "string" && low.includes("%")) {
	    low_ = (low_/100.0)*(this.im_maxbright-this.im_minbright)+this.im_minbright
	}
	if (typeof high == "string" && high.includes("%")) {
	    high_ = (high_/100.0)*(this.im_maxbright-this.im_minbright)+this.im_minbright
	}*/
	
	this.elem.slider("option","values",[symlog10(low_),symlog10(high_)]);
	jQuery("#"+this.name+"Value").text(Math.round(low_)+" - "+Math.round(high_));
    };

    this.low = function () {
	return this.elem.slider("option","values")[0];
    };
    
    this.high = function () {
	return this.elem.slider("option","values")[1];
    };

    this.disable = function () {
	return this.elem.slider("disable");
    };

    this.enable = function () {
	return this.elem.slider("enable");
    };

}


function WiseSwapper () {
    var this_ = this, that = this;

    this.overlay_scale = 10;
    this.border_width = 3;
    
    this.coadd_cache = new Memoizer(32);
    
    this.reset_locals = function () {
	this.versions = [];
	this.epoch_legend = [];
	this.window_epochs = {
	    1: [],
	    2: []
	};
	this.window_antiepochs = {
	    1: [],
	    2: []
	};
	this.global_mjds = [];
	this.window_mjds = {
	    1: [],
	    2: []
	};
	this.cutouts = {
	    1: [],
	    2: []
	};
	this.pos_ims = {
	    1: [],
	    2: []
	};
	this.neg_ims = {
	    1: [],
	    2: []
	};
	this.covmaps = {
	    1: [],
	    2: []
	};
	this.images = [];
	this.headers = {
	    1: [],
	    2: []
	};
	this.overlays = {};
	this.overlays_enable = {};
	// Mouse state tracking within canvas
	this.canvas_mouse = {
	    down: false,
	    drawing: false,
	    x:0, y:0,
	    startX: 0, startY: 0,
	    sep: 0
	};
    };

    this.reset_locals()

    // UI Elements
    this.container = jQuery("#image");
    this.loc_input = jQuery("#locInput");
    this.size_input = jQuery("#sizeInput");
    this.band_input = jQuery("#bandInput");

    // Make Stretch (linear) slider
    this.linear_input = jQuery("#linearInput");
    this.linear_input.slider({
	min: 0.0, max: 1.0,
	step: (1.0-0.0) / 1000.0,
	value: 1.0,
	slide: function(event, ui) {
	    jQuery("#linearValue").text(ui.value.toFixed(4));
	}
    });
    this.update_linear_input = function (v) {
	this.linear_input.slider("option","value",v);
	jQuery("#linearValue").text(v.toFixed(3));
    };
    
    this.trimbright = new ComplicatedSlider("trimbright");
    this.diffbright = new ComplicatedSlider("diffbright");
    

    // Make the window slider element
    this.window_input = jQuery("#windowInput");
    this.window_input.slider({
	min: 0.0,
	max: 10.0,
	value: 0.0,
	slide: function(event, ui) {
	    jQuery("#windowValue").text(ui.value.toFixed(2));
	}
    });
    this.updateWindowLimits = function (max) {
	this.window_input.slider("option","max",max);
	this.window_input.slider("option","step",max/1000.0);
    };
    this.updateWindowValue = function (val) {
	this.window_input.slider("option","value",val);
	jQuery("#windowValue").text(val.toFixed(2));
    };

    // Make the window slider element
    this.diff_window_input = jQuery("#diffWindowInput");
    this.diff_window_input.slider({
	min: 0.0,
	max: 10.0,
	value: 0.0,
	slide: function(event, ui) {
	    jQuery("#diffWindowValue").text(ui.value.toFixed(2));
	}
    });
    this.updateDiffWindowLimits = function (max) {
	this.diff_window_input.slider("option","max",max);
	this.diff_window_input.slider("option","step",max/1000.0);
    };
    this.updateDiffWindowValue = function (val) {
	this.diff_window_input.slider("option","value",val);
	jQuery("#diffWindowValue").text(val.toFixed(2));
    };

        
    this.color_input = jQuery("#colorInput");

    this.speed_input = jQuery("#speedInput");
    this.speed_input.slider({
	min: 20.0, max: 1000.0,
	step: (1000.0-20.0) / 1000.0,
	value: 500.0,
	slide: function(event, ui) {
	    jQuery("#speedValue").text(Math.round(ui.value));
	    that.updateSpeed();
	}
    });
    this.update_speed_input = function (val) {
	this.speed_input.slider("option","value",val);
	jQuery("#speedValue").text(val.toFixed(2));
    };
    
    this.zoom_input = jQuery("#zoomInput");
    this.zoom_input.slider({
	min: 0.5, max: 20.0,
	step: (20.0-0.5)/((20.0-0.5)*2),
	value: 9.0,
	slide: function(event, ui) {
	    jQuery("#zoomValue").text(ui.value.toFixed(1));
	    that.updateZoom(ui.value);
	}
    });
    this.update_zoom_input = function (val) {
	this.zoom_input.slider("option","value",val);
	jQuery("#zoomValue").text(val.toFixed(1));
	this.updateZoom(val);
    };
    
    this.ver_output = jQuery("#verValue");
    this.canvas = jQuery("#daCanvas");
    this.context = this.canvas.get(0).getContext("2d");
    this.over_canvas = jQuery("#overlayCanvas");
    this.over_context = this.over_canvas.get(0).getContext("2d");
    this.rebase_input = jQuery("#rebaseInput");
    this.rebase_e_input = jQuery("#rebaseEInput");
    this.border_input = jQuery("#borderInput");
    this.gaia_input = jQuery("#gaiaInput");
    this.adv_input = jQuery("#advInput");
    this.invert_input = jQuery("#invertInput");
    this.maxdyr_input = jQuery("#maxdyrInput");
    this.scandir_input = jQuery("#scandirInput");
    this.neowise_only_input = jQuery("#neowiseOnlyInput");
    this.diff_input = jQuery("#diffInput");
    this.manual_bright_input = jQuery("#manualBrightInput");
    this.outer_epochs_input = jQuery("#outerEpochsInput");
    this.unique_windows_input = jQuery("#uniqueWindowInput");
    this.smooth_scan_input = jQuery("#smoothScanInput");
    this.smooth_phase_input = jQuery("#smoothPhaseInput");
    this.smooth_band_input = jQuery("#smoothBandInput");
    this.shift_input = jQuery("#shiftInput");
    this.pmra_input = jQuery("#pmraInput");
    this.pmdec_input = jQuery("#pmdecInput");
    this.synth_a_input = jQuery("#synthAInput");
    this.synth_a_sub_input = jQuery("#synthASubInput");
    this.synth_a_ra_input = jQuery("#synthARaInput");
    this.synth_a_dec_input = jQuery("#synthADecInput");
    this.synth_a_w1_input = jQuery("#synthAW1Input");
    this.synth_a_w2_input = jQuery("#synthAW2Input");
    this.synth_a_pmra_input = jQuery("#synthAPmraInput");
    this.synth_a_pmdec_input = jQuery("#synthAPmdecInput");
    this.synth_a_mjd_input = jQuery("#synthAMjdInput");
    this.synth_b_input = jQuery("#synthBInput");
    this.synth_b_sub_input = jQuery("#synthBSubInput");
    this.synth_b_ra_input = jQuery("#synthBRaInput");
    this.synth_b_dec_input = jQuery("#synthBDecInput");
    this.synth_b_w1_input = jQuery("#synthBW1Input");
    this.synth_b_w2_input = jQuery("#synthBW2Input");
    this.synth_b_pmra_input = jQuery("#synthBPmraInput");
    this.synth_b_pmdec_input = jQuery("#synthBPmdecInput");
    this.synth_b_mjd_input = jQuery("#synthBMjdInput");
    

    this.updateSpeed = function () {
        clearInterval(this.interval);
        this.interval = setInterval(this.frame.bind(this), +this.speed_input.slider("option","value"));
        this.updateUrl();
    };


    this.buildUrl = function (ra, dec, size=null, zoom=null, diff=null, manual_bright=null) {
	if (size === null) {
	    size = this.size_input.val();
	}
	if (zoom === null) {
	    zoom = this.zoom_input.slider("option","value");
	}
	if (diff === null) {
	    diff = this.diff_input.prop("checked") ? 1 : 0;
	}
	if (manual_bright === null) {
	    manual_bright = this.manual_bright_input.prop("checked") ? 1 : 0;
	}
        var args = {
	    ra: ra,
	    dec: dec, 
	    size: size, 
	    band: this.band_input.val(), 
	    speed: this.speed_input.slider("option","value"),
	    minbright: symexp10(this.trimbright.low()).toFixed(4),
	    maxbright: symexp10(this.trimbright.high()).toFixed(4),
	    mindiff: symexp10(this.diffbright.low()).toFixed(4),
	    maxdiff: symexp10(this.diffbright.high()).toFixed(4),
	    window: this.window_input.slider("option","value"),
	    diff_window: this.diff_window_input.slider("option","value"),
	    linear: this.linear_input.slider("option","value"),
	    color: this.color_input.val(),
	    zoom: zoom,
	    rebase: this.rebase_input.prop("checked") ? 1 : 0,
	    rebase_e: this.rebase_e_input.prop("checked") ? 1 : 0,
	    border: this.border_input.prop("checked") ? 1 : 0,
	    gaia: this.gaia_input.prop("checked") ? 1 : 0,
	    adv: this.adv_input.prop("checked") ? 1 : 0,
	    invert: this.invert_input.prop("checked") ? 1 : 0,
	    maxdyr: this.maxdyr_input.prop("checked") ? 1 : 0,
	    scandir: this.scandir_input.prop("checked") ? 1 : 0,
	    neowise: this.neowise_only_input.prop("checked") ? 1 : 0,
	    diff: diff,
	    manual_bright: manual_bright,
	    outer_epochs: this.outer_epochs_input.prop("checked") ? 1 : 0,
	    unique_window: this.unique_windows_input.prop("checked") ? 1 : 0,
	    smooth_scan: this.smooth_scan_input.prop("checked") ? 1 : 0,
	    smooth_phase: this.smooth_phase_input.prop("checked") ? 1 : 0,
	    smooth_band: this.smooth_band_input.prop("checked") ? 1 : 0,
	    shift: this.shift_input.prop("checked") ? 1 : 0,
	    pmra: this.pmra_input.val(),
	    pmdec: this.pmdec_input.val(),
	    synth_a: this.synth_a_input.prop("checked") ? 1 : 0,
	    synth_a_sub: this.synth_a_sub_input.prop("checked") ? 1 : 0,
	    synth_a_ra: this.synth_a_ra_input.val(),
	    synth_a_dec: this.synth_a_dec_input.val(),
	    synth_a_w1: this.synth_a_w1_input.val(),
	    synth_a_w2: this.synth_a_w2_input.val(),
	    synth_a_pmra: this.synth_a_pmra_input.val(),
	    synth_a_pmdec: this.synth_a_pmdec_input.val(),
	    synth_a_mjd: this.synth_a_mjd_input.val(),
	    synth_b: this.synth_b_input.prop("checked") ? 1 : 0,
	    synth_b_sub: this.synth_b_sub_input.prop("checked") ? 1 : 0,
	    synth_b_ra: this.synth_b_ra_input.val(),
	    synth_b_dec: this.synth_b_dec_input.val(),
	    synth_b_w1: this.synth_b_w1_input.val(),
	    synth_b_w2: this.synth_b_w2_input.val(),
	    synth_b_pmra: this.synth_b_pmra_input.val(),
	    synth_b_pmdec: this.synth_b_pmdec_input.val(),
	    synth_b_mjd: this.synth_b_mjd_input.val()
        };
	return jQuery.param(args);
    };
    
    
    this.updateUrl = function () {
	// Update URI parameters from values in DOM
        var loc_split = this.parseLoc(); // RA, Dec
        if (loc_split !== null) {
            window.location.hash = this.buildUrl(loc_split[0], loc_split[1]);
	}
    };

    /*
    this.updateOtherSliders = function () {
        this.linear_output.text((this.linear_input.val()))
        //this.trimbright_output.text((this.trimbright_input.val()))
        this.updateUrl();
    }*/

    
    this.updateZoom = function (zoom) {
        if (!this.real_img_size) {
	    // Make a guess on panstarrs size
	    var fov = this.size_input.val(),
		zoom = this.zoom_input.slider("option","value");
	    jQuery("#pawnstars img").width((fov/2.75) * zoom).height((fov/2.75) * zoom)
	    return;
        }

        var size = this.size_input.val();
	// TODO: Is this needed? =>
        //this.canvas.attr("width", this.real_img_size[0]).attr("height", this.real_img_size[1]);

	if (zoom === undefined) {
            zoom = this.zoom_input.slider("option","value");
	}

        this.canvas.css("width", this.real_img_size[0] * zoom).css("height", this.real_img_size[1] * zoom);
        this.over_canvas.css("width", this.real_img_size[0] * zoom).css("height", this.real_img_size[1] * zoom);

	var maxsz = Math.max(this.real_img_size[0],this.real_img_size[1]);
	jQuery("#pawnstars img").width(maxsz * zoom).height(maxsz * zoom)

        this.updateUrl();
        this.draw();
    };

    
    this.updatePawnstars = function () {
        var loc_split = this.parseLoc();
	if (loc_split === null) { return; }

        jQuery.getJSON("/pawnstars", {
	    "ra": loc_split[0],
	    "dec": loc_split[1],
	    "size": this.size_input.val()*4 // arcseconds to pixels
        }, function (response) {
	    var new_img = document.createElement("img");
	    new_img.setAttribute("src", response)
	    jQuery("#pawnstars").empty().append(new_img);
	    that.updateZoom()
        });
    };

    
    this.updateZooiSubjects = function () {
        var loc_split = this.parseLoc();
	if (loc_split === null) {
	    return;
	}
        jQuery.getJSON("/xref", {
	    "ra": loc_split[0],
	    "dec": loc_split[1]
        }, function (response) {
	    var zs = jQuery("#zooiSubjects");
	    
	    // Clear subjects
	    zs.empty();

	    // Rebuild subjects
	    if (response["ids"].length > 0) {
		response["ids"].forEach(function (v) {
		    var new_a = document.createElement("a");
		    new_a.setAttribute("href","https://www.zooniverse.org/projects/marckuchner/backyard-worlds-planet-9/talk/subjects/"+v);
		    new_a.innerText = v;
		    zs.append(new_a);
		})
	    } else {
		zs.append(document.createTextNode("None"))
	    }
        })

	// Build links
        jQuery("#legacySurvey")[0].setAttribute("href","http://legacysurvey.org/viewer?ra="+loc_split[0]+"&dec="+loc_split[1]+"&zoom=13&layer=unwise-neo4");
	jQuery("#pawnstarsLink")[0].setAttribute("href","https://ps1images.stsci.edu/cgi-bin/ps1cutouts?pos="+loc_split[0]+"+"+loc_split[1]+"&filter=color&filter=g&filter=r&filter=i&filter=z&filter=y&filetypes=stack&auxiliary=data&size=240&output_size=0&verbose=0&autoscale=99.500000&catlist=");
	jQuery("#simbad")[0].setAttribute("href","http://simbad.u-strasbg.fr/simbad/sim-coo?Coord="+loc_split[0]+"%20"+loc_split[1]+"&Radius=10&Radius.unit=arcsec&coodisp1=d2&list.pmsel=on&list.plxsel=on&list.rvsel=on&list.bibsel=off&list.notesel=off&output.format=HTML");
	jQuery("#vizier")[0].setAttribute("href","http://vizier.u-strasbg.fr/viz-bin/VizieR?-c="+loc_split[0]+"%20"+loc_split[1]+"&-c.rs=10&-out.add=_r&-sort=_r");
        
    }


    this.__setDefaults = function () {
        this.update_linear_input(1.0);

	// Update trimbright UI element
	this.minbright = "-50px";
	this.maxbright = "500px";
	this.trimbright.update_values(this.minbright,this.maxbright);

	// Update trimbright UI element
	this.mindiff = "-50px";
	this.maxdiff = "500px";
	this.diffbright.update_values(this.mindiff,this.maxdiff);

	// Update window UI element
	this.updateWindowValue(.75);
	this.updateDiffWindowValue(0);

	this.shift_input.prop("checked", false);
        this.pmra_input.val(0);
        this.pmdec_input.val(0);
        this.rebase_input.prop("checked", false);
        this.rebase_e_input.prop("checked", false);
        this.border_input.prop("checked", false);
        this.gaia_input.prop("checked", false);
        this.invert_input.prop("checked", true);
        this.maxdyr_input.prop("checked", false);
        this.scandir_input.prop("checked", false);
        this.neowise_only_input.prop("checked", false);
        this.diff_input.prop("checked", false);
        this.manual_bright_input.prop("checked", false);
        this.outer_epochs_input.prop("checked", false);
        this.unique_windows_input.prop("checked", true);
        this.smooth_scan_input.prop("checked", false);
        this.smooth_phase_input.prop("checked", false);
        this.smooth_band_input.prop("checked", false);
        this.synth_a_input.prop("checked", false);
	this.synth_a_sub.input.prop("checked", false);
	this.synth_a_ra.input.val();
	this.synth_a_dec.input.val();
	this.synth_a_w1.input.val();
	this.synth_a_w2.input.val();
	this.synth_a_pmra.input.val(0);
	this.synth_a_pmdec.input.val(0);
	this.synth_a_mjd.input.val();
        this.synth_b_input.prop("checked", false);
	this.synth_b_sub.input.prop("checked", false);
	this.synth_b_ra.input.val();
	this.synth_b_dec.input.val();
	this.synth_b_w1.input.val();
	this.synth_b_w2.input.val();
	this.synth_b_pmra.input.val(0);
	this.synth_b_pmdec.input.val(0);
	this.synth_b_mjd.input.val();
    };

    this.setDefaults = function () {
	this.__setDefaults();
        this.update_zoom_input(9);
	this.restart();
    };

    this.setDiff = function () {
	this.__setDefaults();
	this.diff_input.prop("checked", true);
	this.restart();
    };

    this.setPrePost = function () {
	this.__setDefaults();
	this.outer_epochs_input.prop("checked", true);
	this.restart();
    };

    this.setParallaxEnhancing = function () {
	this.__setDefaults();
	this.scandir_input.prop("checked", true);
	this.restart();
    };

    this.setTimeResolved = function () {
	this.__setDefaults();
	this.updateWindowValue(0);
	this.restart();
    };
    
    this.setJam = function () {
	var mid = 0,
	    newlow = ((symexp10(this.diffbright.low())-mid)/2)+mid,
	    newhigh = ((symexp10(this.diffbright.high())-mid)/2)+mid;
	this.diffbright.update_values(newlow,newhigh)
	this.restart();
    };
    
    this.setPPBright = function () {
	this.__setDefaults();
	this.trimbright.update_values(-4000,4000)
	this.diffbright.update_values(-50,100000)
	this.diff_input.prop("checked", true);
        this.manual_bright_input.prop("checked", true);
        this.neowise_only_input.prop("checked", true);
        this.outer_epochs_input.prop("checked", true);
        this.unique_windows_input.prop("checked", true);
	this.restart();
    };
    
    this.setPPFaint = function () {
	this.__setDefaults();
	this.trimbright.update_values(-750,750)
	this.diffbright.update_values(-50,4000)
	this.diff_input.prop("checked", true);
        this.manual_bright_input.prop("checked", true);
        this.neowise_only_input.prop("checked", true);
        this.outer_epochs_input.prop("checked", true);
        this.unique_windows_input.prop("checked", true);
	this.restart();
    };
    
    this.fromUrl = function () {
	// Get parameters from URI
        var raw = window.location.hash.substr(1);
        var map = {};
        raw.split("&").forEach(function (kv) {
	    var split = kv.split("=");
	    map[split[0]] = split[1];
        });
	if (map.ra === undefined && map.dec === undefined) {
	    this.loc_input.val("133.786245 -7.244372");
	} else {
            this.loc_input.val(unescape(map.ra) + " " + unescape(map.dec));
	}
	if (map.size > 2000) {
	    map.size = 2000;
	}
        this.size_input.val(map.size || 176);
	
        this.band_input.val(map.band || 2);
        this.update_speed_input(Number(map.speed) || 500);
        //this.color_input.val(map.color || "gray");
        
        this.update_linear_input((Number(map.linear) || 1.0));

	// Update trimbright UI element
	this.minbright = map.minbright || "-50px";
	this.maxbright = map.maxbright || "500px";
	this.trimbright.update_values(this.minbright,this.maxbright);

	// Update trimbright UI element
	this.mindiff = map.mindiff || "-50px";
	this.maxdiff = map.maxdiff || "500px";
	this.diffbright.update_values(this.mindiff,this.maxdiff);

	// Update window UI element
	this.updateWindowValue(Number(map.window) || 0.5);
	this.updateDiffWindowValue(Number(map.diff_window) || 1.0);
	    
        this.rebase_input.prop("checked", (map.rebase || 0) == 1);
        this.rebase_e_input.prop("checked", (map.rebase_e || 0) == 1);
        this.border_input.prop("checked", (map.border || 0) == 1);
        this.gaia_input.prop("checked", (map.gaia || 0) == 1);
        this.adv_input.prop("checked", (map.adv || 0) == 1);
        this.invert_input.prop("checked", (map.invert || 1) == 1);
        this.maxdyr_input.prop("checked", (map.maxdyr || 0) == 1);
        this.scandir_input.prop("checked", (map.scandir || 0) == 1);
        this.neowise_only_input.prop("checked", (map.neowise || 0) == 1);
        this.diff_input.prop("checked", (map.diff || 0) == 1);
        this.manual_bright_input.prop("checked", (map.manual_bright || 1) == 1);
        this.outer_epochs_input.prop("checked", (map.outer_epochs || 0) == 1);
        this.unique_windows_input.prop("checked", (map.unique_window || 1) == 1);
        this.smooth_scan_input.prop("checked", (map.smooth_scan || 0) == 1);
        this.smooth_phase_input.prop("checked", (map.smooth_phase || 0) == 1);
        this.smooth_band_input.prop("checked", (map.smooth_band || 0) == 1);
	this.shift_input.prop("checked", (map.shift || 0) == 1);
        this.pmra_input.val(map.pmra || 0);
        this.pmdec_input.val(map.pmdec || 0);
        this.update_zoom_input((Number(map.zoom) || 9));
        this.synth_a_input.prop("checked", (map.synth_a || 0) == 1);
        this.synth_a_sub_input.prop("checked", (map.synth_a_sub || 0) == 1);
        this.synth_a_ra_input.val(map.synth_a_ra || "");
        this.synth_a_dec_input.val(map.synth_a_dec || "");
        this.synth_a_w1_input.val(map.synth_a_w1 || "");
        this.synth_a_w2_input.val(map.synth_a_w2 || "");
        this.synth_a_pmra_input.val(map.synth_a_pmra || 0);
        this.synth_a_pmdec_input.val(map.synth_a_pmdec || 0);
	this.synth_a_mjd_input.val(map.synth_a_mjd || "");
        this.synth_b_input.prop("checked", (map.synth_b || 0) == 1);
        this.synth_b_sub_input.prop("checked", (map.synth_b_sub || 0) == 1);
        this.synth_b_ra_input.val(map.synth_b_ra || "");
        this.synth_b_dec_input.val(map.synth_b_dec || "");
        this.synth_b_w1_input.val(map.synth_b_w1 || "");
        this.synth_b_w2_input.val(map.synth_b_w2 || "");
        this.synth_b_pmra_input.val(map.synth_b_pmra || 0);
        this.synth_b_pmdec_input.val(map.synth_b_pmdec || 0);
	this.synth_b_mjd_input.val(map.synth_b_mjd || "");

        this.restart();
    };

    
    this.parseLoc = function () {
        var loc = unescape(this.loc_input.val());
	var hms = /([0-9]{1,2})[ :h]([0-9]{1,2})[ :m]([0-9\.]+)[s]{0,1}[ \t]*([-+]{0,1})[ \t]*([0-9]{1,2})[ :d]([0-9]{1,2})[ :m]([0-9\.]+)[ s]*/g.exec(loc),
	    degrees = /([0-9\.]+).*?([+\-]{0,1}[0-9\.]+)/g.exec(loc);
	if (hms !== null) {
	    ra = (parseFloat(hms[1])/24)*360+((parseFloat(hms[2])/60)*(360/24))+((parseFloat(hms[3]/3600)*(360/24)));
	    dec = parseFloat(hms[5])+parseFloat(hms[6])/60+parseFloat(hms[7]/3600);
	    if (hms[4] == "-") {
		dec = -dec;
	    }
	    return [ra, dec];
	} else if (degrees !== null) {
	    return [parseFloat(degrees[1].trim()), parseFloat(degrees[2].trim())];
	}
	return null;
    };

    
    this.reset = function () {
        clearInterval(this.interval);
	this.reset_locals();
        this.cur_img = NaN;
        jQuery("#pawnstars").empty();
	// Clean inputs
	// TODO
    };

    
    this.advance = function () {
        if (this.images.length == 0) {
	    // Nothing to do yet
	    return;
        }
        if (isNaN(this.cur_img)) {
	    this.cur_img = 0
        } else {
	    this.cur_img = (this.cur_img + 1) % this.images.length;
        }

	// Update epoch labels at the top
        this.ver_output.text(this.versions[this.cur_img]);

	// Update epoch legend at the side
	jQuery("#epoch-legend").text(this.epoch_legend[this.cur_img]);

	// Draw border for epoch 0 if option set
        if (!this.border_input.prop("checked")) {
	    this.canvas.css("border",this.border_width+"px solid rgba(0,0,0,0)");
	    this.over_canvas.css("border",this.border_width+"px solid rgba(0,0,0,0)");
        } else if (this.cur_img == 0) {
	    this.canvas.css("border",this.border_width+"px dashed #999999");
	    this.over_canvas.css("border",this.border_width+"px dashed #999999");
	    jQuery("#pawnstars img").css("border",this.border_width+"px dashed #000000");
        } else {
	    this.canvas.css("border",this.border_width+"px solid rgba(0,0,0,0)");
	    this.over_canvas.css("border",this.border_width+"px solid rgba(0,0,0,0)");
	    jQuery("#pawnstars img").css("border",this.border_width+"px dashed #000000");
        }
    };

    
    this.draw = function () {
        if (!isNaN(this.cur_img)) {
	    var image = this.images[this.cur_img];
	    //this.context.drawImage(image, 0, 0);
	    this.context.putImageData(image,0,0);
	    //this.over_context.putImageData(new ImageData(1,1),0,0);
	    this.over_context.clearRect(0,0,this.over_canvas.width()*this.overlay_scale,this.over_canvas.height()*this.overlay_scale);
	    //this.over_context.beginPath()
	    //this.over_context.fillStyle = "rgba(0, 0, 0, 0)";
	    //this.over_context.fillRect(0,0,this.over_canvas.width(),this.over_canvas.height());
	    
	    //console.log(this.overlays)
	    // TODO: YOU WHERE HERE. whys it making the canvas larger and blank?
	    
	    for (var ovr in this.overlays) {
		if ((this.overlays[ovr].length == this.images.length)
		    && this.overlays_enable[ovr]) {
		    //this.over_context.drawImage(this.overlays[ovr][this.cur_img],0,0);
		    this.over_context.putImageData(this.overlays[ovr][this.cur_img],0,0);
		}
		break
		// TODO: drawImage if we use more than one overlay
	    }
	    
	    if (this.canvas_mouse.drawing) {
		this.over_context.beginPath();
		//console.log("Start: "+this.canvas_mouse.startX+" sep: "+(this.canvas_mouse.sep/2)+" tot: "+(this.canvas_mouse.startX-(this.canvas_mouse.sep/2)));
		this.over_context.rect(
		    (this.canvas_mouse.startX-this.canvas_mouse.sep)*this.overlay_scale,
		    (this.canvas_mouse.startY-this.canvas_mouse.sep)*this.overlay_scale,
		    (this.canvas_mouse.sep*2)*this.overlay_scale,
		    (this.canvas_mouse.sep*2)*this.overlay_scale);
		this.over_context.lineWidth = 4;
		this.over_context.strokeStyle = "yellow";
		this.over_context.stroke();
	    }
        }
    };

    
    this.reset_canvas_mouse = function () {
        this.canvas_mouse["down"] = false;
        this.canvas_mouse["drawing"] = false;
        this.canvas_mouse["x"] = 0;
        this.canvas_mouse["y"] = 0;
        this.canvas_mouse["startX"] = 0;
        this.canvas_mouse["startY"] = 0;
        this.canvas_mouse["sep"] = 0;//Number(this.size_input.val); console.log(this.size_input.val());
    };

    
    this.update_canvas_mouse = function (evt) {
        var canvas = this.canvas[0];
        var scaleX = canvas.width / canvas.clientWidth,
	    scaleY = canvas.height / canvas.clientHeight;
        this.canvas_mouse.x = (evt.pageX - (canvas.offsetParent.offsetLeft+canvas.clientLeft)) * scaleX;
        this.canvas_mouse.y = (evt.pageY - (canvas.offsetParent.offsetTop+canvas.clientTop)) * scaleY;
    };

    
    this.move_down = function (evt) {
        var canvas = this.canvas[0];
        this.reset_canvas_mouse(evt);
        this.update_canvas_mouse(evt);
        this.canvas_mouse.startX = this.canvas_mouse.x
        this.canvas_mouse.startY = this.canvas_mouse.y
        this.canvas_mouse.down = true;
    };

    
    this.move_up = function (evt) {
	var canvas = this.canvas[0];
	this.update_canvas_mouse(evt);
	if (this.canvas_mouse.drawing) {
	    this.new_fov(this.canvas_mouse.sep*2.75*2);
	} else if (this.canvas_mouse.down) {
	    this.move_fov(this.size_input.val());
	}
	this.reset_canvas_mouse();
    };

    
    this.move_move = function (evt) {
        var canvas = this.canvas[0];
        this.update_canvas_mouse(evt);
        if (this.canvas_mouse.down) {
	    var sep = Math.sqrt(Math.pow(this.canvas_mouse.x-this.canvas_mouse.startX,2)+Math.pow(this.canvas_mouse.y-this.canvas_mouse.startY,2));
	    //console.log("Sep:"+sep+" drawing: "+this.canvas_mouse.drawing);
	    this.canvas_mouse.sep = sep;
	    if (sep > 4) {
		this.canvas_mouse.drawing = true;
	    }
        }
        if (this.canvas_mouse.drawing) {
	    this.draw();
        }
    };


    this.__new_pos = function () {
        var canvas = this.canvas[0],
	    band = this.headers[1].length > 0 ? 1 : 2,
	    head = this.headers[band][0],
	    ra = head.cards.CRVAL1.value,
	    dec = head.cards.CRVAL2.value,
	    crpix1 = head.cards.CRPIX1.value,
	    crpix2 = head.cards.CRPIX2.value,
	    rad = ((((crpix1-this.canvas_mouse.startX)*2.75)/3600)/(Math.cos(dec*(Math.PI/180)))),
	    decd = ((((head.cards.NAXIS2.value - crpix2)-this.canvas_mouse.startY)*2.75)/3600),
	    ra = (((ra+rad) % 360) + 360) % 360, // modulo handling negative numbers. js by default does not.....
	    dec = dec+decd;
	return {"ra": ra, "dec": dec};
    };


    this.__world_to_pix2 = function (ra,dec) {
        var canvas = this.canvas[0],
	    band = this.headers[1].length > 0 ? 1 : 2,
	    head = this.headers[band][0],
	    tile_ra = head.cards.CRVAL1.value,
	    tile_dec = head.cards.CRVAL2.value,
	    tile_px = head.cards.CRPIX1.value,
	    tile_py = head.cards.CRPIX2.value,
	    // Radians
	    torad = 180/Math.PI,
	    scale = 2.75*3600*torad,
	    scale = scale/7.5
	    ra = ra/torad,
	    dec = dec/torad,
	    ra0 = tile_ra/torad,
	    dec0 = tile_dec/torad,
	    
	    A = Math.cos(dec)*Math.cos(ra-ra0),
	    F = scale/((Math.sin(dec0)*Math.sin(dec)) + (A*Math.cos(dec0))),
	    
	    pxd = -F*Math.cos(dec)*Math.sin(ra-ra0),
	    pyd = -F*((Math.cos(dec0)*Math.sin(dec)) - (A*Math.sin(dec0))),

	    //pxd = pxd/7.5, pyd = pyd/7.5,

	    px = tile_px+pxd,
	    py = tile_py+pyd;
	return {"px": px, "py": py};
    };


    this.__world_to_pix = function (ra,dec) {
        var canvas = this.canvas[0],
	    band = this.headers[1].length > 0 ? 1 : 2,
	    head = this.headers[band][0],
	    tile_ra = head.cards.CRVAL1.value,
	    tile_dec = head.cards.CRVAL2.value,
	    tile_px = head.cards.CRPIX1.value,
	    tile_py = head.cards.CRPIX2.value,
	    pxd = (tile_ra-ra)*(Math.cos(dec*(Math.PI/180))),
	    pyd = (tile_dec-dec),
	    // asec
	    pxd = pxd*3600, pyd = pyd*3600,
	    // pixels
	    pxd = pxd/2.75, pyd = pyd/2.75,
	    xx = pxd, yy = pyd,
	    // From edge of tile
	    pxd = pxd+head.cards.NAXIS1.value/2, pyd = pyd+head.cards.NAXIS2.value/2;
	    // Add to move to center of pixel?
        //px = pxd+.5, py = pyd-.5;
	//px = pxd+1, py = pyd-1;

	//yy = -yy;

	px = tile_px+xx
	py = tile_py-yy
	py = head.cards.NAXIS2.value-py
	// Why nudge to center of pixel needed?
	px = px-0.5
	py = py+0.5
	//px = tile_px+pxd, py = tile_py+pyd;

	return {"px": px, "py": py};
    };

    
    this.new_fov = function (fov) {
        var pos = this.__new_pos(),
	    current_zoom = this.zoom_input.slider("option","value"),
	    current_fov = this.size_input.val();

        fov = Number(fov).toFixed(0);
        if (fov < 6) {
	    fov = 6;
	}

	if (this.diff_input.prop("checked")) {
	    // Drop out of diff
	    window.open("/wiseview-v2#"+this.buildUrl(pos.ra,pos.dec,size=fov,zoom=(current_fov*current_zoom)/fov,diff=0,manual_bright=1));
	} else {
	    window.open("/wiseview-v2#"+this.buildUrl(pos.ra,pos.dec,size=fov,zoom=(current_fov*current_zoom)/fov));
	}
	
    };


    this.move_fov = function (fov) {
        var pos = this.__new_pos();	
	
        fov = Number(fov).toFixed(0);
        if (fov < 6) {
	    fov = 6;
	}
	
	this.loc_input.val(""+(pos.ra)+" "+(pos.dec));
	this.size_input.val(fov);
	this.restart();
    };

    
    this.frame = function () {
        this.advance();
        this.draw();
    };


    this.__get_cutouts = function (band,meta) {
	// Get all the cutouts
	var promises = [];
	for (var e = 0; e < meta["ims"].length; e++) {
	    that.pos_ims[band].push(null);
	    that.neg_ims[band].push(null);

	    promises.push(new Promise(function(res,rej) {
		var your_epoch_ = e,
		    your_band = band,
		    your_url = "https://touchspot-astro-public.s3-us-west-1.amazonaws.com/"+meta["ims"][e];
		jQuery.ajax({
		    url: your_url,
		    xhrFields: { responseType: "blob" },
		    success: function (buf) {
			new astro.FITS(buf, function () {
			    hdim = this.getHDU(0)
			    // Assign header to header array
			    that.headers[your_band][your_epoch_] = hdim.header;
			    hdim.data.getFrame(0, function (arr) {
				cards = that.headers[your_band][your_epoch_].cards;
				that.pos_ims[your_band][your_epoch_] = nj.float32(arr).reshape(cards.NAXIS2.value,cards.NAXIS1.value);
				res();
			    });
			});
		    }});
	    }));

	    if (!("neg_ims" in meta)) {
		continue;
	    }

	    promises.push(new Promise(function(res,rej) {
		var your_epoch_ = e,
		    your_band = band,
		    your_url = "https://touchspot-astro-public.s3-us-west-1.amazonaws.com/"+meta["neg_ims"][e];
		jQuery.ajax({
		    url: your_url,
		    xhrFields: { responseType: "blob" },
		    success: function (buf) {
			new astro.FITS(buf, function () {
			    hdim = this.getHDU(0)
			    // Assign header to header array
			    that.headers[your_band][your_epoch_] = hdim.header;
			    hdim.data.getFrame(0, function (arr) {
				cards = that.headers[your_band][your_epoch_].cards;
				that.neg_ims[your_band][your_epoch_] = nj.float32(arr).reshape(cards.NAXIS2.value,cards.NAXIS1.value);
				res();
			    });
			});
		    }});
	    }));
	}
	return promises;
    };


    this.get_cutouts = function (ra,dec,size,band) {
	var bound_band = band;

	jQuery.ajax({
	    url: "https://n7z4i9pzx8.execute-api.us-west-2.amazonaws.com/prod/meta-coadds",
	    datatype: "jsonp",
	    data: {ra: ra, dec: dec, band: band, size: size,
	     diff: this.diff_input.prop("checked") ? 1 : 0,
	     scandir: this.scandir_input.prop("checked") ? 1 : 0,
	     outer: this.outer_epochs_input.prop("checked") ? 1 : 0,
	     neowise: this.neowise_only_input.prop("checked") ? 1 : 0,
	     window: this.window_input.slider("option","value"),
	     diff_window: this.diff_window_input.slider("option","value"),
	     unique: this.unique_windows_input.prop("checked") ? 1 : 0,
	     rebase: this.rebase_input.prop("checked") ? 1 : 0,
	     rebase_e: this.rebase_e_input.prop("checked") ? 1 : 0,
	     smooth_scan: this.smooth_scan_input.prop("checked") ? 1 : 0,
	     smooth_phase: this.smooth_phase_input.prop("checked") ? 1 : 0,
	     smooth_band: this.smooth_band_input.prop("checked") ? 1 : 0,
	     shift: this.shift_input.prop("checked") ? 1 : 0,
	     pmx: (this.pmra_input.val()/1000.)/2.75,
	     pmy: (this.pmdec_input.val()/1000.)/2.75,
	     synth_a: this.synth_a_input.prop("checked") ? 1 : 0,
	     synth_a_sub: this.synth_a_sub_input.prop("checked") ? 1 : 0,
	     synth_a_ra: this.synth_a_ra_input.val(),
	     synth_a_dec: this.synth_a_dec_input.val(),
	     synth_a_w1: this.synth_a_w1_input.val(),
	     synth_a_w2: this.synth_a_w2_input.val(),
	     synth_a_pmra: this.synth_a_pmra_input.val(),
	     synth_a_pmdec: this.synth_a_pmdec_input.val(),
	     synth_a_mjd: this.synth_a_mjd_input.val(),
	     synth_b: this.synth_b_input.prop("checked") ? 1 : 0,
	     synth_b_sub: this.synth_b_sub_input.prop("checked") ? 1 : 0,
	     synth_b_ra: this.synth_b_ra_input.val(),
	     synth_b_dec: this.synth_b_dec_input.val(),
	     synth_b_w1: this.synth_b_w1_input.val(),
	     synth_b_w2: this.synth_b_w2_input.val(),
	     synth_b_pmra: this.synth_b_pmra_input.val(),
	     synth_b_pmdec: this.synth_b_pmdec_input.val(),
	     synth_b_mjd: this.synth_b_mjd_input.val(),
	    },
	    success: function (meta) {
		var promises = [],
		    mah_band = "ims" in meta[1] ? 1 : 2;
		
		if ((band & 1) != 0) {
		    promises = promises.concat(that.__get_cutouts(1,meta[1]));
		}
		
		if ((band & 2) != 0) {
		    promises = promises.concat(that.__get_cutouts(2,meta[2]));
		}
		Promise.all(promises).then(function () {
		    var flat = arr_flat(meta["mjds"].filter(function (x) { return x != null; })),
			mjd_bot = Math.min(...flat),
			mjd_top = Math.max(...flat);

		    that.global_mjds = meta["mjds"];
		    
		    that.window_mjds[mah_band] = meta[mah_band]["mjds"];
		    that.window_epochs[mah_band] = meta[mah_band]["epochs"];
		    that.window_antiepochs[mah_band] = "neg_epochs" in meta[mah_band] ? meta[mah_band]["neg_epochs"] : [];
		    
		    that.updateWindowLimits((mjd_top-mjd_bot)/365.25);
		    that.updateDiffWindowLimits((mjd_top-mjd_bot)/365.25);

		    // make catalog overlays
		    that.overlays_enable["gaiadr2"] = false;
		    if (that.gaia_input.prop("checked")) {
			that.query_gaia(ra,dec,size);
			// Doesn't need to be synched w/ ^
			that.overlays_enable["gaiadr2"] = true;
		    }
		    
		    // make some images
		    that.make_images(meta);
		});
	    },
	    retries: 6,
	    error: function(xhr, textStatus, errorThrown) {
		if (xhr.status != 504 || this.retries-- <= 0) {
		    return;
		}
		jQuery.ajax(this);
	    }}
	);
    };

    

    this.updateMjds = function () {
	// Update the list of date ranges
	var versions = [],
	    band = 1;
	
	if (this.window_mjds[1].length == 0) {
	    band = 2;
	}

	// For each frame, find lowest and highest mjd, and convert to
	// a string for the UI
	for (var i = 0; i < this.window_mjds[band].length; i++) {
	    var low = Math.min(...this.window_mjds[band][i]),
		high = Math.max(...this.window_mjds[band][i]);
	    versions.push(mjd_to_aarondate(low)+" - "+mjd_to_aarondate(high))
	}

	this.versions = versions;
    };


    this.updateEpochs = function () {
	// Find smallest, largest, and cardinality of epochs
	var band = 1;
	
	if (this.window_epochs[band].length == 0) {
	    band = 2;
	}
	
	res = [];
	for (var i = 0; i < this.window_epochs[band].length; i++) {
	    var res2 = [];

	    for (var j = 0; j < this.global_mjds.length; j++) {
		if (this.window_epochs[band][i].indexOf(j) != -1) {
		    res2.push("+");
		} else if (this.window_antiepochs[band].length > 0 &&
			   this.window_antiepochs[band][i].indexOf(j) != -1) {
		    res2.push("-");
		} else {
		    res2.push(".");
		}
	    }
	    res.push(res2.join(""));
	}
	
	this.epoch_legend = res;
    };


    this.pack_images = function (r, g, b) {
	this.images = [];
	
	g = !g ? r : g;
	b = !b ? r : b;

	// Optimization: Save invert property as local
	var invert = this.invert_input.prop("checked");
	for (var i = 0; i < r.length; i++) {
	    var idx = 0;
	    var imd = this.context.createImageData(r[i].shape[1],r[i].shape[0]),
		// Optimization: Pack as DWORDs
		view32 = new Uint32Array(imd.data.buffer);
	    
	    // BigUInt64's  *would* work here, but takes a LOT of conversion
	    // So much conversion, that it's not worth it. A naive implementation
	    // was the same speed as Uint32
	    
	    for (var y = r[i].shape[0]-1; y >= 0; y--) { // Invert y
		for (var x = 0; x < r[i].shape[1]; x++) {
		    if (invert) {
			// Invert pixel values if checked
			view32[idx++] = (255 << 24) | ((255-r[i].get(y,x)) << 16) |
			    ((255-g[i].get(y,x)) << 8) | (255-b[i].get(y,x))
		    } else {
			view32[idx++] = (255 << 24) | ((r[i].get(y,x)) << 16) |
			    ((g[i].get(y,x)) << 8) | (b[i].get(y,x))
		    }
		}
	    }
	    this.images.push(imd);
	}
    };


    this.coadd_images_with_cache = function(ims, covmaps, epochs) {
	var key = this.coadd_cache.key(epochs),
	    cached_im = this.coadd_cache.get(key);

	if (cached_im === undefined) {
	    cached_im = weighted_average(ims,covmaps);
	    this.coadd_cache.add(key,cached_im);
	}

	return cached_im;
    };


    this.trimarr = function(ims,low,high) {
	// In place clip nj arrays
	for (var i = 0; i < ims.length; i++) {
	    for (var j = 0; j < ims[i].selection.data.length; j++) {
		// Could just .map(), but this frees memory after each iteration
		ims[i].selection.data[j] = Math.max(low,Math.min(high,ims[i].selection.data[j]));
	    }
	}
    };

    
    this.trimstack = function (ims,low,high) {
	// In place clip nj arrays
	for (var i = 0; i < ims.selection.data.length; i++) {
	    // Could just .map(), but this frees memory after each iteration
	    ims.selection.data[i] = Math.max(low,Math.min(high,ims.selection.data[i]));
	}
    };


    this.trim_and_normalize = function (ims,user_minbright,user_maxbright,
					user_linear,max_dyr=false) {
	var r = [];
	
	this.trimstack(ims,user_minbright,user_maxbright);

	if (max_dyr) {
	    // Find minimum and maximum pixel values
	    var min = ims.min(), max = ims.max();
	} else {
	    var min = user_minbright, max = user_maxbright;
	}

	// Stretch
	if (user_linear < 0.99) {
	    // Normalize w/ min/max on user input instead of pixel min/max
	    ims = ims.subtract(min).divide(max - min); // 0-1 again
	    ims = asinh_stretch(ims,user_linear);
	    // ims = ims.subtract(ims.min()).divide(ims.max()-ims.min()); // 0-1 again
	    // console.log("THREE"+ims.min()+" "+ims.max())
	} else {
	    // Normalize w/ min/max on user input instead of pixel min/max
	    ims = ims.subtract(min).divide(max - min); // 0-1 again
	}

	
	ims = ims.multiply(255); // 0-255
	    
	    
	for (var epoch = 0; epoch < ims.shape[0]; epoch++) {
	    r.push(ims.slice([epoch,epoch+1]).reshape(ims.shape[1],ims.shape[2]));
	}
	
	return {"im": r, "botpx": min, "toppx": max};
    };

    
    this.__make_windowed_images  = function (range, band, sep_scandir = false, forward = false, neowise = false, diff = false, unique = false, outer = false, mindiff = null, maxdiff = null) {
	var ims = [], window_epochs = [], window_mjds = [], window_antiepochs = [];
	
	for (var epoch = 0; epoch < this.cutouts[band].length; epoch++) {
	    var mjd = this.headers[band][epoch].cards.MJDMIN.value;
	    
	    // Skip non-neowise if set
	    if (neowise && mjd < 55600) {
		continue;
	    }

	    // Skip inner epochs if set
	    if (outer
		// Already did first epoch?
		&& ims.length != 0
		// At last epoch?
		&& epoch != this.cutouts[band].length-1) {
		continue;
	    }

		
	    var cur = [], covmap = [], epochs = [], mjds = [],
		anticur = [], anticovmap = [], antiepochs = [],
		// No forward present in headers... TODO: check
		//forward_ = this.headers[band][epoch].cards.FORWARD.value;
		// Instead, test within half a year of e0
		mjdmod = (Math.abs(mjd - this.headers[band][0].cards.MJDMIN.value)
			  % 365.25),
		forward_ =  mjdmod < (365.25/4.) || mjdmod >= (365.25*3/4.);
	    
	    // Check this center epoch is within right scandir, if required
	    if (sep_scandir && forward_ != forward) {
		continue;
	    }

	    // Get epochs within window, according to scandir, if required
	    // TODO: Optimize for removed duplicates
	    for (var epoch2 = 0; epoch2 < this.cutouts[band].length; epoch2++) {
		
		var mjd2 = this.headers[band][epoch2].cards.MJDMIN.value,
		    mjdmod2 = (Math.abs(mjd2 - this.headers[band][0].cards.MJDMIN.value)
			      % 365.25),
		    forward2_ =  mjdmod2 < (365.25/4.) || mjdmod2 >= (365.25*3/4.);
		
		if (sep_scandir && forward2_ != forward) {
		    // Not in scandir
		    continue;
		}
		
		if (Math.abs(mjd - this.headers[band][epoch2].cards.MJDMIN.value) <= range) {
		    
		    epochs.push(epoch2);
		    cur.push(this.cutouts[band][epoch2]);
		    mjds.push(mjd2);

		    // TODO: Revisit cross frame interpolation
		    covmap.push(this.covmaps[band][epoch2]);
		    /*
		    if (this.double_weight_input.prop("checked")
		       && epoch == epoch2) {
			covmap.push(this.covmaps[band][epoch2].multiply(3.0));
		    } else {
			covmap.push(this.covmaps[band][epoch2]);
		    }*/
		} else if (diff && !(neowise && mjd2 < 55600)) {
		    // Not in range, and we're diffing
		    // And we're not skipping neowise
		    anticur.push(this.cutouts[band][epoch2]);
		    anticovmap.push(this.covmaps[band][epoch2]);
		    antiepochs.push(epoch2);
		}
		
	    }
	    
	    // Remove duplicate windows
	    if (unique
		&& window_epochs.length > 0
		&& window_epochs[window_epochs.length-1].length == epochs.length) {
		var epochs2 = window_epochs[window_epochs.length-1], skip = true;
		for (var i = 0; i < epochs.length; i++) {
		    if (epochs[i] != epochs2[i]) {
			skip = false;
			break;
		    }
		}
		if (skip) { continue; }
	    }

	    if (diff && anticur.length > 0) {
		this.trimarr(cur,mindiff,maxdiff);
		this.trimarr(anticur,mindiff,maxdiff);
		ims.push(this.coadd_images_with_cache(cur,covmap,epochs).subtract(
		    this.coadd_images_with_cache(anticur,anticovmap,antiepochs)));
	    } else {
		ims.push(this.coadd_images_with_cache(cur,covmap,epochs));
	    }
	    window_epochs.push(epochs);
	    window_antiepochs.push(antiepochs);
	    window_mjds.push(mjd);
	}

	// Save off metadata for UI
	if (sep_scandir && !forward) {
	    // This is bad practice... not clobbering
	    // on a certain config requires this func always
	    // called in a given order.
	    // Dan's gonna hate himself some months from now
	    this.window_epochs[band] = this.window_epochs[band].concat(window_epochs);
	    this.window_mjds[band] = this.window_mjds[band].concat(window_mjds);
	    this.window_antiepochs[band] = this.window_antiepochs[band].concat(window_antiepochs);
	} else {
	    this.window_epochs[band] = window_epochs;
	    this.window_mjds[band] = window_mjds;
	    this.window_antiepochs[band] = window_antiepochs;
	}
	return ims;
    };


    this.__make_images_inner = function(range, band, scandir, neowise, diff, unique, outer,
					mindiff, maxdiff) {
	// Organize windowing calls by user settings
	/*
	if (scandir) {
	    // Separate scandir
	    return nj.concatenate(
		// ALWAYS forward THEN backward
		nj.stack(this.__make_windowed_images(range,band,sep_scandir=scandir,forward=true,neowise=neowise,diff=diff,unique=unique,outer=outer,mindiff=mindiff,maxdiff=maxdiff)).T,
		nj.stack(this.__make_windowed_images(range,band,sep_scandir=scandir,forward=false,neowise=neowise,diff=diff,unique=unique,outer=outer,mindiff=mindiff,maxdiff=maxdiff)).T).T;
	} else {
	    // Don't separate scandir
	    return nj.stack(this.__make_windowed_images(range,band,sep_scandir=scandir,forward=false,neowise=neowise,diff=diff,unique=unique,outer=outer,mindiff=mindiff,maxdiff=maxdiff));
	    }*/
	if (diff) {
	    var res = [];
	    this.trimarr(this.pos_ims[band],mindiff,maxdiff);
	    this.trimarr(this.neg_ims[band],mindiff,maxdiff);
	    for (var i = 0; i < this.pos_ims[band].length > 0; i++) {
		res.push(this.pos_ims[band][i].subtract(this.neg_ims[band][i]));
	    }
	    return nj.stack(res);
	}
	return nj.stack(this.pos_ims[band]);
    };
    

    this.make_images = function (meta) {
	// Convert cutouts to final images
	// User configs and side effects localized to this function
	// Inner functions take explicit params and have no side effects
	// to facilitate memoization
	var range = Math.max(0.000001,this.window_input.slider("option","value"))*365.25,
	    bands = this.band_input.val(),
	    unique = this.unique_windows_input.prop("checked"),
	    scandir = this.scandir_input.prop("checked"),
	    neowise = this.neowise_only_input.prop("checked"),
	    diff = this.diff_input.prop("checked"),
	    outer = this.outer_epochs_input.prop("checked"),
	    w1_ims = null, w2_ims = null, w1 = {}, w2 = {},
	    user_minbright = symexp10(this.trimbright.low()),
	    user_maxbright = symexp10(this.trimbright.high()),
	    user_mindiff = symexp10(this.diffbright.low()),
	    user_maxdiff = symexp10(this.diffbright.high()),
	    linear = this.linear_input.slider("option","value"),
	    w1_realmin = null, w1_realmax = null,
	    w2_realmin = null, w2_realmax = null,
	    guess = !this.manual_bright_input.prop("checked"),
	    w1_finalbot = null, w1_finaltop = null,
	    w1_diffbot = null, w1_difftop = null,
	    w2_finalbot = null, w2_finaltop = null,
	    w2_diffbot = null, w2_difftop = null,
	    normalize_bands = true,
	    max_dyr = this.maxdyr_input.prop("checked");

	if (bands&1) {		
	    var w1_realmin = meta[1]["min"], w1_realmax = meta[1]["max"],
		w1_meanmean = meta[1]["mean"], w1_stdmean = meta[1]["std"];
	    
	    w1_diffbot = guess ? -50 : user_mindiff;
	    w1_difftop = guess ? 10000 : user_maxdiff;
	    w1_ims = this.__make_images_inner(range,1,scandir,neowise,diff,unique,outer,w1_diffbot,w1_difftop);
	    
	    w1_finalbot = guess ? (diff ? -750 : -50) : user_minbright;
	    w1_finaltop = guess ? (diff ? 750 : (w1_meanmean+(2*w1_stdmean))) : user_maxbright;
	    w1 = this.trim_and_normalize(w1_ims,w1_finalbot,w1_finaltop,linear,max_dyr);
	}
	
	if (bands&2) {
	    var w2_realmin = meta[2]["min"], w2_realmax = meta[2]["max"],
		w2_meanmean = meta[2]["mean"], w2_stdmean = meta[2]["std"];

	    /*
	    if ((bands == 3) && (normalize_bands)) {
		for (var i = 0; i < this.pos_ims[2].length; i++){
		    this.pos_ims[2][i] = this.pos_ims[2][i].add((meta[1]["mean"]-meta[2]["mean"]))
		}
	    }*/
	    
	    w2_diffbot = guess ? -50 : user_mindiff;
	    w2_difftop = guess ? 10000 : user_maxdiff;
	    w2_ims = this.__make_images_inner(range,2,scandir,neowise,diff,unique,outer,w2_diffbot,w2_difftop);
	    
	    w2_finalbot = guess ? (diff ? -750 : -50) : user_minbright;
	    w2_finaltop = guess ? (diff ? 750 : (w2_meanmean+(2*w2_stdmean))) : user_maxbright;
	    w2 = this.trim_and_normalize(w2_ims,w2_finalbot,w2_finaltop,linear,max_dyr);
	}

	var minmin = bands == 3 ? Math.min(w2_realmin,w1_realmin)
	    : bands == 2 ? w2_realmin
	    : w1_realmin,
	    maxmax = bands == 3 ? Math.max(w2_realmax,w1_realmax)
	    : bands == 2 ? w2_realmax
	    : w1_realmax,
	    botbot = bands == 3 ? Math.min(w2_finalbot,w1_finalbot)
	    : bands == 2 ? w2_finalbot
	    : w1_finalbot,
	    toptop = bands == 3 ? Math.max(w2_finaltop,w1_finaltop)
	    : bands == 2 ? w2_finaltop
	    : w1_finaltop,
	    diffbot = bands == 3 ? Math.min(w2_diffbot,w1_diffbot)
	    : bands == 2 ? w2_diffbot
	    : w1_diffbot,
	    difftop = bands == 3 ? Math.max(w2_difftop,w1_difftop)
	    : bands == 2 ? w2_difftop
	    : w1_difftop;

	if (diff) {
	    minmin = Math.min(minmin,-maxmax);
	}
	
	// Set min/max to image min/max
	this.trimbright.update_limits(minmin,maxmax);
	// Set value low/high to inner of settings and image min/max
	this.trimbright.update_values(botbot,toptop);
	
	// Set min/max to image min/max
	this.diffbright.update_limits(minmin,maxmax);
	// Set value low/high to inner of settings and image min/max
	this.diffbright.update_values(diffbot,difftop);
	
	if (bands == 1) {
	    this.pack_images(w1["im"]);
	} else if (bands == 2) {
	    this.pack_images(w2["im"]);
	} else {
	    r = w2["im"]; b = w1["im"];
	    var g = [];
	    for (var i = 0; i < Math.min(r.length,b.length); i++) {
		g.push(r[i].add(b[i]).divide(2.0))
	    }
	    this.pack_images(r,g,b);
	}
	
	if (w2_ims === null) {
	    this.real_img_size = [w1_ims.shape[2],w1_ims.shape[1]]
	} else {
	    this.real_img_size = [w2_ims.shape[2],w2_ims.shape[1]]
	}
	
	// Update canvas size to fit images
	this.canvas.attr("width", this.real_img_size[0]).attr("height", this.real_img_size[1]);
	// Update overlay size to match, *10 for extra resolution
	this.over_canvas.attr("width", this.real_img_size[0]*this.overlay_scale).attr("height", this.real_img_size[1]*this.overlay_scale);

	this.updateMjds();
	this.updateEpochs();
        this.updateZoom();
	this.unblock();
    }


    this.query_gaia = function (ra,dec,size) {
	var size_deg = (size/3600.)*2.75,
	    path = "https://n7z4i9pzx8.execute-api.us-west-2.amazonaws.com/prod/catalog/gaiadr2", //"https://gea.esac.esa.int/tap-server/tap/sync",
	    params = {
		request: "doQuery",
		lang: "adql",
		format: "json",
		query: "SELECT ra, dec, parallax, pmra, pmdec "+
		    "FROM gaiadr2.gaia_source "+
		    "WHERE 1=CONTAINS(POINT('ICRS',ra,dec), "+
		    "  CIRCLE('ICRS',"+ra+","+dec+","+size_deg+"))"
	    },
	    that = this;
	return jQuery.post(path,params,function (data,status) {
	    // Required ra, dec, plx, pmra, pmdec
	    var rows = data["data"],
		frames = [],
		base_mjd = 57204, // 2015.5
		mah_band = that.headers[1].length > 0 ? 1 : 2,
		head = that.headers[mah_band][0],
		window_mjds = that.window_mjds[mah_band],
		// hidden canvas to build overlay
		tmp_canvas = jQuery("<canvas/>",{"style":"display: none"}).prop({"width":that.real_img_size[0]*that.overlay_scale,"height":that.real_img_size[1]*that.overlay_scale})[0],
		shifting = that.shift_input.prop("checked"),
		// Try w/o shift adjust for jackie
		shifting = false,
		shift_pmra = that.pmra_input.val(),
		shift_pmdec = that.pmdec_input.val();
	    var ctx = tmp_canvas.getContext("2d");

	    // Convert starting ra/dec to pixels
	    for (var i = 0; i < rows.length; i++) {
		var row = rows[i],
		    pxpy = that.__world_to_pix(row[0],row[1]);
		row.push(pxpy["px"]);
		row.push(pxpy["py"]);
	    }
	    
	    for (var i = 0; i < window_mjds.length; i++) {
		var mjd = arr_mean(window_mjds[i]),
		    first_mjd = arr_mean(window_mjds[0]),
		    last_mjd = arr_mean(window_mjds[window_mjds.length-1]);

		// Clear it
		ctx.clearRect(0,0,tmp_canvas.width,tmp_canvas.height);

		// For each point, draw a circle
		for (var j = 0; j < rows.length; j++) {
		    /*
		    if (rows[j][2] == "null" || Number(rows[j][2]) < 10) {
			continue;
		    }*/
		    
		    var row = rows[j],
			px = row[5], py = row[6],
			pmra = Number(row[3]), pmdec = Number(row[4]),
			pmra = shifting ? pmra-shift_pmra : pmra,
			pmdec = shifting ? pmdec-shift_pmdec : pmdec,
			// correct for pm
			base_px = px, base_py = py,
			px = base_px + (((base_mjd - mjd)/365.25)*((pmra/1000)/2.75)),
			py = base_py + (((base_mjd - mjd)/365.25)*((pmdec/1000)/2.75)),
			first_px = base_px + (((base_mjd - first_mjd)/365.25)*((pmra/1000)/2.75)),
			first_py = base_py + (((base_mjd - first_mjd)/365.25)*((pmdec/1000)/2.75)),
			last_px = base_px + (((base_mjd - last_mjd)/365.25)*((pmra/1000)/2.75)),
			last_py = base_py + (((base_mjd - last_mjd)/365.25)*((pmdec/1000)/2.75)),
			plx = row[2] == "null" ? 0 : Number(row[2]);

		    // Circle for current position and plx
		    ctx.beginPath();
		    ctx.arc(px*that.overlay_scale,py*that.overlay_scale,Math.max(0.1,plx/50)*that.overlay_scale,0,2*Math.PI);
		    
		    if(Math.abs(pmra)+Math.abs(pmdec) >= 100 ) { // Math.sqrt(Math.pow(pmra,2)+Math.pow(pmdec,2)) >= 100
			ctx.strokeStyle = "#00aa00";
		    } else {
			ctx.strokeStyle = "#00aa00";
			//ctx.strokeStyle = "#aa0000";
		    }
		    //ctx.strokeStyle = "#00aa00";
		    ctx.lineWidth = 2;
		    ctx.stroke();
		    ctx.closePath();
		    
		    // Line for pm
		    ctx.beginPath();
		    ctx.moveTo(first_px*that.overlay_scale,first_py*that.overlay_scale);
		    ctx.lineTo(last_px*that.overlay_scale,last_py*that.overlay_scale);
		    ctx.stroke();
		    ctx.closePath();
		}
		var image = ctx.getImageData(0,0,tmp_canvas.width,tmp_canvas.height)
		//var image = new Image();
		//image.src = tmp_canvas.toDataURL();
		frames.push(image);
	    }
	    that.overlays["gaiadr2"] = frames;
	});
    };

    
    this.notifygo = function () { console.log("Fired input changed"); };

    this.block = function() {
	jQuery("#nav-left").block({message: null, fadein: 0, fadeout: 0})
	jQuery("#image").block({message: null, fadein: 0, fadeout: 0})
    };
    
    this.unblock = function() {
	jQuery("#nav-left").unblock({message: null, fadein: 0, fadeout: 0})
	jQuery("#image").unblock({message: null, fadein: 0, fadeout: 0})
    };
    
    this.restart = function () {
	// Lock UI
	//jQuery("#settingsDiv").block({message: null})
	//jQuery.blockUI({message: null, fadein: 0, fadeout: 0});
	//jQuery("#nav-left").block({message: null})
	this.block();
        this.reset();
        var loc_split = this.parseLoc();
	if (loc_split === null) {
	    this.unblock();
	    return;
	}
	this.updateUrl();
        
        var that = this;

        if (loc_split !== null) {
	    var ra = loc_split[0],
		dec = loc_split[1];
	}
	var sizeas = that.size_input.val(),
	    size = (~~(sizeas/2.75)); // Convert arcseconds to pixels
	var band = that.band_input.val();

	// Disable/enable pertinent sliders
	this.trimbright.enable();
	this.diffbright.enable();
	if (!this.diff_input.prop("checked")) {
	    this.diffbright.disable();
	}
	if (!jQuery("#manualBrightInput").prop("checked")) {
	    this.trimbright.disable();
	    this.diffbright.disable();
	}

	this.get_cutouts(ra,dec,size,band);

	// hide/show
	//if (this.adv_input.prop("checked")) {
	//   jQuery("#advSettings").show();
	//}
	
	if (this.diff_input.prop("checked")) {
	    jQuery("#diffbrightRow").show();
	    jQuery("#diffWindowRow").show();
	}
	
	if (this.shift_input.prop("checked")) {
	    jQuery("#pmraDiv").show();
	    jQuery("#pmdecDiv").show();
	}
	
	if (this.synth_a_input.prop("checked")) {
	    jQuery("#synthASubDiv").show();
	    jQuery("#synthARaDiv").show();
	    jQuery("#synthADecDiv").show();
	    jQuery("#synthAW1Div").show();
	    jQuery("#synthAW2Div").show();
	    jQuery("#synthAPmraDiv").show();
	    jQuery("#synthAPmdecDiv").show();
	    jQuery("#synthAMjdDiv").show();
	}
	if (this.synth_b_input.prop("checked")) {
	    jQuery("#synthBSubDiv").show();
	    jQuery("#synthBRaDiv").show();
	    jQuery("#synthBDecDiv").show();
	    jQuery("#synthBW1Div").show();
	    jQuery("#synthBW2Div").show();
	    jQuery("#synthBPmraDiv").show();
	    jQuery("#synthBPmdecDiv").show();
	    jQuery("#synthBMjdDiv").show();
	}
	
	if (jQuery("#manualBrightInput").prop("checked")) {
	    jQuery("#trimbrightRow").show();
	    jQuery("#linearRow").show();
	}

        this.updatePawnstars();
        this.updateZooiSubjects();
        this.updateZoom();
        this.updateUrl();
        this.updateSpeed();
    };
    
    this.tabClick = function(evt) {
	jQuery("#tabs button").addClass("inactive");
	jQuery("#"+evt.target.id).removeClass("inactive");
	jQuery(".tabBody").hide();
	jQuery("#"+evt.target.id+"Div").show();
    };

    this.showhide_adv = function(evt) {
	if (evt.target.checked) {
	    jQuery("#advSettings").show();
	} else {
	    jQuery("#advSettings").hide();
	}
    };

    this.showhide_diff = function(evt) {
	if (evt.target.checked) {
	    jQuery("#diffbrightRow").show();
	    jQuery("#diffWindowRow").show();
	} else {
	    jQuery("#diffbrightRow").hide();
	    jQuery("#diffWindowRow").hide();
	}
    };

    this.showhide_shift = function(evt) {
	if (evt.target.checked) {
	    jQuery("#pmraDiv").show();
	    jQuery("#pmdecDiv").show();
	} else {
	    jQuery("#pmraDiv").hide();
	    jQuery("#pmdecDiv").hide();
	}
    };

    this.showhide_synth_a = function(evt) {
	if (evt.target.checked) {
	    jQuery("#synthASubDiv").show();
	    jQuery("#synthARaDiv").show();
	    jQuery("#synthADecDiv").show();
	    jQuery("#synthAW1Div").show();
	    jQuery("#synthAW2Div").show();
	    jQuery("#synthAPmraDiv").show();
	    jQuery("#synthAPmdecDiv").show();
	    jQuery("#synthAMjdDiv").show();
	} else {
	    jQuery("#synthASubDiv").hide();
	    jQuery("#synthARaDiv").hide();
	    jQuery("#synthADecDiv").hide();
	    jQuery("#synthAW1Div").hide();
	    jQuery("#synthAW2Div").hide();
	    jQuery("#synthAPmraDiv").hide();
	    jQuery("#synthAPmdecDiv").hide();
	    jQuery("#synthAMjdDiv").hide();
	}
    };
    this.showhide_synth_b = function(evt) {
	if (evt.target.checked) {
	    jQuery("#synthBSubDiv").show();
	    jQuery("#synthBRaDiv").show();
	    jQuery("#synthBDecDiv").show();
	    jQuery("#synthBW1Div").show();
	    jQuery("#synthBW2Div").show();
	    jQuery("#synthBPmraDiv").show();
	    jQuery("#synthBPmdecDiv").show();
	    jQuery("#synthBMjdDiv").show();
	} else {
	    jQuery("#synthBSubDiv").hide();
	    jQuery("#synthBRaDiv").hide();
	    jQuery("#synthBDecDiv").hide();
	    jQuery("#synthBW1Div").hide();
	    jQuery("#synthBW2Div").hide();
	    jQuery("#synthBPmraDiv").hide();
	    jQuery("#synthBPmdecDiv").hide();
	    jQuery("#synthBMjdDiv").hide();
	}
    };

    this.showhide_trim = function(evt) {
	if (evt.target.checked) {
	    this.trimbright.enable();
	    jQuery("#trimbrightRow").show();
	    jQuery("#linearRow").show();
	} else {
	    jQuery("#trimbrightRow").hide();
	    jQuery("#linearRow").hide();
	    this.restart();
	}
    };

    this.gaia_toggle = function(evt) {
	if (evt.target.checked) {
	    if (!("gaiadr2" in this.overlays)) {
		this.block();
		var loc_split = this.parseLoc(),
		    ra = loc_split[0],
		    dec = loc_split[1],
		    sizeas = that.size_input.val(),
		    size = (~~(sizeas/2.75)); // Convert arcseconds to pixels
		this.query_gaia(ra,dec,size).then(this.unblock);
	    }
	    this.overlays_enable["gaiadr2"] = true;
	} else {
	    this.overlays_enable["gaiadr2"] = false;
	}

    };
}

jQuery(function () {
    jQuery("form").submit(function (e) {
        e.preventDefault();
    });

    var ws = new WiseSwapper();

    /*
    if (window.location.hash) {
	console.log("FROMURL")
        ws.fromUrl();
    }*/
    
    ws.fromUrl();

    ws.size_input.on("change", function (evt) {
	var v = ws.size_input.val();
	if (v > 2000) {
	    jQuery("#"+evt.target.id).val(2000);
	}}.bind(ws));
    
    jQuery("#overlayCanvas").on("mouseup", ws.move_up.bind(ws));
    jQuery("#overlayCanvas").on("mousedown", ws.move_down.bind(ws));
    jQuery("#overlayCanvas").on("mousemove", ws.move_move.bind(ws));
    jQuery(".urlers").on("change", ws.updateUrl.bind(ws));
    jQuery(".resetters").on("change", ws.restart.bind(ws));
    //jQuery("#speedInput").on('change', ws.updateSpeed.bind(ws));
    //jQuery("#zoomInput").on('change', ws.updateZoom.bind(ws));
    jQuery("#linearInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#trimbrightInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#diffbrightInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#windowInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#diffWindowInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#tabs button").on("click", ws.tabClick.bind(ws));
    jQuery("#setDefaultsButton").on("click", ws.setDefaults.bind(ws));
    //jQuery("#setDiffButton").on("click", ws.setDiff.bind(ws));
    //jQuery("#setPrePostButton").on("click", ws.setPrePost.bind(ws));
    //jQuery("#setParallaxEnhancingButton").on("click", ws.setParallaxEnhancing.bind(ws));
    //jQuery("#setTimeResolvedButton").on("click", ws.setTimeResolved.bind(ws));
    //jQuery("#setJamButton").on("click", ws.setJam.bind(ws));
    jQuery("#setPPBrightButton").on("click", ws.setPPBright.bind(ws));
    jQuery("#setPPFaintButton").on("click", ws.setPPFaint.bind(ws));
    //jQuery("#advInput").on("change", ws.showhide_adv.bind(ws));
    jQuery("#diffInput").on("change", ws.showhide_diff.bind(ws));
    jQuery("#shiftInput").on("change", ws.showhide_shift.bind(ws));
    jQuery("#synthAInput").on("change", ws.showhide_synth_a.bind(ws));
    jQuery("#synthBInput").on("change", ws.showhide_synth_b.bind(ws));
    jQuery("#manualBrightInput").on("change", ws.showhide_trim.bind(ws));
    jQuery("#gaiaInput").on("change", ws.gaia_toggle.bind(ws));
});

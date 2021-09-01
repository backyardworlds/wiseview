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
	this.window_epochs = [];
	this.window_antiepochs = [];
	this.global_mjds = [];
	this.window_mjds = [];
	this.ims = [];
	this.images = [];
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
    this.border_input = jQuery("#borderInput");
    this.gaia_input = jQuery("#gaiaInput");
    this.invert_input = jQuery("#invertInput");
    this.maxdyr_input = jQuery("#maxdyrInput");
    this.scandir_input = jQuery("#scandirInput");
    this.neowise_only_input = jQuery("#neowiseOnlyInput");
    this.diff_input = jQuery("#diffInput");
    this.outer_epochs_input = jQuery("#outerEpochsInput");
    this.unique_windows_input = jQuery("#uniqueWindowInput");
    this.smooth_scan_input = jQuery("#smoothScanInput");
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


    this.buildUrl = function (ra, dec, size=null, zoom=null, diff=null, ) {
	if (size === null) {
	    size = this.size_input.val();
	}
	if (zoom === null) {
	    zoom = this.zoom_input.slider("option","value");
	}
	if (diff === null) {
	    diff = this.diff_input.prop("checked") ? 1 : 0;
	}
        var args = {
	    ra: ra,
	    dec: dec, 
	    size: size, 
	    band: this.band_input.val(), 
	    speed: this.speed_input.slider("option","value"),
	    minbright: symexp10(this.trimbright.low()).toFixed(4),
	    maxbright: symexp10(this.trimbright.high()).toFixed(4),
	    window: this.window_input.slider("option","value"),
	    diff_window: this.diff_window_input.slider("option","value"),
	    linear: this.linear_input.slider("option","value"),
	    color: this.color_input.val(),
	    zoom: zoom,
	    border: this.border_input.prop("checked") ? 1 : 0,
	    gaia: this.gaia_input.prop("checked") ? 1 : 0,
	    invert: this.invert_input.prop("checked") ? 1 : 0,
	    maxdyr: this.maxdyr_input.prop("checked") ? 1 : 0,
	    scandir: this.scandir_input.prop("checked") ? 1 : 0,
	    neowise: this.neowise_only_input.prop("checked") ? 1 : 0,
	    diff: diff,
	    outer_epochs: this.outer_epochs_input.prop("checked") ? 1 : 0,
	    unique_window: this.unique_windows_input.prop("checked") ? 1 : 0,
	    smooth_scan: this.smooth_scan_input.prop("checked") ? 1 : 0,
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
        this.canvas.attr("width", this.real_img_size[0]).attr("height", this.real_img_size[1]);
        this.over_canvas.attr("width", this.real_img_size[0]*this.overlay_scale).attr("height", this.real_img_size[1]*this.overlay_scale);

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

	// Update window UI element
	this.updateWindowValue(.75);
	this.updateDiffWindowValue(0);

	this.shift_input.prop("checked", false);
        this.pmra_input.val(0);
        this.pmdec_input.val(0);
        this.border_input.prop("checked", false);
        this.gaia_input.prop("checked", false);
        this.invert_input.prop("checked", true);
        this.maxdyr_input.prop("checked", false);
        this.scandir_input.prop("checked", false);
        this.neowise_only_input.prop("checked", false);
        this.diff_input.prop("checked", false);
        this.outer_epochs_input.prop("checked", false);
        this.unique_windows_input.prop("checked", true);
        this.smooth_scan_input.prop("checked", false);
        this.synth_a_input.prop("checked", false);
	this.synth_a_sub_input.prop("checked", false);
	this.synth_a_ra_input.val();
	this.synth_a_dec_input.val();
	this.synth_a_w1_input.val();
	this.synth_a_w2_input.val();
	this.synth_a_pmra_input.val(0);
	this.synth_a_pmdec_input.val(0);
	this.synth_a_mjd_input.val();
        this.synth_b_input.prop("checked", false);
	this.synth_b_sub_input.prop("checked", false);
	this.synth_b_ra_input.val();
	this.synth_b_dec_input.val();
	this.synth_b_w1_input.val();
	this.synth_b_w2_input.val();
	this.synth_b_pmra_input.val(0);
	this.synth_b_pmdec_input.val(0);
	this.synth_b_mjd_input.val();
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

    this.v1UrlCompat = function(map) {
	// Detect if the URL looks like a wiseview-v1 URL
	if (!("coadd_mode" in map)) {
	    return map;
	}

	// Convert wiseview-v1 URL to wiseview-v3
	if (map.coadd_mode == "time-resolved") {
	    map.window = 0;
	} else if (map.coadd_mode.startsWith("parallax-cancelling")) {
	    map.window = 0;
	    map.scandir = 1;
	} else if (map.coadd_mode == "full-depth") {
	    map.window = 1.5;
	} else if (map.coadd_mode == "pre-post") {
	    map.window = 1.5;
	    map.outer_epochs = 1;
	} else if (map.coadd_mode == "parallax-enhancing") {
	    map.window = 100;
	    map.scandir = 1;
	} else if (map.coadd_mode.startsWith("window-")
		   && map.coadd_mode.endsWith("-year")) {
	    m = map.coadd_mode.match(/window-([0-9\.]+)-year/);
	    if (m !== null && m.length >= 2) {
		map.window = Number(m[1]);
	    }
	} else if (map.coadd_mode.startsWith("window-")
		   && map.coadd_mode.endsWith("-year-parallax-enhancing")) {
	    m = map.coadd_mode.match(/window-([0-9\.]+)-year/);
	    if (m !== null && m.length >= 2) {
		map.window = Number(m[1]);
		map.scandir = 1;
	    }
	} else if (map.coadd_mode == "shift-and-add") {
	    map.window = 100;
	    map.shift = 1;
	}
	
    };
    
    this.fromUrl = function () {
	// Get parameters from URI
        var raw = window.location.hash.substr(1);
        var map = {};
	
        raw.split("&").forEach(function (kv) {
	    var split = kv.split("=");
	    map[split[0]] = split[1];
        });

	this.v1UrlCompat(map);
	
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

	// Update window UI element
	this.updateWindowValue(Number(map.window) || 0.5);
	this.updateDiffWindowValue(Number(map.diff_window) || 1.0);
	    
        this.border_input.prop("checked", (map.border || 0) == 1);
        this.gaia_input.prop("checked", (map.gaia || 0) == 1);
        this.invert_input.prop("checked", (map.invert || 1) == 1);
        this.maxdyr_input.prop("checked", (map.maxdyr || 0) == 1);
        this.scandir_input.prop("checked", (map.scandir || 0) == 1);
        this.neowise_only_input.prop("checked", (map.neowise || 0) == 1);
        this.diff_input.prop("checked", (map.diff || 0) == 1);
        this.outer_epochs_input.prop("checked", (map.outer_epochs || 0) == 1);
        this.unique_windows_input.prop("checked", (map.unique_window || 1) == 1);
        this.smooth_scan_input.prop("checked", (map.smooth_scan || 0) == 1);
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
	    this.context.drawImage(image, 0, 0);
	    //this.context.putImageData(image,0,0);
	    this.over_context.clearRect(0,0,this.over_canvas.width()*this.overlay_scale,this.over_canvas.height()*this.overlay_scale);
	    
	    for (var ovr in this.overlays) {
		if ((this.overlays[ovr].length == this.images.length)
		    && this.overlays_enable[ovr]) {
		    this.over_context.putImageData(this.overlays[ovr][this.cur_img],0,0);
		}
		break
		// TODO: drawImage if we use more than one overlay
	    }
	    
	    if (this.canvas_mouse.drawing) {
		this.over_context.beginPath();
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
        this.canvas_mouse["sep"] = 0;
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
	return this.__pix_to_world(this.canvas_mouse.startX,this.canvas_mouse.startY);
    };


    this.__world_to_pix = function (ra,dec) {
        var torad = Math.PI/180.0,
	    scale = 3600.0/2.75,
	    ra = ra*torad,
	    dec = dec*torad,
	    ra0 = this.CRVAL1*torad,
	    dec0 = this.CRVAL2*torad,
	    cosc = Math.sin(dec0)*Math.sin(dec)+Math.cos(dec0)*Math.cos(dec)*Math.cos(ra-ra0),
	    x = (Math.cos(dec)*Math.sin(ra-ra0))/cosc,
	    y = (Math.cos(dec0)*Math.sin(dec)-Math.sin(dec0)*Math.cos(dec)*Math.cos(ra-ra0))/cosc,
	    x = (x/torad)*scale*-1,
	    y = (y/torad)*scale;

	// Offset from center of tile
	x = x+this.CRPIX1
	y = y+this.CRPIX2

	// flip y axis
	y = this.NAXIS2 - y

	// Nudge for fitsiness to center of pixel? Why?
	x = x-0.5
	y = y+0.5
	
	return {"px": x, "py": y};
    };

    this.__pix_to_world = function (x,y) {
        var // Radians
	    torad = Math.PI/180.0,
	    scale = 3600.0/2.75,
	    // Un-fits-nudge
	    x = x+0.5,
	    y = y-0.5,
	    // Un-flip y axis
	    y = this.NAXIS2 - y,
	    // Move off of tile center
	    x = x - this.CRPIX1,
	    y = y - this.CRPIX2,
	    // Undo CD matrix transformations
	    x = x * -1,
	    x = x / scale,
	    y = y / scale,
	    // Back to radians
	    x = x * torad,
	    y = y * torad,
	    ra0 = this.CRVAL1*torad,
	    dec0 = this.CRVAL2*torad,
	    p = Math.sqrt(Math.pow(x,2)+Math.pow(y,2)),
	    c = Math.atan(p),
	    dec = Math.asin(Math.cos(c)*Math.sin(dec0)+((y*Math.sin(c)*Math.cos(dec0))/p)),
	    ra = ra0+Math.atan2(x*Math.sin(c),p*Math.cos(dec0)*Math.cos(c)-y*Math.sin(dec0)*Math.sin(c)),
	    // Back from radians
	    ra = ra/torad,
	    dec = dec/torad;

	return {"ra": ra, "dec": dec};
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
	    window.open("/wiseview-v3#"+this.buildUrl(pos.ra,pos.dec,size=fov,zoom=(current_fov*current_zoom)/fov,diff=0));
	} else {
	    window.open("/wiseview-v3#"+this.buildUrl(pos.ra,pos.dec,size=fov,zoom=(current_fov*current_zoom)/fov));
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


    this.__get_cutouts = function (meta) {
	// Get all the cutouts
	for (var e = 0; e < meta["ims"].length; e++) {
	    new_img = document.createElement("img");
	    new_img.setAttribute("src", "https://amnh-citsci-public.s3-us-west-2.amazonaws.com/"+meta["ims"][e]);
	    jQuery(new_img).on("load", function () {
		// TODO: Review
		that.real_img_size = [this.width, this.height];
		that.updateZoom();
	    });
	    that.images.push(new_img);
	}
    };


    this.get_cutouts = function (ra,dec,size,band) {
	var bound_band = band;

	jQuery.ajax({
	    url: "https://vjxontvb73.execute-api.us-west-2.amazonaws.com/png-animation",
	    datatype: "jsonp",
	    data: {ra: ra, dec: dec, band: band, size: size,
		   max_dyr: this.maxdyr_input.prop("checked") ? 1 : 0,
		   minbright: symexp10(this.trimbright.low()).toFixed(4),
		   maxbright: symexp10(this.trimbright.high()).toFixed(4),
		   invert: this.invert_input.prop("checked") ? 1 : 0,
		   stretch: this.linear_input.slider("option","value"),
		   diff: this.diff_input.prop("checked") ? 1 : 0,
		   scandir: this.scandir_input.prop("checked") ? 1 : 0,
		   outer: this.outer_epochs_input.prop("checked") ? 1 : 0,
		   neowise: this.neowise_only_input.prop("checked") ? 1 : 0,
		   window: this.window_input.slider("option","value"),
		   diff_window: this.diff_window_input.slider("option","value"),
		   unique: this.unique_windows_input.prop("checked") ? 1 : 0,
		   smooth_scan: this.smooth_scan_input.prop("checked") ? 1 : 0,
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
		that.__get_cutouts(meta);
		var mjd_bot = Math.min(...meta["all_mjds"]),
		    mjd_top = Math.max(...meta["all_mjds"]);

		that.global_mjds = meta["all_mjds"];
		that.window_mjds = meta["mjds"];
		that.window_epochs = meta["epochs"];
		that.window_antiepochs = "neg_epochs" in meta ? meta["neg_epochs"] : [];
		    
		that.updateWindowLimits((mjd_top-mjd_bot)/365.25);
		that.updateDiffWindowLimits((mjd_top-mjd_bot)/365.25);
		that.trimbright.update_limits(meta["min"],meta["max"]);

		that.CRPIX1 = meta["CRPIX1"];
		that.CRPIX2 = meta["CRPIX2"];
		that.CRVAL1 = meta["CRVAL1"];
		that.CRVAL2 = meta["CRVAL2"];
		that.NAXIS1 = meta["NAXIS1"];
		that.NAXIS2 = meta["NAXIS2"];

		// make catalog overlays
		that.overlays_enable["gaiadr2"] = false;
		if (that.gaia_input.prop("checked")) {
		    that.query_gaia(ra,dec,size);
		    // Doesn't need to be synched w/ ^
		    that.overlays_enable["gaiadr2"] = true;
		}
		
		that.updateMjds();
		that.updateEpochs();
		that.updateZoom();
		that.unblock();
	    },
	    retries: 6,
	    error: function(xhr, textStatus, errorThrown) {
		if (xhr.status != 504 || this.retries-- <= 0) {
		    return;
		}
		jQuery.ajax(this);
	    }});
    };

    

    this.updateMjds = function () {
	// Update the list of date ranges
	var versions = [];
	
	// For each frame, find lowest and highest mjd, and convert to
	// a string for the UI
	for (var i = 0; i < this.window_mjds.length; i++) {
	    var low = Math.min(...this.window_mjds[i]),
		high = Math.max(...this.window_mjds[i]);
	    versions.push(mjd_to_aarondate(low)+" - "+mjd_to_aarondate(high))
	}

	this.versions = versions;
    };


    this.updateEpochs = function () {
	// Find smallest, largest, and cardinality of epochs
	var band = 1;
	
	if (this.window_epochs.length == 0) {
	    band = 2;
	}
	
	res = [];
	for (var i = 0; i < this.window_epochs.length; i++) {
	    var res2 = [];

	    for (var j = 0; j < this.global_mjds.length; j++) {
		if (this.window_epochs[i].indexOf(j) != -1) {
		    res2.push("+");
		} else if (this.window_antiepochs.length > 0 &&
			   this.window_antiepochs[i].indexOf(j) != -1) {
		    res2.push("-");
		} else {
		    res2.push(".");
		}
	    }
	    res.push(res2.join(""));
	}
	
	this.epoch_legend = res;
    };


    this.query_gaia = function (ra,dec,size) {
	var size_deg = (size/3600.)*2.75,
	    path = "https://n7z4i9pzx8.execute-api.us-west-2.amazonaws.com/prod/catalog/gaiadr2", //"https://gea.esac.esa.int/tap-server/tap/sync",
	    params = {
		request: "doQuery",
		lang: "adql",
		format: "json",
		query: "SELECT ra, dec, parallax, pmra, pmdec "+
		    "FROM gaiaedr3.gaia_source "+
		    "WHERE 1=CONTAINS(POINT('ICRS',ra,dec), "+
		    "  CIRCLE('ICRS',"+ra+","+dec+","+size_deg+"))"
	    },
	    that = this;
	return jQuery.post(path,params,function (data,status) {
	    // Required ra, dec, plx, pmra, pmdec
	    var rows = data["data"],
		frames = [],
		base_mjd = 57204, // 2015.5
		window_mjds = that.window_mjds,
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
		radec = that.__pix_to_world(pxpy["px"],pxpy["py"]);
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
			//ctx.strokeStyle = "#00aa00";
			ctx.strokeStyle = "#aa0000";
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

	this.get_cutouts(ra,dec,size,band);

	if (this.diff_input.prop("checked")) {
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

    this.showhide_diff = function(evt) {
	if (evt.target.checked) {
	    jQuery("#diffWindowRow").show();
	} else {
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
    jQuery("#linearInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#trimbrightInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#windowInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#diffWindowInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#tabs button").on("click", ws.tabClick.bind(ws));
    jQuery("#setDefaultsButton").on("click", ws.setDefaults.bind(ws));
    jQuery("#diffInput").on("change", ws.showhide_diff.bind(ws));
    jQuery("#shiftInput").on("change", ws.showhide_shift.bind(ws));
    jQuery("#synthAInput").on("change", ws.showhide_synth_a.bind(ws));
    jQuery("#synthBInput").on("change", ws.showhide_synth_b.bind(ws));
    jQuery("#gaiaInput").on("change", ws.gaia_toggle.bind(ws));
});

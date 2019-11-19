var url = "/convert?";

function mjd_to_aarondate(mjd) {
    d = new Date(-3506716800000+(mjd*86400000))
    return d.getFullYear()+"."+(((d.getMonth()/12.0)*10).toPrecision(1))
}


function arr_flat(arr) {
    return arr.reduce((acc, val) => acc.concat(val), []);
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
	this.window_mjds = {
	    1: [],
	    2: []
	};
	this.cutouts = {
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
	
	this.cutout_states = {
	    // 0 = not started
	    // 1 = started
	    // 2 = done
	    // 3 = error
	    1: 0,
	    2: 0
	};
	
	this.cutout_workers = {
	    // Number of workers currently running
	    1: 0,
	    2: 0
	};
	
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

    this.full_depth_versions = ["allwise", "neo1", "neo2", "neo3"];

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
    this.pmra_input = jQuery("#pmraInput");
    this.pmdec_input = jQuery("#pmdecInput");
    this.border_input = jQuery("#borderInput");
    this.adv_input = jQuery("#advInput");
    this.invert_input = jQuery("#invertInput");
    this.scandir_input = jQuery("#scandirInput");
    this.neowise_only_input = jQuery("#neowiseOnlyInput");
    this.diff_input = jQuery("#diffInput");
    this.guess_bright_input = jQuery("#guessBrightInput");
    this.outer_epochs_input = jQuery("#outerEpochsInput");
    this.unique_windows_input = jQuery("#uniqueWindowInput");
    this.context = this.canvas.get(0).getContext("2d");

    this.updateSpeed = function () {
        clearInterval(this.interval);
        this.interval = setInterval(this.frame.bind(this), +this.speed_input.slider("option","value"));
        this.updateUrl();
    };


    this.buildUrl = function (ra, dec, size = null, zoom = null) {
	if (size === null) {
	    size = this.size_input.val();
	}
	if (zoom === null) {
	    zoom = this.zoom_input.slider("option","value");
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
	    linear: this.linear_input.slider("option","value"),
	    color: this.color_input.val(),
	    zoom: zoom,
	    border: this.border_input.prop("checked") ? 1 : 0,
	    adv: this.adv_input.prop("checked") ? 1 : 0,
	    invert: this.invert_input.prop("checked") ? 1 : 0,
	    scandir: this.scandir_input.prop("checked") ? 1 : 0,
	    neowise: this.neowise_only_input.prop("checked") ? 1 : 0,
	    diff: this.diff_input.prop("checked") ? 1 : 0,
	    guess_bright: this.guess_bright_input.prop("checked") ? 1 : 0,
	    outer_epochs: this.outer_epochs_input.prop("checked") ? 1 : 0,
	    unique_window: this.unique_windows_input.prop("checked") ? 1 : 0,
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
        this.canvas.attr("width", this.real_img_size[0]).attr("height", this.real_img_size[1]);

	if (zoom === undefined) {
            zoom = this.zoom_input.slider("option","value");
	}

        this.canvas.css("width", this.real_img_size[0] * zoom).css("height", this.real_img_size[1] * zoom);

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
	    
        this.pmra_input.val(0);
        this.pmdec_input.val(0);
        this.border_input.prop("checked", true);
        this.invert_input.prop("checked", true);
        this.scandir_input.prop("checked", false);
        this.neowise_only_input.prop("checked", false);
        this.diff_input.prop("checked", false);
        this.guess_bright_input.prop("checked", true);
        this.outer_epochs_input.prop("checked", false);
        this.unique_windows_input.prop("checked", true);
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
	    
        this.pmra_input.val(map.pmra || 0);
        this.pmdec_input.val(map.pmdec || 0);
        this.border_input.prop("checked", (map.border || 0) == 1);
        this.adv_input.prop("checked", (map.adv || 0) == 1);
        this.invert_input.prop("checked", (map.invert || 1) == 1);
        this.scandir_input.prop("checked", (map.scandir || 0) == 1);
        this.neowise_only_input.prop("checked", (map.neowise || 0) == 1);
        this.diff_input.prop("checked", (map.diff || 0) == 1);
        this.guess_bright_input.prop("checked", (map.guess_bright || 1) == 1);
        this.outer_epochs_input.prop("checked", (map.outer_epochs || 0) == 1);
        this.unique_windows_input.prop("checked", (map.unique_window || 1) == 1);
        this.update_zoom_input((Number(map.zoom) || 9));

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
	    this.canvas.css("border","");
        } else if (this.cur_img == 0) {
	    this.canvas.css("border","3px dashed #999999");
	    jQuery("#pawnstars img").css("border","3px dashed #000000");
        } else {
	    this.canvas.css("border","3px dashed #000000");
	    jQuery("#pawnstars img").css("border","3px dashed #000000");
        }
    };

    
    this.draw = function () {
        if (!isNaN(this.cur_img)) {
	    var image = this.images[this.cur_img];
	    //this.context.drawImage(image, 0, 0);
	    this.context.putImageData(image,0,0);
	    if (this.canvas_mouse.drawing) {
		this.context.beginPath();
		//console.log("Start: "+this.canvas_mouse.startX+" sep: "+(this.canvas_mouse.sep/2)+" tot: "+(this.canvas_mouse.startX-(this.canvas_mouse.sep/2)));
		this.context.rect(this.canvas_mouse.startX-this.canvas_mouse.sep,
				  this.canvas_mouse.startY-this.canvas_mouse.sep,
				  this.canvas_mouse.sep*2,this.canvas_mouse.sep*2);
		this.context.lineWidth = 1;
		this.context.strokeStyle = "yellow";
		this.context.stroke();
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
        this.canvas_mouse.x = (evt.pageX - (canvas.offsetLeft+canvas.clientLeft)) * scaleX;
        this.canvas_mouse.y = (evt.pageY - (canvas.offsetTop+canvas.clientTop)) * scaleY;
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
	    rad = -((((this.canvas_mouse.startX-(head.cards.CRPIX1.value))*2.75)/3600)/(Math.cos(dec*(Math.PI/180)))),
	    decd = -(((this.canvas_mouse.startY-(head.cards.NAXIS2.value - head.cards.CRPIX2.value))*2.75)/3600),
	    ra = ra+rad, dec = dec+decd;
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

	window.open("/wiseview-v2#"+this.buildUrl(pos.ra,pos.dec,size=fov,zoom=(current_fov*current_zoom)/fov));
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


    this.get_cutouts = function (ra,dec,size,band) {
	var bound_band = band;
	console.log("Downloading and parsing unWISE FITS cutouts")
	jQuery.getJSON(
	    "/tiles", {"ra": ra, "dec": dec},
	    function (response) {
		var tile = response["tiles"][0];

		// Get all the cutouts
		var promises = [];
		for (var e = 0; e < tile["epochs"].length; e++) {
		    var meta = tile["epochs"][e],
			band = Number(bound_band),
			epoch_ = Number(meta["epoch"]),
			band_ = Number(meta["band"]);
		    if ((band_ & band) == 0) {
			// If not doing this band, return
			continue;
		    }
		    for (var i = that.cutouts[band_].length-1; i < epoch_; i++) {
			that.cutouts[band_].push(null);
		    }
		    
		    promises.push(new Promise(function(res,rej) {
			var your_epoch_ = epoch_,
			    your_band_ = band_;
			jQuery.ajax({
			    url: "https://n7z4i9pzx8.execute-api.us-west-2.amazonaws.com/prod/cutout",
			    data: { coadd_id: tile["coadd_id"], ra: ra, dec: dec, px: tile["px"], py: tile["py"],
				    size: size, epoch: your_epoch_, band: your_band_, covmap: true},
			    //xhrFields: { responseType: "arrayBuffer" },
			    //headers: { "Access-Control-Allow-Origin": "*" },
			    success: function (buf) {
				var shit = atob(buf),
				    js_is_embarassing = new Uint8Array(shit.length);
				for (var i = 0; i < shit.length; i++) {
				    js_is_embarassing[i] = shit.charCodeAt(i);
				}
				shit = new Blob([js_is_embarassing], {type: "application/octet-stream"});
				new astro.FITS(shit, function () {
				    hdim = this.getHDU(0)
				    hdcm = this.getHDU(1)
				    
				    // Assign header to header array
				    that.headers[your_band_][your_epoch_] = hdim.header;

				    var p1 = new Promise(function (resp1,rejp1) {
					// Assign fetched cutout to cutouts array
					hdim.data.getFrame(0, function (arr) {
					    cards = that.headers[your_band_][your_epoch_].cards;
					    that.cutouts[your_band_][your_epoch_] = nj.float32(arr).reshape(cards.NAXIS2.value,cards.NAXIS1.value);
					    resp1();
					});
				    }), p2 = new Promise(function (resp2,rejp2) {
					// coverage maps
					hdcm.data.getFrame(0, function (arr) {
					    cards = that.headers[your_band_][your_epoch_].cards;
					    var zz = nj.float32(arr).reshape(cards.NAXIS2.value,cards.NAXIS1.value);
					    that.covmaps[your_band_][your_epoch_] = zz;
					    resp2();
					});
				    });
				    Promise.all([p1,p2]).then(function () { res(); });
				});
			    }});
		    }));
		}
		Promise.all(promises).then(function () {
		    var lastmjdmin = null, firstmjdmin = null;
		    for (var e = 0; e < tile["epochs"].length; e++) {
			var meta = tile["epochs"][e];
			if (lastmjdmin === null || Number(meta["mjdmean"]) > lastmjdmin) {
			    lastmjdmin = Number(meta["mjdmean"]);
			}
			if (firstmjdmin === null || Number(meta["mjdmean"]) < firstmjdmin) {
			    firstmjdmin = Number(meta["mjdmean"]);
			}
		    }
		    
		    that.updateWindowLimits((lastmjdmin-firstmjdmin)/365.25);
		    
		    // make some images
		    that.make_images();
		});
	    }
	);
    };

    

    this.updateMjds = function () {
	// Update the list of date ranges
	var window = this.window_input.slider("option","value")*365.25,
	    versions = [],
	    band = 1;
	
	if (this.window_mjds[1].length == 0) {
	    band = 2;
	}

	var bot = this.window_mjds[band][0],
	    top = this.window_mjds[band][this.window_mjds[band].length-1];
	
	for (var i = 0; i < this.window_mjds[band].length; i++) {
	    var low = this.window_mjds[band][i]-window,
		high = this.window_mjds[band][i]+window;
	    low = Math.min(Math.max(low,bot),top);
	    high = Math.min(Math.max(high,bot),top);
	    versions.push(mjd_to_aarondate(low)+" - "+mjd_to_aarondate(high))
	}

	this.versions = versions;
    };


    this.updateEpochs = function () {
	// TODO ME TOO. Dots down left side, optional
	// Find smallest, largest, and cardinality of epochs
	var band = 1;
	
	if (this.window_epochs[band].length == 0) {
	    band = 2;
	}

	var flat = arr_flat(this.window_epochs[band]),
	    unique = [];
	
	for (var i = 0; i < flat.length; i++) {
	    if (flat.indexOf(flat[i]) == i) {
		unique.push(flat[i]);
	    }
	}

	unique = unique.sort();

	unique = []
	for (var i = 0; i < this.cutouts[band].length; i++) {
	    unique.push(i);
	}

	var min = Math.min(unique),
	    max = Math.max(unique),
	    res = [];
	for (var i = 0; i < this.window_epochs[band].length; i++) {
	    var res2 = [];
	    for (var j = 0; j < unique.length; j++) {
		if (this.window_epochs[band][i].indexOf(unique[j]) != -1) {
		    res2.push("+");
		} else if (this.window_antiepochs[band][i].indexOf(unique[j]) != -1) {
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
					user_linear) {
	var r = [];
	    
	// Find minimum and maximum pixel values
	var min = ims.min(), max = ims.max();

	this.trimstack(ims,user_minbright,user_maxbright);

	// Normalize to 0 - 1
	ims = ims.subtract(ims.min()).divide(ims.max() - ims.min());
	
	// Stretch
	if (user_linear < 0.99) {
	    ims = asinh_stretch(ims,user_linear);
	    ims = ims.subtract(ims.min()).divide(ims.max() - ims.min()); // 0-1 again
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
	if (scandir) {
	    // Separate scandir
	    return nj.concatenate(
		// ALWAYS forward THEN backward
		nj.stack(this.__make_windowed_images(range,band,sep_scandir=scandir,forward=true,neowise=neowise,diff=diff,unique=unique,outer=outer,mindiff=mindiff,maxdiff=maxdiff)).T,
		nj.stack(this.__make_windowed_images(range,band,sep_scandir=scandir,forward=false,neowise=neowise,diff=diff,unique=unique,outer=outer,mindiff=mindiff,maxdiff=maxdiff)).T).T;
	} else {
	    // Don't separate scandir
	    return nj.stack(this.__make_windowed_images(range,band,sep_scandir=scandir,forward=false,neowise=neowise,diff=diff,unique=unique,outer=outer,mindiff=mindiff,maxdiff=maxdiff));
	}
    };
    

    this.make_images = function () {
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
	    guess = this.guess_bright_input.prop("checked");

	if (bands&1) {		
	    for (var i = 0; i < this.cutouts[1].length; i++) {
		var min = this.cutouts[1][i].min(),
		    max = this.cutouts[1][i].max();
		if (w1_realmin == null || min < w1_realmin) {
		    w1_realmin = min;
		}
		if (w1_realmax == null || max > w1_realmax) {
		    w1_realmax = max;
		}
	    }

	    if (guess) {
		var w1_meanmean = 0;
		for (var i = 0; i < this.cutouts[1].length; i++) {
		    w1_meanmean += this.cutouts[1][i].mean();
		}
		w1_meanmean = Math.max(w1_meanmean / this.cutouts[1].length,250.0);
	    }
	    console.log("Building W1 meta coadds")
	    w1_ims = this.__make_images_inner(range,1,scandir,neowise,diff,unique,outer,
					      guess ? -50.0 : user_mindiff,
					      guess ? w1_meanmean*2.0 : user_maxdiff);
	    console.log("Clipping and stretching W1 meta coadds")
	    w1 = this.trim_and_normalize(w1_ims,
					 guess ? -w1_meanmean : user_minbright,
					 guess ? w1_meanmean : user_maxbright,
					 linear);
	}
	
	if (bands&2) {
	    
	    for (var i = 0; i < this.cutouts[2].length; i++) {
		var min = this.cutouts[2][i].min(),
		    max = this.cutouts[2][i].max();
		if (w2_realmin == null || min < w2_realmin) {
		    w2_realmin = min;
		}
		if (w2_realmax == null || max > w2_realmax) {
		    w2_realmax = max;
		}
	    }

	    if (guess) {
		var w2_meanmean = 0;
		for (var i = 0; i < this.cutouts[2].length; i++) {
		    w2_meanmean += this.cutouts[2][i].mean();
		}
		w2_meanmean = Math.max(w2_meanmean / this.cutouts[2].length,250.0);
	    }

	    console.log("Building W2 meta coadds")
	    w2_ims = this.__make_images_inner(range,2,scandir,neowise,diff,unique,outer,
					      guess ? -50.0 : user_mindiff,
					      guess ? w2_meanmean*2.0 : user_maxdiff);
	    console.log("Clipping and stretching W2 meta coadds")
	    w2 = this.trim_and_normalize(w2_ims,
					 guess ? -w2_meanmean : user_minbright,
					 guess ? w2_meanmean : user_maxbright,
					 linear);
	}

	var minmin = bands == 3 ? Math.min(w2_realmin,w1_realmin)
	    : bands == 2 ? w2_realmin
	    : w1_realmin,
	    maxmax = bands == 3 ? Math.max(w2_realmax,w1_realmax)
	    : bands == 2 ? w2_realmax
	    : w1_realmax,
	    meanmean = bands == 3 ? Math.max(w2_meanmean,w1_meanmean)
	    : bands == 2 ? w2_meanmean
	    : w1_meanmean;
	

	if (diff) {
	    console.log("Difference imaging")
	    minmin = Math.min(minmin,-maxmax);
	}
	
	console.log("Packing meta coadds into canvas frames")
	// Set min/max to image min/max
	this.trimbright.update_limits(minmin,maxmax);
	// Set value low/high to inner of settings and image min/max
	this.trimbright.update_values(
	    Math.max(guess ? -meanmean : user_minbright,minmin),
	    Math.min(guess ? meanmean : user_maxbright,maxmax));
	
	// Set min/max to image min/max
	this.diffbright.update_limits(minmin,maxmax);
	// Set value low/high to inner of settings and image min/max
	this.diffbright.update_values(
	    Math.max(guess ? -50.0 : user_mindiff,minmin),
	    Math.min(guess ? meanmean*2 : user_maxdiff,maxmax));

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

	this.updateMjds();
	this.updateEpochs();
        this.updateZoom();
	this.unblock();
    }

    
    this.notifygo = function () { console.log("Fired input changed"); }

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
	var size = (~~(that.size_input.val()/2.75)); // Convert arcseconds to pixels
	var band = that.band_input.val();

	// Disable/enable pertinent sliders
	this.trimbright.enable();
	this.diffbright.enable();
	if (!this.diff_input.prop("checked")) {
	    this.diffbright.disable();
	}
	if (jQuery("#guessBrightInput").prop("checked")) {
	    this.trimbright.disable();
	    this.diffbright.disable();
	}

	this.get_cutouts(ra,dec,size,band);

	// hide/show advanced settings
	if (this.adv_input.prop("checked")) {
	    jQuery("#advSettings").show();
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

    jQuery("#daCanvas").on("mouseup", ws.move_up.bind(ws));
    jQuery("#daCanvas").on("mousedown", ws.move_down.bind(ws));
    jQuery("#daCanvas").on("mousemove", ws.move_move.bind(ws));
    jQuery(".resetters").on("change", ws.restart.bind(ws));
    //jQuery("#speedInput").on('change', ws.updateSpeed.bind(ws));
    //jQuery("#zoomInput").on('change', ws.updateZoom.bind(ws));
    jQuery("#linearInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#trimbrightInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#diffbrightInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#windowInput").on("slidestop", ws.restart.bind(ws));
    jQuery("#tabs button").on("click", ws.tabClick.bind(ws));
    jQuery("#setDefaultsButton").on("click", ws.setDefaults.bind(ws));
    jQuery("#setDiffButton").on("click", ws.setDiff.bind(ws));
    jQuery("#setPrePostButton").on("click", ws.setPrePost.bind(ws));
    jQuery("#setParallaxEnhancingButton").on("click", ws.setParallaxEnhancing.bind(ws));
    jQuery("#setTimeResolvedButton").on("click", ws.setTimeResolved.bind(ws));
    jQuery("#advInput").on("change", ws.showhide_adv.bind(ws));
});

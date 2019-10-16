var url = "/convert?";

function mjd_to_aarondate (mjd) {
    d = new Date(-3506716800000+(mjd*86400000))
    return d.getFullYear()+"."+(((d.getMonth()/12.0)*10).toPrecision(1))
}


function median (arr) {
    const mid = Math.floor(arr.length / 2),
	  nums = [...arr].sort((a, b) => a - b);
    return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function average (list) {
    res = list[0]
    for (var i = 1; i < list.length; i ++) {
	res = res.add(list[i]);
    }
    return res.divide(list.length);
}

function symlog10 (x) {
    if (x == 0) {
	return 0;
    } else if (x < 0) {
	return -Math.log10(-x);
    } else {
	return Math.log10(x);
    }
}

function symexp10 (x) {
    if (x == 0) {
	return 0;
    } else if (x < 0) {
	return -(10**(-x));
    } else {
	return 10**x;
    }
}

function WiseSwapper () {
    var this_ = this;
    var that = this;
    this.reset_locals = function () {
	this.versions = [];
	this.epochs = [];
	this.cutouts = {
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
    this.linear_input = jQuery("#linearInput");
    this.linear_output = jQuery("#linearValue")

    // Make percentile check and bind function to swap
    // between percentile and fixed pixel values
    this.percentile_input = jQuery("#percentileInput");
    this.percentile_change = function () {
	if (this.percentile_input.prop("checked")) {
	    // Changed TO percentile
	    var old_min = this.trimbright_input.slider("option","values")[0],
		real_min = symexp10(old_min),
		new_min = ((real_min-this.im_minbright)
			   / (this.im_maxbright-this.im_minbright)) * 100,
		old_max = this.trimbright_input.slider("option","values")[1],
	        real_max = symexp10(old_max),
		new_max = ((real_max-this.im_minbright)
			   / (this.im_maxbright-this.im_minbright)) * 100;
	    console.log(old_min+" "+new_min+" "+old_max+" "+new_max);
	    this.updateTrimbrightValues(new_min,new_max);
	} else {
	    // Changed FROM percentile
	    var old_min = this.trimbright_input.slider("option","values")[0],
		new_min = ((old_min / 100.0)
			   * (this.im_maxbright-this.im_minbright)) + this.im_minbright,
		old_max = this.trimbright_input.slider("option","values")[1],
		new_max = ((old_max / 100.0)
			    * (this.im_maxbright-this.im_minbright)) + this.im_minbright;
	    console.log(old_min+" "+new_min+" "+old_max+" "+new_max);
	    this.updateTrimbrightValues(new_min,new_max);
	}
	this.updateTrimbrightLimits(this.im_minbright,this.im_maxbright);	
    };
    
    // Make the trimbright slider and dynamic label
    this.trimbright_input = jQuery("#trimbrightInput");
    this.trimbright_output = jQuery("#trimbrightValue");
    this.im_minbright = 0.0;
    this.im_maxbright = 100.0;
    this.trimbright_scale = function (bright) {
	console.log("scale"+this.percentile_input.prop("checked")+" "+bright+" "+this.im_minbright+" "+this.im_maxbright)
	// Convert percent or fixed (log) slider input to actual
	if (this.percentile_input.prop("checked")) {
	    return (this.im_maxbright-this.im_minbright)*(bright/100.0)+this.im_minbright;
	} else {
	    return symexp10(bright);
	}
    };
    this.trimbright_input.slider({
	range: true,
	min: 0.0,
	max: 100.0,
	values: [0.0, 100.0],
	slide: function(event, ui) {
	    jQuery("#trimbrightValue").text(
		Math.round(that.trimbright_scale(ui.values[0])) + " - "
		    + Math.round(that.trimbright_scale(ui.values[1])));
	}
    });
    this.updateTrimbrightLimits = function (min,max) {
	console.log("lim"+this.percentile_input.prop("checked")+" "+min+" "+max)
	this.im_minbright = min; this.im_maxbright = max;
	min = this.percentile_input.prop("checked") ? 0.0 : symlog10(min);
	max = this.percentile_input.prop("checked") ? 100.0 : symlog10(max);
	this.trimbright_input.slider("option","min",min);
	this.trimbright_input.slider("option","max",max);
	this.trimbright_input.slider("option","step",(max-min)/1000.);
    };
    this.updateTrimbrightValues = function (low,high) {
	console.log("val"+this.percentile_input.prop("checked")+" "+low+" "+high)
	if(this.percentile_input.prop("checked")) {
	    this.trimbright_input.slider("option","values",[Math.max(0,low),
							    Math.min(100,high)]);
	} else {
	    this.trimbright_input.slider("option","values",[symlog10(low),
							    symlog10(high)]);
	}
	jQuery("#trimbrightValue").text(Math.round(low)+" - "+Math.round(high));
    }

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
    this.coadd_mode_input = jQuery("#coaddModeInput");
    this.speed_input = jQuery("#speedInput");
    this.speed_output = jQuery("#speedValue");
    this.zoom_input = jQuery("#zoomInput");
    this.zoom_output = jQuery("#zoomValue");
    this.ver_output = jQuery("#verValue");
    this.canvas = jQuery("#daCanvas");
    this.pmra_input = jQuery("#pmraInput");
    this.pmdec_input = jQuery("#pmdecInput");
    this.border_input = jQuery("#borderInput");
    this.invert_input = jQuery("#invertInput");
    this.scandir_input = jQuery("#scandirInput");
    this.diff_input = jQuery("#diffInput");
    this.context = this.canvas.get(0).getContext("2d");

    this.updateSpeed = function () {
        clearInterval(this.interval);
        this.speed_output.text(this.speed_input.val());
        this.interval = setInterval(this.frame.bind(this), +this.speed_input.val());
        this.updateUrl();
    };

    
    this.updateUrl = function () {
	// Update URI parameters from values in DOM
        var loc_split = this.parseLoc(); // RA, Dec
        var args = {
	    ra: loc_split[0], 
	    dec: loc_split[1], 
	    size: this.size_input.val(), 
	    band: this.band_input.val(), 
	    speed: this.speed_input.val(), 
	    minbright: this.trimbright_scale(this.trimbright_input.slider("option","values")[0]).toFixed(4),
	    maxbright: this.trimbright_scale(this.trimbright_input.slider("option","values")[1]).toFixed(4),
	    linear: this.linear_input.val(),
	    color: this.color_input.val(),
	    percentile: this.percentile_input.val(),
	    coadd_mode: this.coadd_mode_input.val(),
	    zoom: this.zoom_input.val(),
	    border: this.border_input.prop("checked") ? 1 : 0,
	    invert: this.invert_input.prop("checked") ? 1 : 0,
	    scandir: this.scandir_input.prop("checked") ? 1 : 0,
	    diff: this.diff_input.prop("checked") ? 1 : 0,
        };

	// Get pmra/pmdec if pertinent mode
        if (this.coadd_mode_input.val() == "shift-and-add" ||
	    this.coadd_mode_input.val() == "daniella") {
	    args["pmra"] = this.pmra_input.val();
	    args["pmdec"] = this.pmdec_input.val();
        }
        
        window.location.hash = jQuery.param(args);
    };

    
    this.updateOtherSliders = function () {
        this.linear_output.text((this.linear_input.val()))
        //this.trimbright_output.text((this.trimbright_input.val()))
        this.updateUrl();
    }

    
    this.updateZoom = function () {
        this.zoom_output.text((this.zoom_input.val() * 100) + "%");

        if (!this.real_img_size) {
	    return;
        }

        var size = this.size_input.val();
        this.canvas.attr("width", this.real_img_size[0]).attr("height", this.real_img_size[1]);

        var zoom = this.zoom_input.val();
        this.canvas.css("width", this.real_img_size[0] * zoom).css("height", this.real_img_size[1] * zoom);

        this.updateUrl();
        this.draw();
    };

    
    this.updatePawnstars = function () {
        var loc_split = this.parseLoc();

        jQuery.getJSON("/pawnstars", {
	    "ra": loc_split[0],
	    "dec": loc_split[1],
	    "size": this.size_input.val()*4 // arcseconds to pixels
        }, function (response) {
	    var new_img = document.createElement("img");
	    new_img.setAttribute("src", response)
	    jQuery("#pawnstars").empty().append(new_img);
        });
    };

    
    this.updateZooiSubjects = function () {
        var loc_split = this.parseLoc();
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

	// Build link to legacysurvey viewer
        jQuery("#legacySurvey")[0].setAttribute("href","http://legacysurvey.org/viewer?ra="+loc_split[0]+"&dec="+loc_split[1]+"&zoom=13&layer=unwise-neo4")
        
    }

    
    this.fromUrl = function () {
	// Get parameters from URI
        var raw = window.location.hash.substr(1);
        var map = {};
        raw.split("&").forEach(function (kv) {
	    var split = kv.split("=");
	    map[split[0]] = split[1];
        });
        this.loc_input.val((unescape(map.ra) || "") + " " + ((unescape(map.dec) || "")));
        this.size_input.val(map.size || 60);
        this.band_input.val(map.band || 2);
        this.speed_input.val(map.speed || 500);
        this.color_input.val(map.color || "gray");
        this.percentile_input.prop("checked", (map.percentile || 0) == 1);
        
        var cmi = (map.coadd_mode || "time-resolved");
        var found = false;
        for (var i=0; i < this.coadd_mode_input[0].options.length; i++) {
	    if (this.coadd_mode_input[0].options[i].value == cmi) {
		found = true;
		break;
	    }
        }
        
        if (!found) {
	    var opt = new Option(cmi,cmi);
	    this.coadd_mode_input.append(opt);
        }
        
        this.coadd_mode_input.val(cmi)
        this.linear_input.val(map.linear || 0.2);

	// Update trimbright UI element
	var minbright_ = map.minbright || -50,
	    maxbright_ = map.maxbright || 500;
        this.updateTrimbrightValues(minbright_,maxbright_);

	// Update window UI element
	this.updateWindowValue(map.window || 0.5);
	    
        this.pmra_input.val(map.pmra || 0);
        this.pmdec_input.val(map.pmdec || 0);
        this.border_input.prop("checked", (map.border || 0) == 1);
        this.invert_input.prop("checked", (map.invert || 0) == 1);
        this.scandir_input.prop("checked", (map.invert || 0) == 1);
        this.diff_input.prop("checked", (map.invert || 0) == 1);
        this.zoom_input.val(map.zoom || 10);

        this.restart();
    };

    
    this.parseLoc = function () {
        var loc_split = /([0-9\.]+).*?([+\-]{0,1}[0-9\.]+)/g.exec(unescape(this.loc_input.val()));
        return [loc_split[1].trim(), loc_split[2].trim()];
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
        this.ver_output.text(this.versions[this.cur_img]);

	// Draw border for epoch 0 if option set
        if (!this.border_input.prop("checked")) {
	    this.canvas.css("border","");
        } else if (this.cur_img == 0) {
	    this.canvas.css("border","3px dashed #999999");
        } else {
	    this.canvas.css("border","3px dashed #000000");
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
	    this.move_fov(this.canvas_mouse.sep*2.75*2);
        } else {
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

    
    this.move_fov = function (fov) {
        var canvas = this.canvas[0];
        var loc = this.parseLoc(),
	    ra = parseFloat(loc[0]),
	    dec = parseFloat(loc[1]),
	    rad = -((((this.canvas_mouse.startX-(canvas.width/2))*2.75)/3600)/(Math.cos(dec*(Math.PI/180)))),
	    decd = -(((this.canvas_mouse.startY-(canvas.height/2))*2.75)/3600);
        
        this.loc_input.val(""+(ra+rad)+" "+(dec+decd));
        fov = Number(fov).toFixed(0);
        if (fov < 6) {
	    fov = 6;
	}
        this.size_input.val(fov);
        this.restart();
    };

    
    this.frame = function () {
        this.advance();
        this.draw();
    };


    this.get_cutouts = function (ra,dec,size,band,epoch) {
	
	if (this.cutout_states[band] < 1) {
	    // Set state to started and increment workers
	    this.cutout_states[band] = 1;
	} else if (this.cutout_states[band] > 1) {
	    // Error or already done... don't bother fetch cutout
	    return;
	}

	if (this.cutouts[band].length >= epoch+1) {
	    // This cutout already queued
	    return;
	}

	// Expand cutouts array to necessary size
	while (this.cutouts[band].length < epoch+1) {
	    this.cutouts[band].push(null);
	}
	
	this.cutout_workers[band] += 1;
	
	// Fetch cutouts for the given band until none left
	args = {
	    ra: ra,
	    dec: dec,
	    size: size,
	    band: band,
	    epoch: epoch
	};

	var that = this;

	var cleanup_cutout = function () {
	    that.cutout_workers[band] -= 1;
	    if (that.cutout_workers[band] == 0) {
		that.cutout_states[band] = 2;
		
		// Clean up extra entries in cutouts
		while (that.cutouts[band].length > 0
		       && that.cutouts[band][that.cutouts[band].length-1] == null) {
		    that.cutouts[band].pop();
		}
		
		var global_band = that.band_input.val();
		if (global_band == band
		    || that.cutout_states[global_band-band] == 2) {
		    // If we're the only band, or the other band is done:
		    
		    // Update UI elements w/ dynamic components derived from images
		    // Find first and last mjdmins
		    var firstmjdmin = lastmjdmin = mjdmin = that.headers[band][0].cards.MJDMIN.value;
		    for (var epoch = 1; epoch < that.headers[band].length; epoch++) {
			var mjdmin = that.headers[band][epoch].cards.MJDMIN.value;
			if (mjdmin < firstmjdmin) {
			    firstmjdmin = mjdmin;
			}
			if (mjdmin > lastmjdmin) {
			    lastmjdmin = mjdmin;
			}
		    }
		    that.updateWindowLimits((lastmjdmin-firstmjdmin)/365.25);
		    
		    // make some images
		    that.make_images();
		}
	    }
	}
	
	jQuery.ajax({
	    url: "/cutout",
	    data: args,
	    xhrFields: { responseType: "blob" },
	    success: function (response) {
		new astro.FITS(response, function () {
		    hdim = this.getHDU()

		    // Assign header to header array
		    that.headers[band][epoch] = hdim.header;
		    
		    // Assign fetched cutout to cutouts array
		    hdim.data.getFrame(0, function (arr) {
			cards = that.headers[band][epoch].cards
			that.cutouts[band][epoch] = nj.float32(arr).reshape(cards.NAXIS1.value,cards.NAXIS2.value);
			cleanup_cutout();
		    })
		});
		
		// Queue next cutouts
		for (var i = Math.max(epoch+1,that.cutouts[band].length); i < epoch + 16; i++) {
		    that.get_cutouts(ra,dec,size,band,i);
		}
	    },
	    error: function (a,b,c) {
		cleanup_cutout();
	    }
	})
		    
    };


    this.pack_images = function (r, g, b) {
	this.images = [];
	
	g = !g ? r : g;
	b = !b ? r : b;
	
	for (var i = 0; i < r.length; i++) {
	    var idx = 0;
	    var imd = this.context.createImageData(r[i].shape[1],r[i].shape[0]);
	    for (var y = r[i].shape[0]-1; y >= 0; y--) { // Invert y
		for (var x = 0; x < r[i].shape[1]; x++) {
		    if (this.invert_input.prop("checked")) {
			// Invert pixel values if checked
			imd.data[idx++] = 255-r[i].get(y,x)
			imd.data[idx++] = 255-g[i].get(y,x)
			imd.data[idx++] = 255-b[i].get(y,x)
		    } else {
			imd.data[idx++] = r[i].get(y,x)
			imd.data[idx++] = g[i].get(y,x)
			imd.data[idx++] = b[i].get(y,x)
		    }
		    imd.data[idx++] = 255
		}
	    }
	    this.images.push(imd);
	}
    };


    this.trim_and_normalize = function (ims) {
	var r = [];
	    
	// Find minimum and maximum pixel values
	var min = ims.min(), max = ims.max();

	// Find the bottom and top pixel values after
	// cuts by trimbright
	var bot = this.trimbright_scale(this.trimbright_input.slider("option","values")[0]),
	    top = this.trimbright_scale(this.trimbright_input.slider("option","values")[1]);
	for (var i = 0; i < ims.selection.data.length; i++) {
	    ims.selection.data[i] = Math.max(bot,Math.min(top,ims.selection.data[i]));
	}

	// Normalize to 0 - 255
	ims = ims.subtract(ims.min()).divide(ims.max() - ims.min())
	ims = ims.multiply(255)
	    
	    
	for (var epoch = 0; epoch < ims.shape[0]; epoch++) {
	    r.push(ims.slice([epoch,epoch+1]).reshape(ims.shape[1],ims.shape[2]));
	}
	
	return [r,min,max];
    };

    this.__make_windowed_images  = function (range, band, sep_scandir = false, forward = false) {
	var ims = [];
	for (var epoch = 0; epoch < this.cutouts[band].length; epoch++) {
	    var cur = [],
		mjd = this.headers[band][epoch].cards.MJDMIN.value,
		// No forward present in headers... TODO: check
		//forward_ = this.headers[band][epoch].cards.FORWARD.value;
		// Instead, test within half a year of e0
		mjdmod = (Math.abs(mjd - this.headers[band][0].cards.MJDMIN.value)
			  % 365.25),
		forward_ =  mjdmod < (365.25/4.) || mjdmod >= (365.25*3/4.);

	    // Check this center epoch is within right scandir, if required
	    if (sep_scandir && forward_ != forward) {
		continue
	    }

	    // Get epochs within window, according to scandirif required
	    for (var epoch2 = 0; epoch2 < this.cutouts[band].length; epoch2++) {
		var mjd2 = this.headers[band][epoch2].cards.MJDMIN.value,
		    mjdmod2 = (Math.abs(mjd2 - this.headers[band][0].cards.MJDMIN.value)
			      % 365.25),
		    forward2_ =  mjdmod2 < (365.25/4.) || mjdmod2 >= (365.25*3/4.)
		if ((Math.abs(mjd - this.headers[band][epoch2].cards.MJDMIN.value) < range) && (!sep_scandir || forward2_ == forward)) {
		    cur.push(this.cutouts[band][epoch2]);
		}
	    }
	    ims.push(average(cur));
	}
	return ims;
    };


    this.__diff_images = function (ims) {
	var res = [];
	for (var i = 0; i < ims.length; i++)
	{
	    var cur = [];
	    // Add all other images together
	    for (var j = 0; j < ims.length; j++) {
		if (i == j) { continue; }
		cur.push(ims[j])
	    }
	    neg = average(cur);

	    // Diff
	    res.push(ims[i].subtract(neg));
	}
	return res;
    };
    
    
    this.make_images = function () {
	var w1_ims = null;
	var w2_ims = null;

	if (this.coadd_mode_input.val() == "time-resolved") {
	    var range = Math.max(0.0000001,this.window_input.slider("option","value"))*365.25;
	    if (this.cutouts[1].length != 0) {
		if (this.scandir_input.prop("checked")
		    && this.diff_input.prop("checked")) {
		    w1_ims = nj.concatenate(
			nj.stack(this.__diff_images(this.__make_windowed_images(range,1,true,true))).T,
			nj.stack(this.__diff_images(this.__make_windowed_images(range,1,true,false))).T).T;
		} else if (this.scandir_input.prop("checked")
			   && !this.diff_input.prop("checked")) {
		    w1_ims = nj.concatenate(
			nj.stack(this.__make_windowed_images(range,1,true,true)).T,
			nj.stack(this.__make_windowed_images(range,1,true,false)).T).T;
		} else if (!this.scandir_input.prop("checked")
			   && this.diff_input.prop("checked")) {
		    w1_ims = nj.stack(this.__diff_images(
			this.__make_windowed_images(range,1,false)));
		} else {
		    w1_ims = nj.stack(this.__make_windowed_images(range,1,false));
		}
	    }
	    if (this.cutouts[2].length != 0) {
		if (this.scandir_input.prop("checked")
		    && this.diff_input.prop("checked")) {
		    w2_ims = nj.concatenate(
			nj.stack(this.__diff_images(this.__make_windowed_images(range,2,true,true))).T,
			nj.stack(this.__diff_images(this.__make_windowed_images(range,2,true,false))).T).T;
		} else if (this.scandir_input.prop("checked")
			   && !this.diff_input.prop("checked")) {
		    w2_ims = nj.concatenate(
			nj.stack(this.__make_windowed_images(range,2,true,true)).T,
			nj.stack(this.__make_windowed_images(range,2,true,false)).T).T;
		} else if (!this.scandir_input.prop("checked")
			   && this.diff_input.prop("checked")) {
		    w2_ims = nj.stack(this.__diff_images(
			this.__make_windowed_images(range,2,false)));
		} else {
		    w2_ims = nj.stack(this.__make_windowed_images(range,2,false));
		}
	    }
	} else if (this.coadd_mode_input.val() == "pre-post") {
	    if (this.cutouts[1].length != 0) {
		var pre = [], post = [];
		for (var epoch = 0; epoch < this.cutouts[1].length; epoch++) {
		    if (this.headers[1][epoch].cards.MJDMIN.value < 55609.83) {
			pre.push(this.cutouts[1][epoch]);
		    } else {
			post.push(this.cutouts[1][epoch]);
		    }
		}
		w1_ims = [average(pre),average(post)];
		if (this.diff_input.prop("checked")) {
		    w1_ims = this.__diff_images(w1_ims);
		}
		w1_ims = nj.stack(w1_ims);
	    }
	    if (this.cutouts[2].length != 0) {
		var pre = [], post = [];
		for (var epoch = 0; epoch < this.cutouts[2].length; epoch++) {
		    if (this.headers[2][epoch].cards.MJDMIN.value < 55609.83) {
			pre.push(this.cutouts[2][epoch]);
		    } else {
			post.push(this.cutouts[2][epoch]);
		    }
		}
		w2_ims = [average(pre),average(post)];
		if (this.diff_input.prop("checked")) {
		    w2_ims = this.__diff_images(w2_ims);
		}
		w2_ims = nj.stack(w2_ims);
	    }
	}

	// Pack images into canvas
	if (w2_ims === null) {
	    // W1 only
	    var zz = this.trim_and_normalize(w1_ims);
	    this.updateTrimbrightLimits(zz[1],zz[2]);
	    this.pack_images(zz[0]);
		    
	} else if (w1_ims === null) {
	    // W2 only
	    var zz = this.trim_and_normalize(w2_ims);
	    this.updateTrimbrightLimits(zz[1],zz[2]);
	    this.pack_images(zz[0]);
	    
	} else {
	    // W1+W2
	    // TODO: Consider this =>
	    // Normalize to W1
	    // var w1_med = median(w1);
	    // var v2_med = median(w2);
	    // w2 = w2.add(w1_med.sub(w2_med))
	    var r = this.trim_and_normalize(w1_ims),
		g = [],
		b = this.trim_and_normalize(w2_ims);
	    // Take smallest and largest of w1 and w2 pixel values
	    this.updateTrimbrightLimits(Math.min(r[1],b[1]),
					Math.max(r[2],b[2]));
	    r = r[0]; b = b[0];
	    for (var i = 0; i < Math.min(r.length,b.length); i++) {
		g.push(r[i].add(b[i]).divide(2.0))
	    }
	    this.pack_images(r,g,b);
	}	    


	// 5) Call something to start drawing?
	if (w2_ims === null) {
	    this.real_img_size = [w1_ims.shape[2],w1_ims.shape[1]]
	} else {
	    this.real_img_size = [w2_ims.shape[2],w2_ims.shape[1]]
	}
        this.updateZoom();
    };

    
    this.notifygo = function () { console.log("Fired input changed"); }

    
    this.restart = function () {
	console.log("RESTARTING")
        this.reset();

        var loc_split = this.parseLoc();

	// Hide slider if in adaptive mode
        //if (this.mode_input.val() == "adapt") {
	//    jQuery("#trimbrightRow").hide()
        //} else if(this.mode_input.val() == "fixed") {
	//    jQuery("#trimbrightRow").show()
	//    jQuery("#trimbrightInput").attr("max",4000)
	//    jQuery("#trimbrightInput").attr("min",-40)
        //} else if(this.mode_input.val() == "percent") {
	//    jQuery("#trimbrightRow").show()
	//    jQuery("#trimbrightInput").attr("max",100.0)
	//    jQuery("#trimbrightInput").attr("min",75.0)
        //}

	// Show pmra/pmdec if in pertinent mode
        if (this.coadd_mode_input.val() == "shift-and-add" ||
	    this.coadd_mode_input.val() == "daniella") {
	    jQuery("#pmraRow").show()
	    jQuery("#pmdecRow").show()
        } else {
	    jQuery("#pmraRow").hide()
	    jQuery("#pmdecRow").hide()
        }

	// Show window if in pertinent mode
	if (this.coadd_mode_input.val() == "time-resolved") {
	    jQuery("#windowRow").show();
	} else {
	    jQuery("#windowRow").hide();
	}
        
        var that = this;
        
        if (this.coadd_mode_input.val() == "full-depth") {
	    // Legacy
	    // TODO: This
	    //this.versions = this.full_depth_versions.slice();
	    //this.epochs = null;
	    //this.make_imgs();
	    //this.draw();
        } else {
	    var ra = loc_split[0];
	    var dec = loc_split[1];
	    var size = (~~(that.size_input.val()/2.75)); // Convert arcseconds to pixels
	    var band = that.band_input.val();

	    if (band == 1 || band == 3) {
		this.get_cutouts(ra,dec,size,1,0);
	    }
	    if (band == 2 || band == 3) {
		this.get_cutouts(ra,dec,size,2,0);
	    }
        }

        this.updatePawnstars();
        this.updateZooiSubjects();
        this.updateOtherSliders();
        this.updateZoom();
        this.updateUrl();
        this.updateSpeed();
    };
}

jQuery(function () {
    jQuery("form").submit(function (e) {
        e.preventDefault();
    });

    var ws = new WiseSwapper();

    if (window.location.hash) {
        ws.fromUrl();
    }

    jQuery("#daCanvas").on("mouseup", ws.move_up.bind(ws));
    jQuery("#daCanvas").on("mousedown", ws.move_down.bind(ws));
    jQuery("#daCanvas").on("mousemove", ws.move_move.bind(ws));
    jQuery(".resetters").on("change", ws.restart.bind(ws));
    jQuery("#percentileInput").on("change", ws.percentile_change.bind(ws));
    jQuery("#speedInput").on('change', ws.updateSpeed.bind(ws));
    jQuery("#zoomInput").on('change', ws.updateZoom.bind(ws));
    jQuery("#linearInput").on("mouseup", ws.restart.bind(ws));
    jQuery("#trimbrightInput").on("mouseup", ws.restart.bind(ws));
    jQuery("#windowInput").on("mouseup", ws.restart.bind(ws));
    jQuery("#linearInput").on("change", ws.updateOtherSliders.bind(ws));
    jQuery("#trimbrightInput").on("change", ws.updateOtherSliders.bind(ws));
    jQuery("#windowInput").on("change", ws.updateOtherSliders.bind(ws));
});

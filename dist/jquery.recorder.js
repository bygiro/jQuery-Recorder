/*!
 * jQuery Recorder v0.0.1
 *
 * Copyright August 2016, G. Tomaselli
 * Licensed under the MIT license.
 *
 */

 
// compatibility for jQuery / jqLite
var bg = bg || false;
if(!bg){
	if(typeof jQuery != 'undefined'){
		bg = jQuery;
	} else if(typeof angular != 'undefined'){
		bg = angular.element;
		bg.extend = angular.extend;	
	
		function selectResult(elem, selector){
			if (elem.length == 1)
				return elem[0].querySelectorAll(selector);
			else {
				var matches = [];
				for(var i=0;i<elem.length;i++){
					var elm = elem[i];
					var nodes = angular.element(elm.querySelectorAll(selector));
					matches.push.apply(matches, nodes.slice());					
				}
				return matches;

			}

		}	
		
		bg.prototype.find = function (selector){			
			var context = this[0];
			// Early return if context is not an element or document
			if (!context || (context.nodeType !== 1 && context.nodeType !== 9) || !angular.isString(selector)) {
				return [];
			}
			var matches = [];
			if (selector.charAt(0) === '>')
				selector = ':scope ' + selector;
			if (selector.indexOf(':visible') > -1) {
				var elems = angular.element(selectResult(this, selector.split(':visible')[0]))

				forEach(elems, function (val, i) {
					if (angular.element(val).is(':visible'))
						matches.push(val);
				})

			} else {
				matches = selectResult(this, selector)
			}

			if (matches.length) {
				if (matches.length == 1)
					return angular.element(matches[0])
				else {
					return angular.element(matches);
				}
			}
			return angular.element();
		};
	}
}

;(function ($) {
    "use strict";

	var pluginName = 'recorder',

	captureUserMedia = function(mediaConstraints, successCallback, errorCallback) {		
		if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
			navigator.mediaDevices.getUserMedia(mediaConstraints).then(successCallback).catch(errorCallback);
			return;
		}
		
		navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
		
		if(!navigator.getUserMedia){
			errorCallback('Browser not compatible, sorry!');
			return;
		}
		navigator.getUserMedia(mediaConstraints, successCallback, errorCallback);
	},
	
	dataURItoBlob = function(dataURI) {
		// convert base64/URLEncoded data component to raw binary data held in a string
		var byteString;
		if (dataURI.split(',')[0].indexOf('base64') >= 0)
			byteString = atob(dataURI.split(',')[1]);
		else
			byteString = unescape(dataURI.split(',')[1]);

		// separate out the mime component
		var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

		// write the bytes of the string to a typed array
		var ia = new Uint8Array(byteString.length);
		for (var i = 0; i < byteString.length; i++) {
			ia[i] = byteString.charCodeAt(i);
		}

		return new Blob([ia], {type:mimeString});
	},
	
	humanize = function(bytes) {
		if (bytes == 0) return '0 Byte';
		var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'],
		i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
		return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
	},
	
	timeToString = function(time){ // milliseconds
		var hours,minutes,seconds;
		
		time = time/1000;
		
		// does the same job as parseInt truncates the float
		minutes = (time / 60) | 0;
		hours = (minutes / 60) | 0;
		seconds = (time % 60) | 0;

		if(hours) minutes -= hours * 60;
		
		hours = hours < 10 ? "0" + hours : hours;
		minutes = minutes < 10 ? "0" + minutes : minutes;
		seconds = seconds < 10 ? "0" + seconds : seconds;

		return (hours == '00' ? '' : hours +':') + minutes + ":" + seconds;
	},
	
	toggleTimer = function(stop){
		var that = this,
			opts = that.settings,
			start = that.timerStartedAt ? that.timerStartedAt : Date.now(),
			diff,
			minutes,
			seconds,
			duration = opts.limit;
			
		if(that.timerStoppedAt){
			start += Date.now() - that.timerStoppedAt;
		}
		
		if(stop){
			clearInterval(that.timerRunning);
			that.$timer.hide();
			delete that.timerStartedAt;
			delete that.timerStoppedAt;
			return;
		}
		
		if(that.timerStartedAt && that.isPaused){
			// pause the timer
			clearInterval(that.timerRunning);
			that.timerStoppedAt = Date.now();
			return;
		}		
		
		function _counter() {
			// get the number of seconds that have elapsed since 
			// _counter() was called
			diff = (duration * 1000) - ((Date.now() - start) | 0);
			
			that.$timer.html('<span class="txt-info">'+ opts.text.remaining_recording +'</span><span class="time-info">'+ timeToString(diff) +'</span>'); 

			if(!diff){
				toggleTimer.call(that,true);
				return;
			}
		};
		// we don't want to wait a full second before the timer starts
		_counter();
		that.timerRunning = setInterval(_counter, 1000);
		that.timerStartedAt = start;
	},
	
	getRecordRtc = function(){
		var that = this,
		opts = that.settings,index = false,
		recordRTCInstance = that.recordRTCInstance;
		
		if(recordRTCInstance.length){
			index = !recordRTCInstance[1] ? 0 : 1;			
			return recordRTCInstance[index];
		}
			
		return recordRTCInstance;
	},
	
	uploadData = function(){
		var that = this,
		opts = that.settings,
		data = that.getRecordedData(),
		uploadStatusContainer = that.$uploadstatus,
		flowjs;
		
		if(!opts.flowOpts) return;
		
		// upload with flow.js
		if(typeof Flow == 'undefined' || !data) return;
		
		
		flowjs = new Flow(opts.flowOpts);
		
		data.name = opts.filename || 'recorded_data';
		flowjs.addFile(data);
		flowjs.upload();
		
		uploadStatusContainer.find('.progress, .progress-bar')
			.addClass('active')
			.removeClass('progress-bar-success bar-success');		
		uploadStatusContainer.show();
		
		flowjs.on('fileProgress', function(file){
            // Handle progress for both the file and the overall upload
			var uploadInfo = opts.text.upload_speed + humanize(file.averageSpeed) + '/s '
                + timeToString(file.timeRemaining()*1000) + opts.text.time_remaining;
				
            uploadStatusContainer.find('.txt-info').show().html(uploadInfo);
				
            uploadStatusContainer.find('.progress-bar').css({width:Math.floor(flowjs.progress()*100) + '%'});
        });
		
		flowjs.on('fileSuccess',function(file, message, chunk){
			uploadStatusContainer.find('.progress, .progress-bar')
				.removeClass('active progress-striped')
				.addClass('progress-bar-success bar-success');
			
			uploadStatusContainer.find('.progress-bar').html(opts.text.completed);
			
			uploadStatusContainer.find('.txt-info').hide();
		});
	},
	
	stopStream = function(){
		var that = this,
		opts = that.settings,
		type = opts.streamType;
		
		if(that.stream){			
			var tracks = that.stream.getVideoTracks().concat(that.stream.getAudioTracks());
			for(var i=0;i<tracks.length;i++){
				if(!tracks[i].stop) continue;
				
				tracks[i].stop();
			}
			that.stream = null;
		}
		
		if(that.$postviewEl.length){			
			that.$previewEl.hide();
		} else {
			that.$previewEl.show();
		}
		
		if(that.visualizer){
			clearInterval(that.visualizer);
			that.$visualizer.hide();
		}
	},
	
	startStream = function(options) {
		var that = this,
		opts = that.settings,
		previewElement = that.$previewEl[0],
		type = opts.streamType;
		
		that.$previewEl.show();
		if(that.$postviewEl.length) that.$postviewEl.hide();
				
		captureUserMedia(options, function(stream) {
			that.stream = stream;
			
			previewElement.srcObject = stream;
			previewElement.muted = true;
			previewElement.play();
			
			if(type == 'audio' && that.$visualizer.length){
				
				that.$visualizer.show();
				
				window.AudioContext = window.AudioContext || window.webkitAudioContext;
				
				var canvas = that.$visualizer[0];
				var context = new AudioContext();
				var analyser = context.createAnalyser();
				var gain = context.createGain();
				gain.gain.value = 0;
				analyser.fftSize = 2048;
				var frequencyData = new Float32Array(analyser.frequencyBinCount);

				analyser.connect(gain);
				gain.connect(context.destination);

				// Visualizer
				var analyzerSamples = analyser.frequencyBinCount;
				var ctx = canvas.getContext("2d");
				canvas.width = 400;
				canvas.height = 256;
				
				function showFrequency() {
					var inp = frequencyData,
					X = 20, Y = 10, // sensibility
					Z = 60; // width 60/415 120/830
					
					analyser.getFloatFrequencyData(inp);
					ctx.clearRect(0, 0, analyzerSamples, 256);
					ctx.beginPath();
					ctx.moveTo(0.5, 255.5 - 255.5*X*Math.pow(Y, inp[0]/X));
					for (var i = 1; i < inp.length; i++) {
						ctx.lineTo(Math.log(i)*Z, 255.5 - 255.5*X*Math.pow(Y, inp[i]/X));
					}
					ctx.stroke();
				}

				that.visualizer = setInterval(showFrequency, 1000/50);
				
				var mic = context.createMediaStreamSource(stream);
				mic.connect(analyser);
			}
			
			that.onMediaCaptured();
			
			stream.onended = function() {
				that.onMediaStopped();
			};
		}, function(error) {
			that.onMediaCapturingFailed(error);
		});
	},
	
	addPreviewElement = function(){
		var that = this,opts = that.settings,
		$html = $('<div class="msr-preview"></div>'),
		type = opts.streamType;
		
		that.$postviewEl = [];
		
		switch(type){
			case 'video':
			case 'gif':
				that.$previewEl = $('<video></video>');
				break;
				
			case 'audio':
				that.$visualizer = $('<canvas style="background-color: #ddd;" class="visualizer"></canvas>').hide();
				$html.append(that.$visualizer);
				that.$previewEl = $('<audio></audio>');
				break;
				
			case 'image':
				that.$previewEl = $('<video></video>');
				that.$postviewEl = $('<img />');
				break;				
		}		
		
		that.$previewEl.hide();
		
		$html.append(that.$previewEl);
		
		if(that.$postviewEl.length){
			that.$postviewEl.hide();
			$html.append(that.$postviewEl);
		}
		that.$element.append($html);
	},
	
	addControlPanel = function(){
		var that = this,opts = that.settings,
		$html = $('<div class="msr-panel"></div>'),$button,
		type = opts.streamType,
		recordText = (type != 'image' ? opts.text.record : opts.text.enable_webcam),
		stopText = (type != 'image' ? opts.text.stop : opts.text.take_snapshot);
		
		$button = $('<div class="btn btn-danger btn-record">'+ recordText +'</div>');
		$button.on('click',function(){			
			// start recording
			that.record();
		}).show();
		$html.append($button);
		
		if(type != 'image' && (!opts.limit || !opts.disablePause)){
			$button = $('<div class="btn btn-warning btn-pause">'+ opts.text.pause +'</div>');
			$button.on('click',function(){			
				// pause recording
				that.togglePause();
			}).hide();		
			$html.append($button);
			
			$button = $('<div class="btn btn-danger btn-resume">'+ opts.text.resume +'</div>');
			$button.on('click',function(){			
				// pause recording
				that.togglePause();
			}).hide();		
			$html.append($button);
		}

		if(!opts.limit || !opts.disableStop){			
			$button = $('<div class="btn btn-primary btn-stop">'+ stopText +'</div>');
			$button.on('click',function(){			
				// stop recording
				that.stop();
			}).hide();		
			$html.append($button);
		}

		that.$element.append($html);
	},
	
    methods = {
        init: function ($element, options) {
            var that = this;
            that.$element = $element;
            that.settings = $.extend({}, {
				
				streamType: 'video', // audio, video, gif, image

				audio: true,
				
				showTimer: true,
				
				// it fixes audio issues whilst recording 720p
				bufferSize: 16384,
				
				frameInterval: 20,
				
				leftChannel: false,
				
				sampleRate: 44100,
				
				canvas_height: 240,
				canvas_width: 320,
				
				disableLogs: true,
				audioFormat: '',
				videoFormat: '',
				
				limit: 0, // seconds
				
				flowOpts: false, // flow options for upload
				
				disableStop: false, // to disable the stop button on limited recording duration
				disablePause: false, // to disable the pause button on limited recording duration
				
				// internationalization
				text: {
					enable_webcam: 'Enable webcam',
					take_snapshot: 'Take snapshot',
					time_remaining: ' time remaining',
					upload_speed: 'upload speed: ',
					completed: 'upload completed',
					remaining_recording: 'Remaining recording time ',
					record: 'Record',
					pause: 'Pause',
					resume: 'Resume',
					stop: 'Stop'
				}
            }, options);
			var that=this,opts = that.settings;

			opts.streamType = opts.streamType.trim().toLowerCase();
			opts.streamType = /(audio|video|gif|image)/i.test(opts.streamType) ? opts.streamType : 'stream';
			
			opts.audioFormat = opts.audioFormat.trim().toLowerCase();
			opts.audioFormat = /(wav|ogg)/i.test(opts.audioFormat) ? opts.audioFormat : 'ogg';
			
			opts.videoFormat = opts.videoFormat.trim().toLowerCase();
			opts.videoFormat = /(webm|mp4)/i.test(opts.videoFormat) ? opts.videoFormat : 'webm';
			
			// add preview element
			addPreviewElement.call(that);
			
			// add timer
			if(opts.showTimer){
				that.$timer = $('<div class="msr-timer"></div>');
				that.$element.append(that.$timer);
			}
			
			// add uploadstatus
			if(opts.showTimer){
				that.$uploadstatus = $('<div class="msr-upload-status"><div class="progress progress-striped active"><div class="bar progress-bar progress-striped active"></div></div><span class="txt-info"></span></div>').hide();
				that.$element.append(that.$uploadstatus);
			}
						
			// add control panel
			addControlPanel.call(that);
        },
		
		getRecordedData: function(){
			return this.recordedData;
		},
		
		record: function(){
			var that = this, opts = that.settings,
			controlPanel = that.$element.find('.msr-panel'),
			type = opts.streamType,
			previewElement = that.$previewEl[0],
			streamOptions;
			
			delete that.recordedData;
			
			if(controlPanel.length){
				controlPanel.find('.btn-pause, .btn-stop').show();
				controlPanel.find('.btn-record, .btn-resume').hide();
			}			
			
			// common callbacks functions
			that.onMediaCapturingFailed = function(error){		
				console.log('media capturing error ');				
			}
			
			that.onMediaStopped = function(){
				console.log('media stopped');
			}
			
			that.recordingEnded = function(url){
				var	recordRTC = getRecordRtc.call(that),
				attr = 'poster';
				previewElement.src = null;
				previewElement.srcObject = null;
				previewElement.muted = false;
				previewElement.removeAttribute('muted');

				previewElement.pause();
				if(type != 'gif') {
					attr = 'src';
					previewElement.controls = true;
					previewElement.play();
				}
				
				previewElement[attr] = url;
				previewElement.onended = function() {
					previewElement.pause();
					previewElement[attr] = URL.createObjectURL(recordRTC.blob);
				};

				that.recordedData = recordRTC.blob;
				stopStream.call(that);
				
				uploadData.call(that);
			};

			switch(type){
				case 'video':
				case 'gif':					
                    that.onMediaCaptured = function() {
						if(type == 'video' && opts.audio && typeof MediaRecorder === 'undefined'){

                            var options = {
                                type: 'audio',
                                bufferSize: parseInt(opts.bufferSize),
                                sampleRate: parseInt(opts.sampleRate),
                                leftChannel: opts.leftChannel,
                                disableLogs: opts.disableLogs,
                                recorderType: DetectRTC.browser.isEdge ? StereoAudioRecorder : null
                            };

                            if(typeof opts.sampleRate == 'undefined') {
                                delete opts.sampleRate;
                            }

                            var audioRecorder = RecordRTC(that.stream, options);

                            var videoRecorder = RecordRTC(that.stream, {
                                type: 'video',
                                disableLogs: opts.disableLogs,
                                canvas: {
                                    width: opts.canvas_width,
                                    height: opts.canvas_height
                                },
								// bitsPerSecond: 25 * 8 * 1025 // 25 kbits/s
								getNativeBlob: true, // enable it for longer recordings
                                frameInterval: typeof opts.frameInterval !== 'undefined' ? parseInt(opts.frameInterval) : 20 // minimum time between pushing frames to Whammy (in milliseconds)
                            });

							if(opts.limit){
								// set duration
								videoRecorder
									.setRecordingDuration(opts.limit * 1000)
									.onRecordingStopped(function(url){
										that.stop(url);
									});
									
								audioRecorder
									.setRecordingDuration(opts.limit * 1000)
									.onRecordingStopped(function(url){
										that.stop(url);
									});								
							}
							
                            // to sync audio/video playbacks in browser!
                            videoRecorder.initRecorder(function() {
                                audioRecorder.initRecorder(function() {
                                    audioRecorder.startRecording();
                                    videoRecorder.startRecording();
									
									// timer
									if(opts.showTimer){
										toggleTimer.call(that);
									}
                                });
                            });
									
							that.recordRTCInstance = [audioRecorder, videoRecorder];
						} else {							
							that.recordRTCInstance = RecordRTC(that.stream,{
								type: type,
								mimeType: 'video/'+ opts.videoFormat,
								disableLogs: opts.disableLogs,
								canvas: {
									width: opts.canvas_width,
									height: opts.canvas_height
								},
								// bitsPerSecond: 25 * 8 * 1025 // 25 kbits/s
								getNativeBlob: true, // enable it for longer recordings
								frameInterval: typeof opts.frameInterval !== 'undefined' ? parseInt(opts.frameInterval) : 20 // minimum time between pushing frames to Whammy (in milliseconds)
							});

							
							if(opts.limit){
								that.recordRTCInstance
									.setRecordingDuration(opts.limit * 1000)
									.onRecordingStopped(function(url){
										that.stop(url);
									});
							}
							
							that.recordRTCInstance.startRecording();
							
							// timer
							if(opts.showTimer){
								toggleTimer.call(that);
							}
						}
                    };				
					
					streamOptions = {video: true};
					if(opts.audio){
						streamOptions.audio = true;
					}
					startStream.call(that, streamOptions);
					
					break;
					
				case 'audio':
                    that.onMediaCaptured = function(){
                        that.recordRTCInstance = RecordRTC(that.stream, {
                            type: type,
							mimeType: 'audio/'+ opts.audioFormat,
                            bufferSize: parseInt(opts.bufferSize),
                            sampleRate: parseInt(opts.sampleRate),
                            leftChannel: opts.leftChannel,
                            disableLogs: opts.disableLogs,
                            recorderType: DetectRTC.browser.isEdge ? StereoAudioRecorder : null
                        });
						
						that.$previewEl.hide();
						
						if(opts.limit){
							that.recordRTCInstance
								.setRecordingDuration(opts.limit * 1000)
								.onRecordingStopped(function(url){
									that.stop(url);
								});
						}
						
                        that.recordRTCInstance.startRecording();
						
						// timer
						if(opts.showTimer){
							toggleTimer.call(that);
						}
                    };

					streamOptions = {audio: true};
					startStream.call(that, streamOptions);
					break;
					
				case 'image':
					that.onMediaCaptured = function(){
						
					}
					
					that.recordingEnded = function(url) {
						var canvas = document.createElement('canvas');
						canvas.width = previewElement.videoWidth || previewElement.clientWidth;
						canvas.height = previewElement.videoHeight || previewElement.clientHeight;
					   
						var context = canvas.getContext('2d');
						context.drawImage(previewElement, 0, 0, canvas.width, canvas.height);
						
						that.recordedData = canvas.toDataURL('image/jpeg');
						that.$postviewEl.show()[0].src = that.recordedData;

						that.recordedData = dataURItoBlob(that.recordedData);

						stopStream.call(that);
						uploadData.call(that);
					};

					streamOptions = {video: true};
					startStream.call(that, streamOptions);
					break;
			}
		},
		
		togglePause: function(){
			var that = this, opts = that.settings,
			controlPanel = that.$element.find('.msr-panel'),
			resumeBtn,pauseBtn,isPaused = true,method = 'pauseRecording',btn = '.btn-resume';
			
			if(controlPanel.length){
				controlPanel.find('.btn-stop').show();
				controlPanel.find('.btn-record, .btn-resume, .btn-pause').hide();
			}
			
			var instances = that.recordRTCInstance;
			if(!that.recordRTCInstance.length){
				instances = [that.recordRTCInstance];
			}
			
			if(that.isPaused){
				// resume
				method = 'resumeRecording';
				isPaused = false;
				btn = '.btn-pause';
			}

			for(var i=0;i<instances.length;i++){
				var inst = instances[i];
				if(!inst[method]) continue;
				
				inst[method]();
			}
			
			controlPanel.find(btn).show();
			that.isPaused = isPaused;
			toggleTimer.call(that);
		},
		
		stop: function(recordedURL){
			var that = this, opts = that.settings,
			controlPanel = that.$element.find('.msr-panel'),
			recordRTCInstance = that.recordRTCInstance;
			
			if(controlPanel.length){
				controlPanel.find('.btn-record').show();
				controlPanel.find('.btn-resume, .btn-pause, .btn-stop').hide();
			}
			
			// stop timer
			toggleTimer.call(that,true);
			
			if(opts.streamType == 'image'){
				that.recordingEnded(recordedURL);
				return;
			}
			
			if(!recordRTCInstance) return;
			
			if(that.isPaused){
				that.togglePause();
				that.stop();
				return;
			}
			
			if(recordedURL){
				that.recordingEnded(recordedURL);
				return;
			}
			
			recordRTCInstance = getRecordRtc.call(that);
			recordRTCInstance.stopRecording(function(url){
				that.recordingEnded(url);
			});			
		}
    },
	
	main = function (method) {
        var pluginInstance = this.data(pluginName +'_data');
        if (pluginInstance) {
            if (typeof method === 'string' && pluginInstance[method]) {
                return pluginInstance[method].apply(pluginInstance, Array.prototype.slice.call(arguments, 1));
            }
            return console.log('Method ' +  method + ' does not exist on jQuery.'+ pluginName);
        } else {
            if (!method || typeof method === 'object') {
				
				var listCount = this.length;
				for ( var i = 0; i < listCount; i ++) {
					var $this = $(this[i]);
                    pluginInstance = $.extend({}, methods);
                    pluginInstance.init($this, method);
                    $this.data(pluginName +'_data', pluginInstance);
				};

				return this;
            }
            return console.log('jQuery.'+ pluginName +' is not instantiated. Please call $("selector").'+ pluginName +'({options})');
        }
    };

	// plugin integration
	if($.fn){
		$.fn[pluginName] = main;
	} else {
		$.prototype[pluginName] = main;
	}
}(bg));

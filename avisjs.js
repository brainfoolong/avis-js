/**
* Html5 / JS Web Audio Frequency Visualizer (avisJs)
*
* @requires Chrome 25+ (best), Firefox 23+ (slow as hell), jQuery
* @author BrainFooLong
* @license GPL v3
* @version 0.2
* @date 27.05.2013
*/

/*
Simple HTML Demo:
Doesn't work with file:// URLs - You need a local webserver to access the demo page via http://localhost or something similar

<!DOCTYPE html>
<html>
<head>
<title>AvisJS Test</title>
<script src="http://code.jquery.com/jquery-1.9.1.min.js"></script>
<script src="avisjs.js"></script>
<script type="text/javascript">
$(document).ready(function(){

    var avis = new avisJS($("#avisjs"));

    avis.getBufferFromAudioURL("test.mp3", function(buffer){
        avis.createContextNodesFromBuffer(buffer);
        avis.start();
    });

    // on the fly random settings change on press SPACE
    $(document).on("keydown", function(ev){
        if(ev.keyCode == 32){
            avis.options.barwidth = avis.rand(2,20);
            avis.options.barspacer = avis.rand(1,10);
            avis.options.randomizePeaks = avis.rand(1,60);
        }
    });
});
</script>
</head>
<body>
<canvas id="avisjs" width="500" height="500"></canvas>
</body>
</html>

*/

function avisJS(canvasElement){
    'use strict';
    var self = this;
    try{
        if(!$) throw "jQuery is required";
        if(!$(canvasElement).is("canvas")) throw "No Canvas Element selected";
        self.aniFrame =  window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || false;
        if(!self.aniFrame) throw "No Animation Frame available";
        self.audioContext = (function(){return window.AudioContext || window.webkitAudioContext || window.mozAudioContext || false;})();
        if(!self.audioContext) throw "Audio Context is not available";
        self.audioContext = new self.audioContext();

        self.canvas = $(canvasElement);
        self.ctx = self.canvas.get(0).getContext('2d');
        if(!self.ctx) throw "No 2D Context available";

        self.isSupported = true;

        self.frequencyScalePresets = {
            "equalizer" :  [[20,50], [51,100], [101,200], [201,500], [501,1000], [1001,2000], [2001,5000], [5001,10000], [10001, 20000]],
            "linear" : [[20,2000], [2001,4000], [4001,6000], [6001,8000], [8001,10000], [10001,12000], [12001,14000], [14001,16000], [16001, 20000]],
        };

        self.drawStyles = {
            "equalizer" : {barwidth : 2, barspacer : 1, mirrorBars : true, mirrorBarsHeightMulti : 0.5, barcolor : {r:255, g:255, b:255}},
            "bubbles" : {radius : 50, parts : 15, multi : 16, color : {r:255, g:255, b:255}, scaleX : 1, scaleY : 1}
        };

        self.options = {
            timeConstantSmoothing : 0.3,
            frequencySmoothing : 60,
            randomizePeaks : 40,
            drawStyle : "equalizer",
            scale : "equalizer"
        };

        self.rand = function rand (min, max) {
            var argc = arguments.length;
            if (argc === 0) {
                min = 0;
                max = 2147483647;
            } else if (argc === 1) {
                throw new Error('Warning: rand() expects exactly 2 parameters, 1 given');
            }
            return Math.floor(Math.random() * (max - min + 1)) + min;
        };

        self.hex2rgb = function(hex) {
            if (hex[0]=="#") hex=hex.substr(1);
            if (hex.length==3) {
                var temp=hex; hex='';
                temp = /^([a-f0-9])([a-f0-9])([a-f0-9])$/i.exec(temp).slice(1);
                for (var i=0;i<3;i++) hex+=temp[i]+temp[i];
            }
            var triplets = /^([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex).slice(1);
            return {
                r: parseInt(triplets[0],16),
                g: parseInt(triplets[1],16),
                b: parseInt(triplets[2],16)
            }
        };

        self.rgb2hex = function(rgb){
            return "#" + self.hex(rgb["r"]) + self.hex(rgb["g"]) + self.hex(rgb["b"]);
        };

        self.hex = function(x){
            return ("0" + parseInt(x).toString(16)).slice(-2);
        };

        self.stop = function(){
            if(!self.source) return;
            self.stopped = true;
            self.source.stop(0);
            self.source.disconnect();
            self.analyser.disconnect();
            self.source = null;
            self.analyser = null;
        };

        self.start = function(){
            if(!self.source) throw "No active Audio Source available";
            self.source.start(0);
            self.stopped = false;
            self.animate();
        };

        self.createContextNodesFromBuffer = function(buffer){
            self.analyser = self.audioContext.createAnalyser();
            self.analyser.fftSize = 2048;
            self.analyser.connect(self.audioContext.destination);

            self.source = self.audioContext.createBufferSource();
            self.source.connect(self.analyser);
            self.source.buffer = self.audioContext.createBuffer(buffer, false);
            self.source.loop = true;

            self.dataLength = self.analyser.frequencyBinCount;
            self.frequencyStep = self.audioContext.sampleRate / self.dataLength;
            self.freqByteData = new Uint8Array(self.analyser.frequencyBinCount);
            self.timeByteData = new Uint8Array(self.analyser.frequencyBinCount);
            self.freqFloatData = new Float32Array(self.analyser.frequencyBinCount);
        };

        self.animate = function(){
            if(self.stopped) return;
            self.aniFrame.call(window, self.animate);
            self.render();
        };

        self.getCurrentData = function(drawDataLength){
            var scale = self.frequencyScalePresets[self.options.scale];
            var value, prevValue, smoothing, indexScale, indexScaleNorm, scaleHzRange, scaleHz, i, j, hz;
            var arr = [];
            for(i = 0; i < drawDataLength; i++){
                indexScale = (1 / drawDataLength) * i * scale.length;
                indexScaleNorm = Math.floor(indexScale);
                scaleHzRange = scale[indexScaleNorm][1] - scale[indexScaleNorm][0];
                scaleHz = scale[indexScaleNorm][0] + (scaleHzRange * (indexScale - indexScaleNorm));
                value = 0;
                prevValue = 0;
                for(j = 0; j < self.dataLength; j++){
                    hz = j * self.frequencyStep;
                    if(hz >= scaleHz){
                        smoothing = (1 / self.frequencyStep) * (hz - scaleHz);
                        value = self.freqByteData[j];
                        if(j) prevValue = self.freqByteData[j-1];
                        if(value){
                            if(prevValue > value){
                                value += smoothing * self.options.frequencySmoothing;
                                value = Math.min(value, prevValue);
                            }else if(prevValue < value){
                                value -= smoothing * self.options.frequencySmoothing;
                                value = Math.max(value, prevValue);
                            }
                            value -= self.rand(0, self.options.randomizePeaks);
                        }
                        value = Math.max(0, value);
                        value = Math.min(255, value);
                        break;
                    }
                }
                arr.push((1 / 255) * value);
            }
            return arr;
        };

        self.render = function(){
            if(!self.analyser) return;

            self.analyser.smoothingTimeConstant = self.options.timeConstantSmoothing;
            self.analyser.getByteFrequencyData(self.freqByteData);
            self.analyser.getFloatFrequencyData(self.freqFloatData);
            self.analyser.getByteTimeDomainData(self.timeByteData);

            var width = self.canvas.width();
            var height = self.canvas.height();

            var options = self.drawStyles[self.options.drawStyle];

            var x = 0;
            if(self.options.drawStyle == "equalizer"){
                var gradient, i, y, w, h, value;
                var bars = width / (options.barwidth + options.barspacer);
                var data = self.getCurrentData(bars);

                self.ctx.clearRect(0, 0, width, height);
                for(i in data){
                    value = data[i];

                    h = (height / 2) * value;
                    y = (height / 2) - h;
                    w = options.barwidth;

                    gradient = self.ctx.createLinearGradient(x,y,x+w,y+h);
                    gradient.addColorStop(1, self.rgb2hex(options.barcolor));
                    gradient.addColorStop(0, 'rgba('+options.barcolor["r"]+','+options.barcolor["g"]+','+options.barcolor["b"]+',0)');
                    self.ctx.fillStyle = gradient;
                    self.ctx.fillRect(x, y, w, h);

                    if(options.mirrorBars){
                        y = (height / 2);
                        h = (height / 2) * value * options.mirrorBarsHeightMulti;

                        gradient = self.ctx.createLinearGradient(x,y,x+w,y+h);
                        gradient.addColorStop(0, self.rgb2hex(options.barcolor));
                        gradient.addColorStop(1, 'rgba('+options.barcolor["r"]+','+options.barcolor["g"]+','+options.barcolor["b"]+',0)');
                        self.ctx.fillStyle = gradient;
                        self.ctx.fillRect(x, y, w, h);
                    }

                    x += w + options.barspacer;
                }
            }else if(self.options.drawStyle == "bubbles"){
                var data = self.getCurrentData(options.parts);
                var t = height / 2;
                var l = width / 2;
                var value, perc, top, i, m;

                self.ctx.clearRect(0, 0, width, height);
                for(m = 1; m <= options.multi; m++){
                    self.ctx.save();
                    self.ctx.translate(l, t);
                    self.ctx.rotate(((360-(360/options.multi)) / options.multi) * m);
                    for(i in data){
                        value = data[i];
                        perc = (1 /  options.parts) * i;
                        top = (t * perc);

                        self.ctx.save();
                        self.ctx.scale(options.scaleY, options.scaleX);
                        self.ctx.beginPath();
                        self.ctx.fillStyle = 'rgba('+options.color["r"]+','+options.color["g"]+','+options.color["b"]+','+value+')';
                        self.ctx.arc(0, top, options.radius * value, 0, Math.PI*2, true);
                        self.ctx.fill();
                        self.ctx.restore();
                    }
                    self.ctx.restore();
                }
            }

        };

        self.getBufferFromAudioURL = function(url, callback){
            var request = new XMLHttpRequest();
            request.open("GET", url, true);
            request.responseType = "arraybuffer";
            request.onload = function() { callback(request.response); };
            request.send();
        };

        self.getBufferFromAudioFile = function(file, callback){
            if(!FileReader) throw "No File Reader API available";
            var reader = new FileReader();
            reader.onload = (function(file){return function(e) {callback(e.target.result);}})(file);
            reader.readAsArrayBuffer(file);
        };

    }catch(e){
        self.isSupported = false;
        if(console && console.error) console.error(e);
    }
};
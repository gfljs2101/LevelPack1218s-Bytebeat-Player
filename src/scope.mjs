function mod(a, b) {
	return ((a % b) + b) % b;
}

export class Scope {
	constructor() {
		this.canvasContainer = null;
		this.canvasCtx = null;
		this.canvasElem = null;
		this.canvasHeight = 256;
		this.canvasPlayButton = null;
		this.canvasTimeCursor = null;
		this.canvasWidth = 1024;
		this.colorChannels = null;
		this.colorDiagram = null;
		this.colorStereoRGB = [null, null];
		this.colorWaveform = null;
		this.drawBuffer = [];
		this.drawEndBuffer = [];
		this.drawMode = 'Combined';
		this.drawScale = 5;
		this.fftGridData = null;
		this.fftSize = 10;
		this.maxDecibels = -10;
		this.minDecibels = -120;
	}
	get timeCursorEnabled() {
		return globalThis.bytebeat.sampleRate >> this.drawScale < 2000;
	}
	clearCanvas() {
		this.canvasCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
		this.canvasCtx.globalCompositeOperation = this.drawMode === 'FFT' ? 'lighter' : 'source-over';
	}
	drawGraphics(endTime) {
		if(!isFinite(endTime)) {
			globalThis.bytebeat.resetTime();
			return;
		}
		const buffer = this.drawBuffer;
		const bufferLen = buffer.length;
		if(!bufferLen) {
			return;
		}
		const ctx = this.canvasCtx;
		const width = this.canvasWidth;
		const height = this.canvasHeight;
		// FFT graph drawing
		if(this.drawMode === 'FFT') {
			this.clearCanvas();
			const minFreq = Math.max(48000 / 2 ** this.fftSize, 10);
			const maxFreq = 24000; // audioCtx.sampleRate / 2 = 48000 / 2
			// Grid and labels
			if(this.fftGridData) {
				ctx.putImageData(this.fftGridData, 0, 0);
			} else {
				// Vertical grid and Hz labels
				ctx.beginPath();
				ctx.strokeStyle = '#444';
				ctx.fillStyle = '#faca63';
				ctx.font = '11px monospace';
				let freq = 10; // Start building from 10Hz
				while(freq <= maxFreq) {
					for(let i = 1; i < 10; ++i) {
						const curFreq = freq * i;
						const x = width * Math.log(curFreq / minFreq) / Math.log(maxFreq / minFreq);
						ctx.moveTo(x, 0);
						ctx.lineTo(x, height);
						if(i < 4 || i === 5) {
							ctx.fillText(freq < 1000 ? curFreq + 'Hz' : curFreq / 1000 + 'kHz', x + 1, 10);
						}
					}
					freq *= 10;
				}
				// Horizontal grid and  dB labels
				const dbRange = this.maxDecibels - this.minDecibels;
				for(let i = 10; i <= dbRange; i += 10) {
					const y = i * height / dbRange;
					if(i < dbRange) {
						ctx.moveTo(0, y);
						ctx.lineTo(width, y);
					}
					ctx.fillText(this.maxDecibels - i + 'dB', 1, i * height / dbRange - 2);
				}
				ctx.stroke();
				// Save to the buffer
				this.fftGridData = ctx.getImageData(0, 0, width, height);
			}
			// Detect stereo signal
			let isStereo = false;
			let i = Math.min(bufferLen, 200);
			while(i--) {
				if(isNaN(buffer[i].value[0]) && isNaN(buffer[i].value[1])) {
					continue;
				}
				if(buffer[i].value[0] !== buffer[i].value[1]) {
					isStereo = true;
					break;
				}
			}
			// Build the chart
			let ch = isStereo ? 2 : 1;
			while(ch--) {
				ctx.beginPath();
				ctx.strokeStyle = isStereo ? this.colorStereoRGB[ch] :
					`rgb(${ this.colorWaveform.join(',') })`;
				this.analyser[ch].getByteFrequencyData(this.analyserData[ch]);
				for(let i = 0, len = this.analyserData[ch].length; i < len; ++i) {
					const y = height * (1 - this.analyserData[ch][i] / 256);
					if(i) {
						const ratio = maxFreq / minFreq;
						ctx.lineTo(width * Math.log(i / len * ratio) / Math.log(ratio), y);
						continue;
					}
					ctx.moveTo(0, y);
				}
				ctx.stroke();
			}
			// Truncate buffer
			this.drawBuffer = this.drawBuffer.slice(-200);
			return;
		}
		const scale = this.drawScale;
		const isReverse = globalThis.bytebeat.playbackSpeed < 0;
		let startTime = buffer[0].t;
		let startX = mod(this.getX(startTime), width);
		let endX = Math.floor(startX + this.getX(endTime - startTime));
		startX = Math.floor(startX);
		let drawWidth = Math.abs(endX - startX) + 1;
		// Truncate large segments (for high playback speed or 512px canvas)
		if(drawWidth > width) {
			startTime = (this.getX(endTime) - width) * (1 << scale);
			startX = mod(this.getX(startTime), width);
			endX = Math.floor(startX + this.getX(endTime - startTime));
			startX = Math.floor(startX);
			drawWidth = Math.abs(endX - startX) + 1;
		}
		startX = Math.min(startX, endX);
		// Restoring the last points of a previous segment
		const imageData = this.canvasCtx.createImageData(drawWidth, height);
		const { data } = imageData;
		if(scale) {
			const x = isReverse ? drawWidth - 1 : 0;
			for(let y = 0; y < height; ++y) {
				const drawEndBuffer = this.drawEndBuffer[y];
				if(drawEndBuffer) {
					let idx = (drawWidth * (255 - y) + x) << 2;
					data[idx++] = drawEndBuffer[0];
					data[idx++] = drawEndBuffer[1];
					data[idx] = drawEndBuffer[2];
				}
			}
		}
		// Filling an alpha channel in a segment
		for(let x = 0; x < drawWidth; ++x) {
			for(let y = 0; y < height; ++y) {
				data[((drawWidth * y + x) << 2) + 3] = 255;
			}
		}
		// Drawing in a segment
		const isCombined = this.drawMode === 'Combined';
		const isDiagram = this.drawMode === 'Diagram';
		const isWaveform = this.drawMode === 'Waveform';
		const { colorDiagram } = this;
		const colorPoints = this.colorWaveform;
		const colorWaveform = !isWaveform ? colorPoints : [
			Math.floor(.6 * colorPoints[0] | 0),
			Math.floor(.6 * colorPoints[1] | 0),
			Math.floor(.6 * colorPoints[2] | 0)];
		for(let i = 0; i < bufferLen; ++i) {
			const curY = buffer[i].value;
			const prevY = buffer[i - 1]?.value ?? [NaN, NaN, NaN];
			const isNaNCurY = [isNaN(curY[0]), isNaN(curY[1]), isNaN(curY[2])];
			const curTime = buffer[i].t;
			const nextTime = buffer[i + 1]?.t ?? endTime;
			const curX = mod(Math.floor(this.getX(isReverse ? nextTime + 1 : curTime)) - startX, width);
			const nextX = mod(Math.ceil(this.getX(isReverse ? curTime + 1 : nextTime)) - startX, width);
			let diagramSize, diagramStart;
			if(isCombined || isDiagram) {
				diagramSize = Math.max(1, 256 >> scale);
				diagramStart = diagramSize * mod(curTime, 1 << scale);
			} else if(isNaNCurY[0] || isNaNCurY[1] || isNaNCurY[2]) {
				// Error value - filling with red color
				for(let x = curX; x !== nextX; x = mod(x + 1, width)) {
					for(let y = 0; y < height; ++y) {
						const idx = (drawWidth * y + x) << 2;
						if(!data[idx + 1] && !data[idx + 2]) {
							data[idx] = 100; // Error: red color
						}
					}
				}
			}
			let ch = 3;
			const drawDiagramPointFn = isCombined ? this.drawSoftPoint : this.drawPoint;
			const drawPointFn = this.drawPoint;
			const drawWavePointFn = isCombined ? this.drawPoint : this.drawSoftPoint;
			while(ch--) {
				const curYCh = curY[ch];
				const colorCh = this.colorChannels;
				// Diagram drawing
				if(isCombined || isDiagram) {
					const isNaNCurYCh = isNaNCurY[ch];
					const value = (curYCh & 255) / 256;
					const color = [
						value * colorDiagram[0] | 0,
						value * colorDiagram[1] | 0,
						value * colorDiagram[2] | 0];
					for(let x = curX; x !== nextX; x = mod(x + 1, width)) {
						for(let y = 0; y < diagramSize; ++y) {
							const idx = (drawWidth * (diagramStart + y) + x) << 2;
							if(isNaNCurYCh) {
								data[idx] = 100; // Error: red color
							} else {
								drawDiagramPointFn(data, idx, color, colorCh, ch);
							}
						}
					}
				}
				if(isNaNCurY[ch] || isDiagram) {
					continue;
				}
				// Points drawing
				for(let x = curX; x !== nextX; x = mod(x + 1, width)) {
					drawPointFn(data, (drawWidth * (255 - curYCh) + x) << 2, colorPoints, colorCh, ch);
				}
				// Waveform vertical lines drawing
				if(isCombined || isWaveform) {
					const prevYCh = prevY[ch];
					if(isNaN(prevYCh)) {
						continue;
					}
					const x = isReverse ? mod(Math.floor(this.getX(curTime)) - startX, width) : curX;
					for(let dy = prevYCh < curYCh ? 1 : -1, y = prevYCh; y !== curYCh; y += dy) {
						drawWavePointFn(data, (drawWidth * (255 - y) + x) << 2, colorWaveform, colorCh, ch);
					}
				}
			}
		}
		// Saving the last points of a segment
		if(scale) {
			const x = isReverse ? 0 : drawWidth - 1;
			for(let y = 0; y < height; ++y) {
				let idx = (drawWidth * (255 - y) + x) << 2;
				this.drawEndBuffer[y] = [data[idx], data[idx+1], data[idx+2]];
			}
		}
		// Placing a segment on the canvas
		this.canvasCtx.putImageData(imageData, startX, 0);
		if(endX >= width) {
			this.canvasCtx.putImageData(imageData, startX - width, 0);
		} else if(endX <= 0) {
			this.canvasCtx.putImageData(imageData, startX + width, 0);
		}
		// Move the cursor to the end of the segment
		if(this.timeCursorEnabled) {
			this.canvasTimeCursor.style.left = endX / width * 100 + '%';
		}
		// Clear buffer
		this.drawBuffer = [{ t: endTime, value: buffer[bufferLen - 1].value }];
	}
    drawPoint(data, i, color, colorCh, ch) {
        data[i + colorCh[ch]] = color[colorCh[ch]];
    }
    drawSoftPoint(data, i, color, colorCh, ch) {
        if (data[i + colorCh[ch]]) {
            return;
        }
        data[i + colorCh[ch]] = color[colorCh[ch]];
    }
	getColorTest(colorMode, newValue) {
		if(newValue) {
			this[colorMode] = [
				parseInt(newValue.substr(1, 2), 16),
				parseInt(newValue.substr(3, 2), 16),
				parseInt(newValue.substr(5, 2), 16)];
		}
		let rgbTxt, leftColor, rightColor, triple0Color, triple1Color, triple2Color;
		const value = this[colorMode];
		const c = this.colorChannels;
		switch(c[0]) {
		case 0:
		rgbTxt = ['R', 'G', 'B']; // [Left, Rigtht1, Right2]
		triple0Color = `0, 0, ${ value[c[0]] }`;
		triple1Color = `0, ${ value[c[1]] }, 0`;
		triple2Color = `${ value[c[2]] }, 0, 0`;
		
		leftColor = `${ value[c[0]] }, 0, 0`;
		rightColor = `0, ${ value[c[1]] }, ${ value[c[2]] }`;
		break;
		case 2:
		rgbTxt = ['B', 'R', 'G'];
		triple0Color = `0, ${ value[c[2]] }, 0`;
		triple1Color = `${ value[c[1]] }, 0, 0`;
		triple2Color = `0, 0, ${ value[c[0]] }`;
		
		leftColor = `0, 0, ${ value[c[0]] }`;
		rightColor = `${ value[c[1]] }, ${ value[c[2]] }, 0`;
		break;
		default:
		rgbTxt = ['G', 'R', 'B'];
		triple0Color = `0, 0, ${ value[c[2]] }`;
		triple1Color = `${ value[c[1]] }, 0, 0`;
		triple2Color = `0, ${ value[c[0]] }, 0`;
		
		leftColor = `0, ${ value[c[0]] }, 0`;
		rightColor = `${ value[c[1]] }, 0, ${ value[c[2]] }`;
		}
		return `[ Left <span class="control-color-test" style="background: rgb(${ leftColor });"></span>
		${ rgbTxt[0] }=${ value[c[0]] }, Right
		<span class="control-color-test" style="background: rgb(${ rightColor });"></span>
	${ rgbTxt[1] }=${ value[c[1]] } + ${ rgbTxt[2] }=${ value[c[2]] }] <br>[ Triples
			<span class="control-color-test" style="background: rgb(${ triple2Color });"></span> 
			${ rgbTxt[0] }=${ value[c[0]] }
			<span class="control-color-test" style="background: rgb(${ triple1Color });"></span>
			${ rgbTxt[1] }=${ value[c[1]] }
			<span class="control-color-test" style="background: rgb(${ triple0Color });"></span>
			${ rgbTxt[2] }=${ value[c[2]] } ]`;
	}
	getX(t) {
		return t / (1 << this.drawScale);
	}
	initElements() {
		this.canvasContainer = document.getElementById('canvas-container');
		this.canvasElem = document.getElementById('canvas-main');
		this.canvasCtx = this.canvasElem.getContext('2d');
		this.canvasPlayButton = document.getElementById('canvas-play');
		this.canvasTimeCursor = document.getElementById('canvas-timecursor');
		this.onresizeWindow();
		document.defaultView.addEventListener('resize', () => this.onresizeWindow());
	}
	onresizeWindow() {
		const isSmallWindow = window.innerWidth <= 768 || window.innerHeight <= 768;
		if(this.canvasWidth === 1024) {
			if(isSmallWindow) {
				this.canvasWidth = this.canvasElem.width = 512;
			}
		} else if(!isSmallWindow) {
			this.canvasWidth = this.canvasElem.width = 1024;
		}
	}
	requestAnimationFrame() {
		window.requestAnimationFrame(() => {
			this.drawGraphics(globalThis.bytebeat.byteSample);
			if(globalThis.bytebeat.isPlaying) {
				this.requestAnimationFrame();
			}
		});
	}
	setFFTAnalyzer() {
		this.analyser[0].fftSize = this.analyser[1].fftSize = 2 ** this.fftSize;
		this.analyserData = [
			new Uint8Array(this.analyser[0].frequencyBinCount),
			new Uint8Array(this.analyser[1].frequencyBinCount)];
		this.fftGridData = null;
	}
	setFFTSize(value) {
		this.fftSize = Math.min(Math.max(value, 6), 15);
	}
	setStereoColors() {
		const ch = this.colorChannels;
		const colorLeft = [0, 0, 0];
		const colorRight = [0, 0, 0];
		colorLeft[ch[0]] = this.colorWaveform[ch[0]];
		colorRight[ch[1]] = this.colorWaveform[ch[1]];
		colorRight[ch[2]] = this.colorWaveform[ch[2]];
		this.colorStereoRGB = [`rgb(${ colorLeft.join(',') })`, `rgb(${ colorRight.join(',') })`];
	}
	toggleTimeCursor() {
		this.canvasTimeCursor.classList.toggle('hidden', this.drawMode === 'FFT' || !this.timeCursorEnabled);
	}
}
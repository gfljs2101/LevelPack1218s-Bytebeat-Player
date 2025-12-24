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
		this.colorWaveform = null;
		this.drawBuffer = [];
		this.drawEndBuffer = [];
		this.drawMode = 'Combined';
		this.drawScale = 5;
	}

	get timeCursorEnabled() {
		return globalThis.bytebeat.sampleRate >> this.drawScale < 2000;
	}

	clearCanvas() {
		this.canvasCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
	}

	// Merged drawGraphics (adapted to use Scope's properties and module-level mod)
	drawGraphics(endTime) {
		if (!isFinite(endTime)) {
			globalThis.bytebeat.resetTime();
			return;
		}
		const buffer = this.drawBuffer;
		const bufferLen = buffer.length;
		if (!bufferLen) {
			return;
		}
		const redColor = 100;
		const width = this.canvasWidth;
		const height = this.canvasHeight;
		const scale = this.drawScale;
		const isReverse = globalThis.bytebeat.playbackSpeed < 0;
		let startTime = buffer[0].t;
		let startX = mod(this.getX(startTime), width);
		let endX = Math.floor(startX + this.getX(endTime - startTime));
		startX = Math.floor(startX);
		let drawWidth = Math.abs(endX - startX) + 1;
		// Truncate large segments (for high playback speed or 512px canvas)
		if (drawWidth > width) {
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
		if (scale) {
			const x = isReverse ? drawWidth - 1 : 0;
			for (let y = 0; y < height; ++y) {
				const drawEndBuffer = this.drawEndBuffer[y];
				if (drawEndBuffer) {
					const idx = (drawWidth * (255 - y) + x) << 2;
					data[idx] = drawEndBuffer[0];
					data[idx+1] = drawEndBuffer[1];
					data[idx+2] = drawEndBuffer[2];
				}
			}
		}
		// Filling an alpha channel in a segment
		for (let x = 0; x < drawWidth; ++x) {
			for (let y = 0; y < height; ++y) {
				data[((drawWidth * y + x) << 2) + 3] = 255;
			}
		}
		// Drawing in a segment
		const isWaveform = this.drawMode === 'Waveform';
		const isDiagram = this.drawMode === 'Diagram';
		for (let i = 0; i < bufferLen; ++i) {
			const curY = buffer[i].value;
			const prevY = buffer[i - 1]?.value ?? [NaN, NaN, NaN];
			const isNaNCurY = [isNaN(curY[0]), isNaN(curY[1]), isNaN(curY[2])];
			const curTime = buffer[i].t;
			const nextTime = buffer[i + 1]?.t ?? endTime;
			const curX = mod(Math.floor(this.getX(isReverse ? nextTime + 1 : curTime)) - startX, width);
			const nextX = mod(Math.ceil(this.getX(isReverse ? curTime + 1 : nextTime)) - startX, width);
			const diagramIteration = mod(curTime, (2 ** this.drawScale));
			// Error value - filling with red color
			if ((isNaNCurY[0] || isNaNCurY[1] || isNaNCurY[2]) && !isDiagram) {
				for (let x = curX; x !== nextX; x = mod(x + 1, width)) {
					for (let y = 0; y < height; ++y) {
						const idx = (drawWidth * y + x) << 2;
						if (!data[idx + 1] && !data[idx + 2]) {
							data[idx] = redColor;
						}
					}
				}
			}
			for (let ch=0; ch<3; ch++) {
				if (isNaNCurY[ch] && !isDiagram) {
					continue;
				}
				const curYCh = curY[ch];
				if (!isDiagram) { // We are not drawing diagram
					// Points drawing
					for (let x = curX; x !== nextX; x = mod(x + 1, width)) {
						this.drawPoint(data, (drawWidth * (255 - curYCh) + x) << 2, ch);
					}
					// Waveform mode: vertical lines drawing
					if (isWaveform) {
						const prevYCh = prevY[ch];
						if (isNaN(prevYCh)) {
							continue;
						}
						const x = isReverse ? mod(Math.floor(this.getX(curTime)) - startX, width) : curX;
						for (let dy = prevYCh < curYCh ? 1 : -1, y = prevYCh; y !== curYCh; y += dy) {
							this.drawWaveLine(data, (drawWidth * (255 - y) + x) << 2, ch);
						}
					}
				} else { // We're drawing diagram, use that
					for (let x = curX; x !== nextX; x = mod(x + 1, width)) {
						this.drawDiagram(data, drawWidth, x, curYCh, diagramIteration, scale, isNaNCurY[ch], ch);
					}
				}
			}
		}
		// Saving the last points of a segment
		if (scale) {
			const x = isReverse ? 0 : drawWidth - 1;
			for (let y = 0; y < height; ++y) {
				const idx = (drawWidth * (255 - y) + x) << 2;
				this.drawEndBuffer[y] = [data[idx], data[idx + 1], data[idx + 2]];
			}
		}
		// Placing a segment on the canvas
		this.canvasCtx.putImageData(imageData, startX, 0);
		if (endX >= width) {
			this.canvasCtx.putImageData(imageData, startX - width, 0);
		} else if (endX <= 0) {
			this.canvasCtx.putImageData(imageData, startX + width, 0);
		}
		// Move the cursor to the end of the segment
		if (this.timeCursorEnabled) {
			this.canvasTimeCursor.style.left = endX / width * 100 + '%';
		}
		// Clear buffer
		this.drawBuffer = [{ t: endTime, value: buffer[bufferLen - 1].value }];
	}

	// Simple point drawing (original single-channel style)
	drawPoint(data, i, ch) {
		data[i+ch] = 255;
	}

	// Simple waveform vertical line drawing (original single-channel style)
	drawWaveLine(data, i, ch) {
		if (data[i+ch] < 101) {
			data[i+ch] = 160;
		}
	}

	// Simple diagram drawing (original single-channel style)
	drawDiagram(data, DW, j, V, DI, scale, NaNchk, ch) {
		const size = 256 / (2 ** scale);
		for (let k = 0; k < size; k++) {
			let i = ((k + (DI * size)) * DW + j) << 2;
			if (NaNchk) {
				data[i] = 100;
			} else {
				data[i + ch] = V & 255;
			}
		}
	}

	// The rest of the Scope methods from the provided class (kept intact)
	drawPointMono(data, i, color) {
		data[i++] = color[0];
		data[i++] = color[1];
		data[i] = color[2];
	}
	drawPointStereo(data, i, color, colorCh, isRight) {
		if (isRight) {
			const c1 = colorCh[1];
			const c2 = colorCh[2];
			data[i + c1] = color[c1];
			data[i + c2] = color[c2];
		} else {
			const c0 = colorCh[0];
			data[i + c0] = color[c0];
		}
	}
	drawSoftPointMono(data, i, color) {
		if (data[i] || data[i + 1] || data[i + 2]) {
			return;
		}
		data[i++] = color[0];
		data[i++] = color[1];
		data[i] = color[2];
	}
	drawSoftPointStereo(data, i, color, colorCh, isRight) {
		if (isRight) {
			let i1, i2, c1, c2;
			if (data[i1 = i + (c1 = colorCh[1])] || data[i2 = i + (c2 = colorCh[2])]) {
				return;
			}
			data[i1] = color[c1];
			data[i2] = color[c2];
			return;
		}
		const c0 = colorCh[0];
		const i0 = i + c0;
		if (data[i0]) {
			return;
		}
		data[i0] = color[c0];
	}
	getColorTest(colorMode, newValue) {
		if (newValue) {
			this[colorMode] = [
				parseInt(newValue.substr(1, 2), 16),
				parseInt(newValue.substr(3, 2), 16),
				parseInt(newValue.substr(5, 2), 16)];
		}
		let rgbTxt, leftColor, rightColor;
		const value = this[colorMode];
		const c = this.colorChannels;
		switch (c[0]) {
		case 0:
			rgbTxt = ['R', 'G', 'B']; // [Left, Rigtht1, Right2]
			leftColor = `${ value[c[0]] }, 0, 0`;
			rightColor = `0, ${ value[c[1]] }, ${ value[c[2]] }`;
			break;
		case 2:
			rgbTxt = ['B', 'R', 'G'];
			leftColor = `0, 0, ${ value[c[0]] }`;
			rightColor = `${ value[c[1]] }, ${ value[c[2]] }, 0`;
			break;
		default:
			rgbTxt = ['G', 'R', 'B'];
			leftColor = `0, ${ value[c[0]] }, 0`;
			rightColor = `${ value[c[1]] }, 0, ${ value[c[2]] }`;
		}
		return `[ Left <span class="control-color-test" style="background: rgb(${ leftColor });"></span>
			${ rgbTxt[0] }=${ value[c[0]] }, Right
			<span class="control-color-test" style="background: rgb(${ rightColor });"></span>
			${ rgbTxt[1] }=${ value[c[1]] } + ${ rgbTxt[2] }=${ value[c[2]] } ]`;
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
		if (this.canvasWidth === 1024) {
			if (isSmallWindow) {
				this.canvasWidth = this.canvasElem.width = 512;
			}
		} else if (!isSmallWindow) {
			this.canvasWidth = this.canvasElem.width = 1024;
		}
	}
	requestAnimationFrame() {
		window.requestAnimationFrame(() => {
			this.drawGraphics(globalThis.bytebeat.byteSample);
			if (globalThis.bytebeat.isPlaying) {
				this.requestAnimationFrame();
			}
		});
	}
	toggleTimeCursor() {
		this.canvasTimeCursor.classList.toggle('hidden', !this.timeCursorEnabled);
	}
}
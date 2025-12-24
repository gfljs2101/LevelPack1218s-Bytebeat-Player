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
    drawGraphics(endTime) {
        if (!isFinite(endTime)) {
            if (typeof this.resetTime === 'function') {
                this.resetTime();
            } else if (globalThis?.bytebeat?.resetTime) {
                globalThis.bytebeat.resetTime();
            }
            return;
        }
 
        const buffer = this.drawBuffer;
        const bufferLen = buffer.length;
        if (!bufferLen || bufferLen === 1) {
            return;
        }
 
        const width = this.canvasWidth;
        const height = this.canvasHeight;
        const scale = this.settings?.drawScale ?? this.drawScale ?? 0;
        const mod = this.mod?.bind(this) ?? ((n, m) => ((n % m) + m) % m);
 
        const pbSpeed = globalThis?.bytebeat?.playbackSpeed ?? this.playbackSpeed ?? 1;
        const sampleRateSign = (this.songData?.sampleRate ?? 1);
        const isReverse = (pbSpeed < 0) ^ (sampleRateSign < 0);
 
        let startTime = buffer[0].t;
        let startX = mod(Math.floor(this.getX(startTime)), width);
        let endX = Math.floor(startX + this.getX(endTime - startTime));
        startX = Math.floor(startX);
        let drawWidth = Math.abs(endX - startX) + 1;
 
        if (drawWidth > width) {
            startTime = (this.getX(endTime) - width) * (1 << scale);
            startX = mod(Math.floor(this.getX(startTime)), width);
            endX = Math.floor(startX + this.getX(endTime - startTime));
            startX = Math.floor(startX);
            drawWidth = Math.abs(endX - startX) + 1;
        }
        startX = Math.min(startX, endX);
 
        const imageData = this.canvasCtx.createImageData(drawWidth, height);
        const {
            data
        } = imageData;
 
        const status = [];
 
        if (scale) {
            const x = isReverse ? drawWidth - 1 : 0;
            for (let y = 0; y < height; ++y) {
                const drawEndBuffer = this.drawEndBuffer?. [y];
                if (drawEndBuffer) {
                    let idx = drawWidth * (255 - y) + x;
                    status[idx] = drawEndBuffer[3] ?? 0;
                    idx *= 4;
                    data[idx++] = drawEndBuffer[0];
                    data[idx++] = drawEndBuffer[1];
                    data[idx] = drawEndBuffer[2];
                }
            }
        }
 
        for (let x = 0; x < drawWidth; ++x) {
            for (let y = 0; y < height; ++y) {
                data[((drawWidth * y + x) * 4) + 3] = 255;
            }
        }
 
        const drawMode = this.settings?.drawMode ?? this.drawMode;
        const isCombined = drawMode === 'Combined';
        const isDiagram = drawMode === 'Diagram';
        const isWaveform = drawMode === 'Waveform';
        const isWaveformAlt = drawMode === 'WaveformAlt';
        const isCombinedOld = drawMode === 'CombinedOld';
        const colorDiagram = this.colorDiagram;
        const colorPoints = this.colorWaveform;
        const colorWaveform = [
            Math.floor((isWaveformAlt || isCombinedOld ? 1 : 0.6) * colorPoints[0]) | 0,
            Math.floor((isWaveformAlt || isCombinedOld ? 1 : 0.6) * colorPoints[1]) | 0,
            Math.floor((isWaveformAlt || isCombinedOld ? 1 : 0.6) * colorPoints[2]) | 0
        ];
 
        const drawDiagramPointFn = (isCombined || isCombinedOld ? (this.drawSoftPoint || drawSoftPoint) : (this.drawPoint || drawPoint));
        const drawPointFn = this.drawPoint || drawPoint;
        const drawWavePointFn = this.drawPoint || drawPoint; // Old points and waveform combined with default behavior
        for (let i = 0; i < bufferLen; ++i) {
            const curY = buffer[i].value;
            const prevY = buffer[i - 1]?.value ?? [NaN, NaN, NaN];
            const isNaNCurY = [
                isNaN(curY[0]),
                isNaN(curY[1]),
                isNaN(curY[2])
            ];
            const curTime = buffer[i].t;
            const nextTime = buffer[i + 1]?.t ?? endTime;
 
            const curX = mod(Math.floor(this.getX(isReverse ? nextTime + 1 : curTime)) - startX, width);
            const nextX = mod(Math.ceil(this.getX(isReverse ? curTime + 1 : nextTime)) - startX, width);
 
            let diagramSize, diagramStart;
            if (isCombined || isCombinedOld || isDiagram) {
                diagramSize = Math.max(1, 256 >> scale);
                diagramStart = diagramSize * mod(curTime, 1 << scale);
            } else if (isNaNCurY[0] || isNaNCurY[1] || isNaNCurY[2]) {
                for (let x = curX; x !== nextX; x = mod(x + 1, width)) {
                    for (let y = 0; y < height; ++y) {
                        const idx = (drawWidth * y + x) * 4;
                        if (!data[idx + 1] && !data[idx + 2]) {
                            data[idx] = 100;
                        }
                    }
                }
            }
 
            const channelCount = Math.max(1, curY.length);
            for (let ch = 0; ch < channelCount; ++ch) {
                const curYCh = curY[ch];
                const colorCh = this.colorChannels ?? [0, 1, 2];
				if(isCombined || isCombinedOld || isDiagram) {
					const isNaNCurYCh = isNaNCurY[ch];
					const value = (curYCh & 255) / 256;
					const color = [
						value * colorDiagram[0] | 0,
						value * colorDiagram[1] | 0,
						value * colorDiagram[2] | 0];
					for(let y = 0; y < diagramSize; ++y) {
						for(let x = curX; x !== nextX; x = mod(x + 1, width)) {
							const idx = (drawWidth * (diagramStart + y) + x) << 2;
							if(isNaNCurYCh) {
								data[idx] = 100; // Error: red color
							} else {
								drawDiagramPointFn(data, idx, color, colorCh, ch);
							}
						}
					}
				}
 
                if (isNaNCurY[ch] || isDiagram) {
                    continue;
                }

                for (let x = curX; x !== nextX; x = mod(x + 1, width)) {
                    const idx = drawWidth * (255 - curYCh) + x;
                    status[idx] = 1;
                    drawPointFn(data, idx * 4, colorPoints, colorCh, ch);
                }
 
                if (isCombined || isCombinedOld || isWaveform || isWaveformAlt) {
                    const prevYCh = prevY[ch];
                    if (isNaN(prevYCh)) {
                        continue;
                    }
                    const x = isReverse ? mod(Math.floor(this.getX(curTime)) - startX, width) : curX;
                    for (let dy = prevYCh < curYCh ? 1 : -1, y = prevYCh; y !== curYCh; y += dy) {
                        drawWavePointFn(data, (drawWidth * (255 - y) + x) * 4, colorWaveform, colorCh, ch);
                    }
                }
            }
        }
 
        if (scale) {
            const x = isReverse ? 0 : drawWidth - 1;
            for (let y = 0; y < height; ++y) {
                let idx = drawWidth * (255 - y) + x;
                const s = status[idx];
                idx *= 4;
                this.drawEndBuffer[y] = [data[idx], data[idx + 1], data[idx + 2], s];
            }
        }
 
        this.canvasCtx.putImageData(imageData, startX, 0);
        if (endX >= width) {
            this.canvasCtx.putImageData(imageData, startX - width, 0);
        } else if (endX <= 0) {
            this.canvasCtx.putImageData(imageData, startX + width, 0);
        }
 
        if (this.timeCursorEnabled) {
            this.canvasTimeCursor.style.left = (endX / width * 100) + '%';
        }
 
        this.drawBuffer = [{
            t: endTime,
            value: buffer[bufferLen - 1].value
        }];
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
		let rgbTxt, leftColor, rightColor;
		const value = this[colorMode];
		const c = this.colorChannels;
		switch(c[0]) {
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
	toggleTimeCursor() {
		this.canvasTimeCursor.classList.toggle('hidden', !this.timeCursorEnabled);
	}
}

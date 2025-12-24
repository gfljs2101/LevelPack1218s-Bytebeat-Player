class audioProcessor extends AudioWorkletProcessor {
	constructor(...args) {
		super(...args);
		// Time / sample bookkeeping
		this.audioSample = 0;
		this.byteSample = 0;
		this.divisorStorage = 0;
		this.lastTime = -1;

		// Playback / modes / UI state
		this.drawMode = 'Points';
		this.DMode = this.soundMode; // kept for compatibility with incoming messages that use DMode
		this.soundMode = 'Bytebeat';
		this.errorDisplayed = true;
		this.isFuncbeat = false;
		this.isPlaying = false;
		this.playbackSpeed = 1;

		// Processing state
		this.func = null;
		this.getValues = (_s) => NaN;
		this.getValuesVisualizer = (_s) => 0;
		this.lastValues = [0, 0, 0];
		this.outValue = [0, 0];
		this.lastByteValue = [0, 0, 0];
		this.lastFuncValue = [null, null];

		// Rate and divisor settings
		this.sampleRate = (typeof sampleRate === 'number') ? sampleRate : (globalThis.sampleRate || 8000);
		this.sampleRatio = 1;
		this.sampleDivisor/*PRO*/ = 1;

		Object.seal(this);
		audioProcessor.deleteGlobals();
		audioProcessor.freezeGlobals();

		this.port.addEventListener('message', e => this.receiveData(e.data));
		this.port.start();
	}

	/* --- Global cleanup / freeze helpers (kept as provided) --- */
	static deleteGlobals() {
		// Delete single letter variables to prevent persistent variable errors (covers a good enough range)
		for (let i = 0; i < 26; ++i) {
			delete globalThis[String.fromCharCode(65 + i)];
			delete globalThis[String.fromCharCode(97 + i)];
		}
		// Delete global variables
		for (const name in globalThis) {
			if (Object.prototype.hasOwnProperty.call(globalThis, name)) {
				delete globalThis[name];
			}
		}
	}

	static freezeGlobals() {
		Object.getOwnPropertyNames(globalThis).forEach(name => {
			const prop = globalThis[name];
			const type = typeof prop;
			if ((type === 'object' || type === 'function') && name !== 'globalThis') {
				try { Object.freeze(prop); } catch (e) { /* ignore */ }
			}
			if (type === 'function' && Object.prototype.hasOwnProperty.call(prop, 'prototype')) {
				try { Object.freeze(prop.prototype); } catch (e) { /* ignore */ }
			}
			try {
				Object.defineProperty(globalThis, name, { writable: false, configurable: false });
			} catch (e) { /* ignore */ }
		});
	}

	static getErrorMessage(err, time) {
		const when = time === null ? 'compilation' : 't=' + time;
		if (!(err instanceof Error)) {
			return `${when} thrown: ${typeof err === 'string' ? err : JSON.stringify(err)}`;
		}
		const { message, lineNumber, columnNumber } = err;
		return `${when} error${typeof lineNumber === 'number' && typeof columnNumber === 'number' ?
			` (at line ${lineNumber - 3}, character ${+columnNumber})` : ''}: ${typeof message === 'string' ? message : JSON.stringify(message)}`;
	}

	/* --- Visualizer pixel handling --- */
	handleVisualizerPixels(a) {
		let b = Array.isArray(a) ? a.slice() : a;
		if (Array.isArray(b)) {
			if (b.length == 2) b = [b[0], b[1], b[1]];
			else if (b.length == 1) b = [b[0], NaN, NaN];
			else if (b.length == 0) b = [NaN, NaN, NaN];
			else if (b.length > 2) b = [b[0], b[1], b[2]]
		} else {
			b = [b, b, b];
		}
		for (let ch = 0; ch < 3; ch++) {
			try {
				b[ch] = +b[ch];
			} catch {
				b[ch] = NaN;
			}
			if (!isNaN(b[ch]))
				b[ch] = Math.floor(this.getValuesVisualizer(b[ch], ch))&255;
		}
		return b;
	}
	handleAudioSamples(a) {
		let b = Array.isArray(a) ? a.slice() : a;
		let triples = false;
		let c = [];
		if (Array.isArray(b)) {
			if (b.length == 2) b = [b[0], b[1]];
			if (b.length > 2) { b = [b[0], b[1], b[2]]; triples = true; }
			else if (b.length == 1) b = [b[0], NaN];
			else if (b.length == 0) b = [NaN, NaN];
		} else {
			b = [b, b];
		}
		for (let ch = 0; ch < (2 + +triples); ch++) {
			try {
				b[ch] = +b[ch];
			} catch {
				b[ch] = NaN;
			}
			if (!isNaN(b[ch]))
				this.lastValues[ch] = b[ch] = this.getValues(b[ch], ch);
			else b[ch] = this.lastValues[ch];
		}
		if (triples)
			c = [b[0] * (2 / 3) + b[1] / 3, b[2] * (2 / 3) + b[1] / 3];
		else c = [b[0], b[1]];
		this.outValue = c;
	}

	/* --- Main audio processing loop --- */
	process(inputs, outputs /*, parameters */) {
		const outputData = (outputs && outputs[0]) ? outputs[0] : null;
		if (!outputData || !outputData[0] || !outputData[1]) return true;
		const chDataLen = outputData[0].length;
		if (!chDataLen || !this.isPlaying) {
			return true;
		}

		let time = this.sampleRatio * this.audioSample;
		let divisor = this.sampleDivisor;
		let { byteSample } = this;
		const drawBuffer = [];
		const isDiagram = (this.drawMode === 'Combined' || this.drawMode === 'Diagram') || (this.DMode === 'Diagram');

		for (let i = 0; i < chDataLen; ++i) {
			time += this.sampleRatio;
			const currentTime = Math.floor(time);

			if (this.lastTime !== currentTime) {
				let funcValue;
				const currentSample = Math.floor(byteSample);
				// divisor check: only sample func on divisor boundaries, otherwise reuse storage
				const DivisorMet = (((currentTime % divisor) + divisor) % divisor) === 0;

				try {
					// build mic sample from inputs if present
					const in0 = inputs && inputs[0] ? inputs[0] : [];
					const in00 = in0[0] ?? [];
					const in01 = in0[1] ?? in00;
					const in00i = in00[i] ?? 0;
					const in01i = in01[i] ?? 0;
					const micSample = [in00i, in01i, (in00i + in01i) / 2];

					if (this.isFuncbeat) {
						// funcbeat gets (timeSeconds, sampleRate, sampleIndex, mic)
						funcValue = this.func(currentSample / this.sampleRate, this.sampleRate, currentSample, micSample);
					} else {
						// bytebeat / simpler functions expect just t or t + mic
						funcValue = this.func ? this.func(currentSample, micSample) : NaN;
					}

					if (!DivisorMet) {
						// If divisor is used and current tick is not on divisor boundary, reuse last divisorStorage
						funcValue = this.divisorStorage;
					} else {
						this.divisorStorage = funcValue;
					}
				} catch (err) {
					if (this.errorDisplayed) {
						this.errorDisplayed = false;
						this.sendData({
							error: {
								message: audioProcessor.getErrorMessage(err, currentSample),
								isRuntime: true
							}
						});
					}
					funcValue = NaN;
				}

				this.handleAudioSamples(funcValue);
				const visualizerValues = this.handleVisualizerPixels(funcValue);
				drawBuffer.push({ t: currentSample, value: [...visualizerValues] });

				byteSample += currentTime - this.lastTime;
				this.lastTime = currentTime;
			}

			outputData[0][i] = this.outValue[0];
			outputData[1][i] = this.outValue[1];
		}

		if (Math.abs(byteSample) > Number.MAX_SAFE_INTEGER) {
			this.resetTime();
			return true;
		}

		this.audioSample += chDataLen;

		let isSend = false;
		const data = {};
		if (byteSample !== this.byteSample) {
			isSend = true;
			data.byteSample = this.byteSample = byteSample;
		}
		if (drawBuffer.length) {
			isSend = true;
			data.drawBuffer = drawBuffer;
		}
		if (isSend) {
			this.sendData(data);
		}

		return true;
	}

	/* --- Message handling (control from main thread) --- */
	receiveData(data) {
		if (data.byteSample !== undefined) {
			this.byteSample = +data.byteSample || 0;
			this.resetValues();
		}
		if (data.errorDisplayed === true) {
			this.errorDisplayed = true;
		}
		if (data.isPlaying !== undefined) {
			this.isPlaying = data.isPlaying;
		}
		if (data.playbackSpeed !== undefined) {
			const sampleRatio = this.sampleRatio / this.playbackSpeed;
			this.playbackSpeed = data.playbackSpeed;
			this.setSampleRatio(sampleRatio);
		}
		// Mode handling: keep wide support (Bytebeat, Signed Bytebeat, Floatbeat, Funcbeat, Bitbeat, 2048, logmode, logHack, logHack2)
		if (data.mode !== undefined) {
			this.isFuncbeat = data.mode === 'Funcbeat';
			switch (data.mode) {
				case 'Bytebeat':
					this.getValues = (funcValue, ch) => (this.lastByteValue[ch] = funcValue & 255) / 127.5 - 1;
					this.getValuesVisualizer = (funcValue) => (funcValue & 255);
					break;
				case 'Signed Bytebeat':
					this.getValues = (funcValue, ch) =>
						(this.lastByteValue[ch] = (funcValue + 128) & 255) / 127.5 - 1;
					this.getValuesVisualizer = (funcValue) => (funcValue + 128 & 255);
					break;
				case 'Floatbeat':
				case 'Funcbeat':
					this.getValues = (funcValue, ch) => {
						const limited = Math.max(Math.min(funcValue, 1), -1);
						this.lastByteValue[ch] = limited * 127.5 + 127.5 | 0;
						return limited;
					};
					this.getValuesVisualizer = (funcValue) => (Math.max(Math.min(funcValue, 1), -1) * 127.5 + 128);
					break;

				default:
					this.getValues = (_funcValue) => NaN;
			}
		}
		if (data.setFunction !== undefined) {
			this.setFunction(data.setFunction);
		}
		if (data.resetTime === true) {
			this.resetTime();
		}
		if (data.sampleRate !== undefined) {
			this.sampleRate = data.sampleRate;
		}
		if (data.sampleRatio !== undefined) {
			this.setSampleRatio(data.sampleRatio);
		}
		if (data.divisor !== undefined) {
			this.sampleDivisor/*PRO*/ = data.divisor;
		}
		if (data.DMode !== undefined) {
			this.DMode = data.DMode;
		}
		if (data.drawMode !== undefined) {
			this.drawMode = data.drawMode;
		}
		if (data.DMode !== undefined) {
			// maintain compatibility: sometimes DMode is used as soundMode in earlier variant
			this.soundMode = data.DMode;
		}
	}

	sendData(data) {
		this.port.postMessage(data);
	}

	resetTime() {
		this.byteSample = 0;
		this.resetValues();
		this.sendData({ byteSample: 0 });
	}

	resetValues() {
		this.audioSample = 0;
		this.lastTime = -1;
		this.outValue = [0, 0];
		this.lastFuncValue = [null, null];
	}

	/* --- Compile and set the user function --- */
	setFunction(codeText) {
		const chyx = {
			/*bit*/ "bitC": function (x, y, z) { return x & y ? z : 0 },
			/*bit reverse*/ "br": function (x, size = 8) {
				if (size > 32) { throw new Error("br() Size cannot be greater than 32"); } else {
					let result = 0;
					for (let idx = 0; idx < size; idx++) {
						result += chyx.bitC(x, 2 ** idx, 2 ** (size - (idx + 1)));
					}
					return result;
				}
			},
			/*sin that loops every 128 "steps", instead of every pi steps*/ "sinf": function (x) { return Math.sin(x / (128 / Math.PI)); },
			/*cos that loops every 128 "steps", instead of every pi steps*/ "cosf": function (x) { return Math.cos(x / (128 / Math.PI)); },
			/*tan that loops every 128 "steps", instead of every pi steps*/ "tanf": function (x) { return Math.tan(x / (128 / Math.PI)); },
			/*converts t into a string composed of it's bits, regex's that*/ "regG": function (t, X) { return X.test(t.toString(2)); }
		};

		// Create shortened Math functions
		const params = Object.getOwnPropertyNames(Math);
		const values = params.map(k => Math[k]);
		const chyxNames = Object.getOwnPropertyNames(chyx);
		const chyxFuncs = chyxNames.map(k => chyx[k]);
		params.push('int', 'window', ...chyxNames);
		values.push(Math.floor, globalThis, ...chyxFuncs);

		audioProcessor.deleteGlobals();

		// Optimize code like eval(unescape(escape`XXXX`.replace(/u(..)/g,"$1%")))
		codeText = (codeText || '').toString().trim().replace(
			/^eval\(unescape\(escape(?:`|\('|\("|\(`)(.*?)(?:`|'\)|"\)|`\)).replace\(\/u\(\.\.\)\/g,["'`]\$1%["'`]\)\)\)$/,
			(_match, p1) => unescape(escape(p1).replace(/u(..)/g, '$1%')));

		// Bytebeat/Funcbeat code testing & compilation
		let isCompiled = false;
		const oldFunc = this.func;
		try {
			if (this.isFuncbeat) {
				// Funcbeat: factory function that returns an audio function
				this.func = new Function(...params, codeText).bind(globalThis, ...values);
				isCompiled = true;
				// Evaluate to get the actual function (could throw)
				this.func = this.func();
				// test call: (timeSeconds, sampleRate, sampleIndex, micSample)
				if (typeof this.func === 'function') {
					this.func(0, this.sampleRate, 0, [0, 0, 0]);
				} else {
					throw new Error('Funcbeat did not return a function');
				}
			} else {
				// Bytebeat: expect something returning expression with t and optionally mic
				this.func = new Function(...params, 't', '_micSample', `return 0,\n${codeText || 0};`).bind(globalThis, ...values);
				isCompiled = true;
				// test call: provide t=0 and mic sample
				this.func(0, [0, 0, 0]);
			}
		} catch (err) {
			if (!isCompiled) {
				this.func = oldFunc;
			}
			this.errorDisplayed = false;
			this.sendData({
				error: { message: audioProcessor.getErrorMessage(err, isCompiled ? 0 : null), isCompiled },
				updateUrl: isCompiled
			});
			return;
		}

		this.errorDisplayed = false;
		this.sendData({ error: { message: '', isCompiled }, updateUrl: true });
	}

	setSampleRatio(sampleRatio) {
		const timeOffset = Math.floor(this.sampleRatio * this.audioSample) - this.lastTime;
		this.sampleRatio = sampleRatio * this.playbackSpeed;
		this.lastTime = Math.floor(this.sampleRatio * this.audioSample) - timeOffset;
	}
}

registerProcessor('audioProcessor', audioProcessor);
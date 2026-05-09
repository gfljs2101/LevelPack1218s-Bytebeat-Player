export class Actions { //Chasyxx's bakers chasyxx.github.io/minibaker
	constructor() {
		this.in = null
		this.temp = null
		this.c1 = null
		this.c2 = null
		this.cc1 = null
		this.cc2 = null
		this.cmb = null
		this.sts = null
		this.errorReason = null
		this.errorChar = null
		this.formatted = null
		this.code = document.getElementById('editor-default')
		this.forceElem = document.getElementById('control-force-output')
		this.clearElem = document.getElementById('control-clear-output')
		this.startElem = document.getElementById('control-format')
		this.bakeElem = document.getElementById('control-minibake')
		this.debakeElem = document.getElementById('control-deminibake')
		this.tabName = document.getElementById('TAB-NAME')
		this.disappear = [document.getElementById(`control-sum`)]
		this.AprilFoolsElements = [this.bakeElem, this.debakeElem]
		this.errorText = null
		this.oldCode = null
		this.localTest = null
	}
	minibakeCode(str) {
		if (str.length & 1) {
			str += " "
		}
		str = str.replace(/, /g, ",")
		let len = Math.floor(str.length / 2)
		let output = ""
		for (let i = 0; i < len; i++) {
			this.c1 = str.substring(i * 2, i * 2 + 1)
			this.c2 = str.substring(i * 2 + 1, i * 2 + 2)
			this.cc1 = this.c1.charCodeAt(0)
			this.cc2 = this.c2.charCodeAt(0)
			this.cmb = (this.cc1 << 8) | this.cc2
			output += String.fromCharCode(this.cmb)
			//output += String.fromCodePoint(cmb)
		}
		return "eval(unescape(escape`" + output + "`.replace(/u(..)/g,\"$1%\")))"
	}
	unminibakeCode(str) {
		str = str.trim().replace(
			/^eval\(unescape\(escape(?:`|\('|\("|\(`)(.*?)(?:`|'\)|"\)|`\)).replace\(\/u\(\.\.\)\/g,["'`]\$1%["'`]\)\)\)$/,
			(match, p1) => (unescape(escape(p1).replace(/u(..)/g, '$1%'))));

		return str
	}
	commaFormat(initialCode, maxParenLayers = 0) {
		let output = '';
		let parenLayerCount = 0;
		let inString = false
		let arrayLayerCount = 0;
		for(let i = 0; i < initialCode.length; i++) {
			const c = initialCode[i];
			switch(c) {
				case ',': case ';': {
					output += c;
					if ((parenLayerCount <= maxParenLayers) && (arrayLayerCount < 1) && !inString && initialCode[i + 1] != `\n`) {
						output += "\n\n"+"\t".repeat(parenLayerCount);
					}
				} break;
				case '`': case '\'': case '"': {
					if (inString && initialCode[i - 1] != '\\') {
						if (inString == initialCode[i]) {
							inString = false
						}
					} else {
						inString = initialCode[i]
					}
					output += c;
				} break;
				case '[': {
					if(!inString) arrayLayerCount++;
					output += c;
				} break;
				case ']': {
					if(!inString) {
						arrayLayerCount--;
						if (arrayLayerCount < 0) {
							return { error: "Unbalanced array", code: null };
						}
					}
					output += c;
				} break;
				case '(': {
					if(!inString) parenLayerCount++;
					output += c;
				} break;
				case ')': {
					if(!inString) {
						parenLayerCount--;
						if (parenLayerCount < 0) {
							return { error: "Unbalanced parenthesies", code: null };
						}
					}
					output += c;
				} break;
				default: output += c; break;
			}
		}
		if (arrayLayerCount > 0) {
			return { error: "Unbalanced array", code: null };
		} else if (parenLayerCount > 0) {
			return { error: "Unbalanced parenthesies", code: null };
		}  else return { error: null, code: output };
	}
}
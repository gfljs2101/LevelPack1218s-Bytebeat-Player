import { binaryOperators, functionArity, isOperand, numberToken, resolveFunction, tokenize, unexpectedToken, validateExpression } from './postfix-tokens.mjs';

function pop(stack, token) {
	if(stack.length === 0) {
		throw new SyntaxError(`postfix: missing operand for ${ token }`);
	}
	return stack.pop();
}

export function postfixToInfix(code) {
	const stack = [];
	const tokens = tokenize(code);
	for(const token of tokens) {
		const normalizedToken = token.toLowerCase();
		const functionName = resolveFunction(token);
		if(isOperand(token) &&
			!binaryOperators.has(token) && !functionName &&
			!['drop', 'dup', 'swap', 'pick', 'put', 'random', '~'].includes(normalizedToken)) {
			stack.push(token);
			continue;
		}
		if(binaryOperators.has(token)) {
			const right = pop(stack, token);
			const left = pop(stack, token);
			stack.push(`(${ left }${ binaryOperators.get(token) }${ right })`);
			continue;
		}
		if(token === '~') {
			stack.push(`(~${ pop(stack, token) })`);
			continue;
		}
		if(functionName) {
			const arity = functionArity(functionName);
			const args = [];
			while(args.length < arity) {
				args.unshift(pop(stack, token));
			}
			stack.push(`${ functionName }(${ args.join(',') })`);
			continue;
		}
		if(normalizedToken === 'random') {
			stack.push('random()');
			continue;
		}
		if(normalizedToken === 'dup') {
			stack.push(stack[stack.length - 1]);
			continue;
		}
		if(normalizedToken === 'drop') {
			pop(stack, token);
			continue;
		}
		if(normalizedToken === 'pick') {
			const index = pop(stack, token);
			if(!numberToken.test(index)) {
				throw new SyntaxError(`postfix: dynamic pick is not supported for ${ index }`);
			}
			const offset = Math.floor(Number(index));
			stack.push(offset >= 0 && offset < stack.length ? stack[stack.length - 1 - offset] : '0');
			continue;
		}
		if(normalizedToken === 'put') {
			const index = pop(stack, token);
			if(!numberToken.test(index)) {
				throw new SyntaxError(`postfix: dynamic put is not supported for ${ index }`);
			}
			const offset = Math.floor(Number(index));
			if(offset >= 0 && offset < stack.length) {
				stack[stack.length - 1 - offset] = stack[stack.length - 1];
			}
			continue;
		}
		if(normalizedToken === 'swap') {
			const right = pop(stack, token);
			const left = pop(stack, token);
			stack.push(right, left);
			continue;
		}
		validateExpression(token, 'postfix');
		stack.push(token);
	}
	if(stack.length !== 1) {
		throw new SyntaxError(`postfix: expected one result, got ${ stack.length }`);
	}
	return stack[0];
}

// Prefix notation uses the same operator vocabulary as postfix notation.
export function prefixToPostfix(code) {
	const tokens = tokenize(code, 'prefix');
	const stack = [];
	for(const token of tokens.reverse()) {
		const lower = token.toLowerCase();
		const functionName = resolveFunction(token);
		const arity = binaryOperators.has(token) ? 2 : token === '~' ? 1 :
			functionName ? functionArity(functionName) : 0;
		if(arity) {
			if(stack.length < arity) throw new SyntaxError(`prefix: missing operand for ${token}`);
			const args = [];
			for(let i = 0; i < arity; i++) args.push(stack.pop());
			stack.push(`${args.join(' ')} ${token}`);
		} else {
			if(['dup', 'drop', 'swap', 'pick', 'put'].includes(lower)) {
				throw unexpectedToken('prefix', token);
			}
			if(!isOperand(token)) validateExpression(token, 'prefix');
			stack.push(token);
		}
	}
	if(!stack.length) return '0';
	if(stack.length !== 1) throw new SyntaxError('prefix: expected one expression');
	return stack[0];
}

const ByteBeatCompiler = {
	removeCommentsAndLineBreaks(x) {
		return x.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g, '').replace(/[\r\n]+/g, ' ');
	}
};

export const glitchToPostfix = (function() {
	const glitchToPostfixConversion = {
		'a': 't',
		'b': 'put',
		'c': 'drop',

		'd': '*',
		'e': '/',
		'f': '+',
		'g': '-',
		'h': '%',

		'j': '<<',
		'k': '>>',
		'l': '&',
		'm': '|',
		'n': '^',
		'o': '~',

		'p': 'dup',
		'q': 'pick',
		'r': 'swap',

		's': '<',
		't': '>',
		'u': '=',
		'/': '//',

		'!': '\n',
		'.': ' ',
	};

	const isCapitalHex = function(c) {
		return ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F'));
	};

	return function(x) {
		// Convert to postfix
		const postfix = [];

		x = x.replace('glitch://', ''); // remove "glitch:"
		x = ByteBeatCompiler.removeCommentsAndLineBreaks(x);
		x = x.replace('glitch:', ''); // remove "glitch:"
		x = x.replace(/^[^!]*!/, ''); // remove label

		for (let i = 0; i < x.length; ++i) {
			let done = false;
			let imd = '';

			// NOTE: works by magic when number is at end. While gathering
			// imd if we're at the end of the string 'c' will be undefined
			// which will fail isCapitalHex and so the last imd will be put in
			// correctly.
			let c;
			while (!done) {
				c = x[i];
				if (isCapitalHex(c)) {
					imd = imd + c;
					++i;
				} else {
					done = true;
					if (imd.length) {
						--i;
						c = '0x' + imd;
					}
				}
			}
			postfix.push(glitchToPostfixConversion[c] || c);
		}
		return postfix.join(' ');
	};
}());

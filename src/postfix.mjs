export function notationToPostfix(code, format, { integerOutput = false } = {}) {
	if(format === 'postfix') return code;
	throw new SyntaxError(`Unknown stack expression format: ${format}`);
}

export const binaryOperators = new Map([
	['>', '>'],
	['<', '<'],
	['=', '=='],
	['==', '=='],
	['!=', '!='],
	['>=', '>='],
	['<=', '<='],
	['===', '==='],
	['!==', '!=='],
	['+', '+'],
	['-', '-'],
	['*', '*'],
	['/', '/'],
	['%', '%'],
	['**', '**'],
	['>>', '>>'],
	['>>>', '>>>'],
	['<<', '<<'],
	['&', '&'],
	['|', '|'],
	['^', '^'],
	['&&', '&&'],
	['||', '||']
]);

const unaryOperators = new Set([
	'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'cbrt', 'ceil', 'cos', 'cosh',
	'exp', 'expm1', 'floor', 'fround', 'log', 'log10', 'log1p', 'log2', 'round', 'sign', 'sin',
	'sinh', 'sqrt', 'tan', 'tanh', 'trunc', 'int', 'sinf', 'cosf', 'tanf', 'SAWT', 'SQU', 'TRI',
	'hxdcml', 'tri', 'squr', 'sie', 'smis', 'arth', 'arthtri', 'tanBR', 'tanMD', 'tanBS', 's3n1',
	'tmdsn', 'tbrsn', 'FSD', 'TUNNEL', 'patternTwelve', 'unfold', 'not', 'unsin', 'tv',
	'cot', 'A', 'C', 'D', 'E', 'G'
]);

const customArity = new Map([
	['min', 2], ['max', 2], ['pow', 2], ['atan2', 2], ['imul', 2], ['hypot', 2],
	['clz32', 1],
	['bitC', 3], ['br', 2], ['regG', 2], ['crpt', 3], ['decrpt', 3], ['dvd', 2],
	['tri', 1], ['squr', 1], ['sie', 1], ['smis', 1], ['arth', 1], ['arthtri', 1],
	['tanbr', 1], ['tanmd', 1], ['tanbs', 1], ['s3n1', 1], ['tmdsn', 1], ['tbrsn', 1],
	['fsd', 1], ['tunnel', 1], ['patterntwelve', 1], ['List', 2],
	['and', 2], ['or', 2], ['nand', 2], ['nor', 2], ['xor', 2], ['xnor', 2], ['charval', 2]
]);

const numberToken = /^(?:0x[\da-f]+|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i;
const identifierToken = /^[A-Za-z_$][\w$]*$/;
const reservedWords = new Set(('break case catch class const continue debugger default delete do else ' +
	'export extends finally for function if import in instanceof let new return super switch this throw ' +
	'try typeof var void while with yield await enum implements interface package private protected public static')
	.split(' '));
const isOperand = token => numberToken.test(token) || identifierToken.test(token) && !reservedWords.has(token);
const unexpectedToken = (format, token) => new SyntaxError(
	`${format}: unexpected token ${JSON.stringify(token)}. Use space-separated ${format} notation ` +
	`(for example, ${format === 'prefix' ? '& t >> t 8' : 't t 8 >> &'}). ` +
	'Choose infix for JavaScript formulas.');

// Resolve aliases to the actual binding, preserving distinct names such as TRI/tri.
const functionNames = new Map([...unaryOperators, ...customArity.keys()].map(name => [name, name]));
const foldedFunctions = new Map([...functionNames.keys()].map(name => [name.toLowerCase(), name]));
// These spellings are the bindings exposed by the audio processor.
for(const name of ['tanBR', 'tanMD', 'tanBS', 'FSD', 'TUNNEL', 'patternTwelve']) {
	foldedFunctions.set(name.toLowerCase(), name);
	functionNames.set(name.toLowerCase(), name);
}
export const resolveFunction = token => functionNames.get(token) || foldedFunctions.get(token.toLowerCase());
export const functionArity = token => customArity.get(token) || customArity.get(token.toLowerCase()) || 1;
const validateExpression = (token, format) => {
	try {
		// Legacy postfix songs may use a JavaScript expression as one operand.
		// Parse it in isolation so malformed tokens cannot break generated calls.
		new Function(`return (\n${token}\n);`);
	} catch {
		throw unexpectedToken(format, token);
	}
};
export const tokenize = (code, format = 'postfix') => {
	const input = String(code);
	const tokens = [], brackets = [];
	let token = '', quote = '';
	const flush = () => { if(token) tokens.push(token); token = ''; };
	for(let i = 0; i < input.length; i++) {
		const char = input[i], next = input[i + 1];
		if(quote) {
			token += char;
			if(char === '\\' && next !== undefined) token += input[++i];
			else if(char === quote) quote = '';
			continue;
		}
		if(char === '/' && (next === '/' || next === '*')) {
			if(next === '/') {
				while(i + 1 < input.length && !/[\r\n]/.test(input[i + 1])) i++;
			} else {
				const end = input.indexOf('*/', i + 2);
				if(end === -1) throw unexpectedToken(format, 'unclosed comment');
				i = end + 1;
			}
			if(brackets.length) token += ' '; else flush();
			continue;
		}
		if(char === '"' || char === "'" || char === '`') quote = char;
		else if('([{'.includes(char)) brackets.push(char);
		else if(')]}'.includes(char)) {
			if(brackets.pop() !== '([{'[')]}'.indexOf(char)]) throw unexpectedToken(format, char);
		}
		if(/\s/.test(char) && !brackets.length && !quote) flush();
		else token += char;
	}
	if(quote || brackets.length) throw unexpectedToken(format, `unclosed ${quote || brackets.at(-1)}`);
	flush();
	return tokens;
};
const wrapIndex = (index, size) => {
	const integer = Math.floor(Number(index));
	return Number.isFinite(integer) ? ((integer % size) + size) % size : 0;
};

export function createPostfixStack(size = 256) {
	let pointer = 0;
	const values = new Array(size).fill(0);
	return {
		pop() {
			pointer = pointer === 0 ? size - 1 : pointer - 1;
			return values[pointer];
		},
		push(value) {
			values[pointer++] = value;
			pointer %= size;
		},
		pick(index) {
			let i = pointer - Math.floor(index) - 1;
      		while (i < 0) {
        		i += size;
    		}
    		return values[i % size];
		},
		put(index, value) {
			let i = pointer - Math.floor(index);
      		while (i < 0) {
        		i += size;
    		}
    		return values[i % size] = value;
		},
		reset() {
			pointer = 0;
			values.fill(0);
		}
	};
}

export function postfixToFunction(code) {
	const steps = [];
	const tokens = tokenize(code);
	const push = value => steps.push(`postfixStack.push(${ value });`);
	for(const token of tokens) {
		const normalizedToken = token.toLowerCase();
		const functionName = resolveFunction(token);
		if(isOperand(token) &&
			!binaryOperators.has(token) && !functionName &&
			!['drop', 'dup', 'swap', 'pick', 'put', 'random', '~'].includes(normalizedToken)) {
			push(token);
			continue;
		}
		if(normalizedToken === '>' || normalizedToken === '<' || normalizedToken === '=') {
			steps.push('var postfixRight = postfixStack.pop();');
			steps.push('var postfixLeft = postfixStack.pop();');
			const comparison = normalizedToken === '>' ? 'postfixRight < postfixLeft' :
				normalizedToken === '<' ? 'postfixRight > postfixLeft' :
				'postfixLeft == postfixRight';
			steps.push(`postfixStack.push((${ comparison }) ? 0xFFFFFFFF : 0);`);
			continue;
		}
		if(binaryOperators.has(token)) {
			steps.push('var postfixRight = postfixStack.pop();');
			steps.push('var postfixLeft = postfixStack.pop();');
			steps.push(`postfixStack.push((postfixLeft ${ binaryOperators.get(token) } postfixRight) | 0);`);
			continue;
		}
		if(normalizedToken === '~') {
			steps.push('postfixStack.push(~postfixStack.pop());');
			continue;
		}
		if(functionName) {
			const arity = functionArity(functionName);
			const args = [];
			while(args.length < arity) {
				const argument = `postfixArg${arity - args.length - 1}`;
				steps.push(`var ${argument} = postfixStack.pop();`);
				args.unshift(argument);
			}
			push(`${ functionName }(${ args.join(',') })`);
			continue;
		}
		if(normalizedToken === 'random') {
			push('random()');
			continue;
		}
		if(normalizedToken === 'dup') {
			push('postfixStack.pick(0)');
			continue;
		}
		if(normalizedToken === 'drop') {
			steps.push('postfixStack.pop();');
			continue;
		}
		if(normalizedToken === 'pick') {
			steps.push('var postfixIndex = postfixStack.pop();');
			push('postfixStack.pick(postfixIndex)');
			continue;
		}
		if(normalizedToken === 'put') {
			steps.push('var postfixIndex = postfixStack.pop();');
			steps.push('var postfixValue = postfixStack.pick(0);');
			steps.push('postfixStack.put(postfixIndex, postfixValue);');
			continue;
		}
		if(normalizedToken === 'swap') {
			steps.push('var postfixRight = postfixStack.pop();');
			steps.push('var postfixLeft = postfixStack.pop();');
			push('postfixRight');
			push('postfixLeft');
			continue;
		}
		validateExpression(token, 'postfix');
		push(token);
	}
	if(!tokens.length) return 'return 0;';
	steps.push('return postfixStack.pop();');
	return steps.join('\n');
}

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

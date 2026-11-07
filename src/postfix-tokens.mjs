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

export const numberToken = /^(?:0x[\da-f]+|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i;
const identifierToken = /^[A-Za-z_$][\w$]*$/;
const reservedWords = new Set(('break case catch class const continue debugger default delete do else ' +
	'export extends finally for function if import in instanceof let new return super switch this throw ' +
	'try typeof var void while with yield await enum implements interface package private protected public static')
	.split(' '));
export const isOperand = token => numberToken.test(token) || identifierToken.test(token) && !reservedWords.has(token);
export const unexpectedToken = (format, token) => new SyntaxError(
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

export const validateExpression = (token, format) => {
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
			if(brackets.pop() !== '([{ '['])]}'.indexOf(char)]) throw unexpectedToken(format, char);
		}
		if(/\s/.test(char) && !brackets.length && !quote) flush();
		else token += char;
	}
	if(quote || brackets.length) throw unexpectedToken(format, `unclosed ${quote || brackets.at(-1)}`);
	flush();
	return tokens;
};

import { createPostfixStack } from './postfix-stack.mjs';
import { postfixToFunction } from './postfix-compiler.mjs';
import { postfixToInfix, prefixToPostfix, glitchToPostfix } from './postfix-converters.mjs';

export function notationToPostfix(code, format, { integerOutput = false } = {}) {
	if(format === 'postfix') return code;
	if(format === 'glitch') return glitchToPostfix(code);
	throw new SyntaxError(`Unknown stack expression format: ${format}`);
}

export { createPostfixStack, postfixToFunction, postfixToInfix, prefixToPostfix, glitchToPostfix };
export { binaryOperators, functionArity, resolveFunction, tokenize } from './postfix-tokens.mjs';
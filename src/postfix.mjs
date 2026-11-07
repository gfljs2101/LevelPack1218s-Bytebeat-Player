import { createPostfixStack } from './postfix-stack.mjs';
import { postfixToFunction } from './postfix-compiler.mjs';
import { postfixToInfix, prefixToPostfix } from './postfix-converters.mjs';

export function notationToPostfix(code, format, { integerOutput = false } = {}) {
	if(format === 'postfix') return code;
	throw new SyntaxError(`Unknown stack expression format: ${format}`);
}

export { createPostfixStack, postfixToFunction, postfixToInfix, prefixToPostfix };
export { binaryOperators, functionArity, resolveFunction, tokenize } from './postfix-tokens.mjs';

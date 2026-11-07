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

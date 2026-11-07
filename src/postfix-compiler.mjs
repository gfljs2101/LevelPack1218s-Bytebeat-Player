import { binaryOperators, functionArity, isOperand, resolveFunction, tokenize, validateExpression } from './postfix-tokens.mjs';

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
			push(`postfixStack.push(${ functionName }(${ args.join(',') }))`);
			continue;
		}
		if(normalizedToken === 'random') {
			push('postfixStack.push(random())');
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
			push('postfixStack.push(postfixRight)');
			push('postfixStack.push(postfixLeft)');
			continue;
		}
		validateExpression(token, 'postfix');
		push(token);
	}
	if(!tokens.length) return 'return 0;';
	steps.push('return postfixStack.pop();');
	return steps.join('\n');
}

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

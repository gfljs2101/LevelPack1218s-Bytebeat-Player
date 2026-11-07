import { deflateRaw, inflateRaw } from 'pako';

export function getCodeFromUrl(hash) {
	let songData;
	if(hash.startsWith('#4')) {
		const dataArr = Uint8Array.from(atob(hash.substring(2)), el => el.charCodeAt());
		try {
			songData = {
				mode: ['Bytebeat', 'Signed Bytebeat', 'Floatbeat', 'Funcbeat', 'RAW', 'Signed RAW', 'FloatRAW'][dataArr[0] & 0x7F],
				sampleRate: new DataView(dataArr.buffer).getFloat32(1, 1),
				notation: (dataArr[5] === 1 || (dataArr[0] & 128) !== 0) ? 'postfix' : 'infix',
				code: inflateRaw(new Uint8Array(dataArr.buffer, 8), { to: 'string' })
			};
		} catch(err) {
			console.error(`Couldn't load data from url: ${ err }`);
		}
	} else if(hash.startsWith('#v3b64') || hash.startsWith('#bytebeat2-') || hash.startsWith('#GFLJBeat2-') || hash.startsWith('#GFLJBeat3-') || hash.startsWith('#LevelPack-') || hash.startsWith('#EnBeat2-')) {
		try {
			songData = inflateRaw(
				Uint8Array.from(hash.startsWith('#LevelPack-') ? atob(hash.slice(11)) : hash.startsWith('#GFLJBeat3-') ? atob(hash.slice(11)) : hash.startsWith('#GFLJBeat2-') ? atob(hash.slice(11)) : hash.startsWith('#EnBeat2-') ? atob(hash.slice(9)) : atob(hash.slice(6)), el => el.charCodeAt()), { to: 'string' });
			if(songData.startsWith('{')) {
				songData = JSON.parse(songData);
				if(songData.formula) { // XXX: old format
					songData.code = songData.formula;
				}
				songData.notation = songData.notation || 'infix';
			} else { // XXX: old format
				songData = { code: songData, notation: 'infix' };
			}
		} catch(err) {
			console.error(`Couldn't load data from url: ${ err }`);
		}
	} else {
		console.error('Couldn\'t load data from url: unrecognized url data');
	}
	return songData;
}

export function getUrlFromCode(code, mode, sampleRate, notation = 'infix') {
	const codeArr = deflateRaw(code);
	// Byte 0 is mode, bytes 1-4 is sampleRate (Float32), byte 5 is notation mode (0=infix, 1=postfix), bytes 6-7 reserved, byte 8+ is code
	const outputArr = new Uint8Array(8 + codeArr.length);
	outputArr[0] = ['Bytebeat', 'Signed Bytebeat', 'Floatbeat', 'Funcbeat', 'RAW', 'Signed RAW', 'FloatRAW'].indexOf(mode);
	outputArr.set(new Uint8Array(new Float32Array([sampleRate]).buffer), 1);
	outputArr[5] = notation === 'postfix' ? 1 : 0;
	outputArr.set(codeArr, 8);
	// since we're dealing with Uint8Array I should use the non-map method I think - Chasyxx
	let str = "";
	for(let i = 0; i < outputArr.length; i++) {
		str += String.fromCharCode(outputArr[i]);
	}
	window.location.hash = '4' + btoa(str).replaceAll('=', '');
}
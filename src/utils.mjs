export function formatBytes(bytes, mode=0) {
	if(bytes < 1000) {
		return bytes + 'B';
	}
	// i fear the day we get a 1 Terabyte code. - Chasyxx, creator of the EnBeat_NEW fork
	const power1000i = parseInt(Math.floor(Math.log(bytes) / Math.log(1000)), 10);
	const power1000s = (power1000i ? (bytes / (1000 ** power1000i)).toFixed(2) : bytes) + ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'][power1000i];
	const power1024i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
	const power1024s = (power1024i ? (bytes / (1024 ** power1024i)).toFixed(2) : bytes) + ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'][power1024i]
	return mode?`${power1024s}/${[power1000s]}`:`${power1024s} (${[power1000s]})`
}

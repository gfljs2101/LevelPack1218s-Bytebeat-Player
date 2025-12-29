export function formatBytes(bytes, mode=0) {
	if(bytes < 1000) {
		return bytes + 'B';
	}
	// i fear the day we get a 1 Terabyte code. - Chasyxx, creator of the EnBeat_NEW fork
	const power1000i = parseInt(Math.floor(Math.log(bytes) / Math.log(1000)), 10);
	const power1000s = (power1000i ? (bytes / (1000 ** power1000i)).toFixed(2) : bytes) + ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'][power1000i];
	const power1024i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
	const power1024s = (power1024i ? (bytes / (1024 ** power1024i)).toFixed(2) : bytes) + ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'][power1024i]
	return [`${power1024s} (${[power1000s]})`,`${power1024s}/${[power1000s]} (${bytes}c)`,`${power1024s}/${[power1000s]}`][mode]
}

export function formatDate(input) {
	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	function getOrdinal(day) {
		if (day % 100 >= 11 && day % 100 <= 13) return day + 'th';
		switch (day % 10) {
			case 1:
				return day + 'st';
			case 2:
				return day + 'nd';
			case 3:
				return day + 'rd';
			default:
				return day + 'th';
		}
	}

	if (/^\d+-\d{2}-\d{2}$/.test(input)) {
		const date_ = new Date(input);
		return `${monthNames[date_.getMonth()]} ${getOrdinal(date_.getDate())}, ${date_.getFullYear()}`;
	}
	if (/^\d+-\d{2}$/.test(input)) {
		const [year, month] = input.split('-');
		return `${monthNames[Number(month) - 1]} ${year}`;
	}
	if (/^[A-Za-z]+ \d+$/.test(input)) {
		return input;
	}
	if (/^\d+$/.test(input)) {
		return input;
	}

	return 'Invalid date format';
}
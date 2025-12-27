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
import { formatBytes } from './utils.mjs';

export class FavoriteGenerator {
	static buildFavoriteEntry(i, favorite, length, deleteCallback, overwriteCallback, renameCallback) {
		const li = document.createElement('li');
		li.innerHTML = `
<div> <!-- li_infoGroup -->
	<span class="control-label favorite-name"> <!-- ig_nameSpan -->
		Name
	</span>
	<span class="control-label favorite-info"> <!-- ig_infoSpan -->
		ModeHz @ Size
	</span>
	<span class="control-label favorite-date"> <!-- ig_infoSpan -->
		No Date
	</span>
</div>

<span class="favorite-text favorite-code"> <!-- li_codeSpan -->
	NULL
</span>

<div class="controls"> <!-- li_controls -->
	<div class="controls-group"> <!-- c_controlGroup0 -->
		<button class="control-button control-text-button favorite-controls-delete">Delete</button>
		<button class="control-button control-text-button favorite-controls-overwrite">Overwrite</button>
		<button class="control-button control-text-button favorite-controls-rename">Rename</button>
	</div>
	<div class="controls-group"> <!-- c_controlGroup1 -->
		<button class="control-button control-text-button favorite-controls-up" disabled>Up</button>
		<button class="control-button control-text-button favorite-controls-down" disabled>Down</button>
	</div>
</div>
`;
		li.querySelector('.favorite-name').textContent = favorite.name;
		const ig_infoSpan = li.querySelector('.favorite-info');
		if(typeof favorite.info === 'string') {
			ig_infoSpan.textContent = favorite.info;
		} else {
			ig_infoSpan.textContent =
				`${ favorite.info.mode }${ favorite.info.samplerate }Hz`+
				` @ ${ formatBytes(favorite.info.size) }`;
		}
		if (favorite.dateAdded) {
		    ig_infoSpan.textContent += ` | Added: ${favorite.dateAdded}`; // show YYYY-MM-DD
		} else {
		    ig_infoSpan.textContent += ' | Added: No date';
		}

		const li_codeSpan = li.querySelector('.favorite-code');
		li_codeSpan.addEventListener('click', () => {
			window.location.hash = favorite.url;
			bytebeat.parseUrl();
			bytebeat.resetTime();
			bytebeat.updateUrl();
			bytebeat.playbackToggle(true);
			bytebeat.setSplashtext();
		});
		li_codeSpan.innerText =
			favorite.url.length > 2000
				? favorite.url.slice(0, 1997) + '...'
				: favorite.url;

		li.querySelector('.favorite-controls-delete').addEventListener('click', deleteCallback);

		li.querySelector('.favorite-controls-overwrite').addEventListener('click', overwriteCallback);

		li.querySelector('.favorite-controls-rename').addEventListener('click', renameCallback);

		const cg1_upButton = li.querySelector('.favorite-controls-up');
		if(i > 0) {
			cg1_upButton.disabled = false;
			cg1_upButton.addEventListener('click', () => {
				try {
					const favorites = JSON.parse(localStorage.favorites ?? '[]');
					const upper = favorites[i - 1];
					const lower = favorites[i];
					favorites[i - 1] = lower;
					favorites[i] = upper;
					localStorage.favorites = JSON.stringify(favorites);
				} catch(e) {
					bytebeat.favoriteErrorBox(e);
				} finally {
					bytebeat.loadFavoriteList();
				}
			});
		}

		const cg1_downButton = li.querySelector('.favorite-controls-down');
		if(i < length - 1) {
			cg1_downButton.disabled = false;
			cg1_downButton.addEventListener('click', () => {
				try {
					const favorites = JSON.parse(localStorage.favorites ?? '[]');
					const upper = favorites[i];
					const lower = favorites[i + 1];
					favorites[i] = lower;
					favorites[i + 1] = upper;
					localStorage.favorites = JSON.stringify(favorites);
				} catch(e) {
					bytebeat.favoriteErrorBox(e);
				} finally {
					bytebeat.loadFavoriteList();
				}
			});
		}

		return li;
	}
}

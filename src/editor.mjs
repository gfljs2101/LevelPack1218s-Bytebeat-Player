import { closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentLess, insertNewline, redo } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, foldGutter, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { highlightActiveLine, highlightSpecialChars, EditorView, keymap, lineNumbers }
	from '@codemirror/view';
import { tagHighlighter, tags } from '@lezer/highlight';

const editorView = initValue => new EditorView({
	parent: document.getElementById('editor-container'),
	state: EditorState.create({
		doc: initValue,
		extensions: [
			bracketMatching(),
			closeBrackets(),
			EditorState.tabSize.of('3'),
			EditorView.lineWrapping,
			EditorView.updateListener.of(view => {
				if(view.docChanged) {
					globalThis.bytebeat.sendData({ setFunction: view.state.doc.toString() });
				}
			}),
			foldGutter(),
			highlightActiveLine(),
			highlightSelectionMatches(),
			highlightSpecialChars(),
			history(),
			indentUnit.of('\t'),
			javascript(),
			keymap.of([
				{ key: 'Ctrl-Y', run: redo },
				{ key: 'Enter', run: insertNewline },
				{
					key: 'Tab',
					run: view => view.dispatch(view.state.replaceSelection('\t')) || true,
					shift: indentLess
				},
				...historyKeymap,
				...searchKeymap,
				...defaultKeymap
			]),
			lineNumbers(),
			syntaxHighlighting(tagHighlighter([
				{ tag: tags.bool, class: 'tok-bool' },
				{ tag: tags.comment, class: 'tok-comment' },
				{ tag: tags.definition(tags.variableName), class: 'tok-definition' },
				{ tag: tags.function(tags.variableName), class: 'tok-function' },
				{ tag: tags.function(tags.propertyName), class: 'tok-function' },
				{ tag: tags.keyword, class: 'tok-keyword' },
				{ tag: tags.number, class: 'tok-number' },
				{ tag: tags.operator, class: 'tok-operator' },
				{ tag: tags.propertyName, class: 'tok-property' },
				{ tag: tags.punctuation, class: 'tok-punctuation' },
				{ tag: tags.regexp, class: 'tok-string2' },
				{ tag: tags.special(tags.string), class: 'tok-string2' },
				{ tag: tags.string, class: 'tok-string' },
				{ tag: tags.variableName, class: 'tok-variable' }
			]))
		]
	})
});

export class Editor {
	constructor() {
		this.container = null;
		this.defaultValue = 't/=4,k=x=>127*sin(800*cbrt(t%x)*PI/128)/2+127,s=[t*((t&4096?t%65536<59392?6:t&7:16)+(1&t>>14))>>(3&-t>>(t&2048?4:10))|t>>(t&16384?t&8192?4:2:3),k(4096)|k(2048),t&4096?random()*128|t>>4:127],3*(s[0]%256+s[1]%256+s[2]%256)/1275-1.2';
		this.errorElem = null;
		this.view = null;
	}
	get value() {
		return this.view ? this.view.state.doc.toString() : this.defaultValue;
	}
	init() {
		document.getElementById('editor-default').remove();
		this.container = document.getElementById('editor-container');
		this.errorElem = document.getElementById('error');
		this.view = editorView(this.defaultValue);
	}
	setValue(code) {
		if(!this.view) {
			return;
		}
		this.view.dispatch({
			changes: {
				from: 0,
				to: this.view.state.doc.toString().length,
				insert: code
			}
		});
	}
}

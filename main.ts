import { Plugin, TFile } from 'obsidian';
import initSqlJs from 'sql.js';


interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	private SQL: any;

	async onload() {
		console.log("INFO: loading plugin", this)
		await this.loadSettings();

		this.SQL = await initSqlJs({
			locateFile: (file: string) => `https://sql.js.org/dist/${file}`
		});

		this.registerMarkdownCodeBlockProcessor('sqlite-view', (source, el, _) => {
			this.processSqliteView(source, el)
		});

		console.log("INFO: plugin loaded", this)
	}

	onunload() {
		console.log("INFO: unloaded plugin", this)
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async processSqliteView(source: string, el: HTMLElement) {
		try {
			const contents = parseContents(source)

			const file = this.app.vault.getFileByPath(contents.f)

			if (!file) {
				el.createEl('div', { text: `Error: Database file "${contents.f}" not found` });
				return;
			}

			const db = await this.connect(file)
			const { cols, rows } = await this.executeQuery(contents.q, db)

			this.renderTable(el, cols, rows)
		} catch (error) {
			el.createEl('div', { text: `Error: ${error.message}` });
		}
	}

	private async connect(path: TFile) {
		console.log("INFO: connecting to db, file: ", path)
		const dbBin = await this.app.vault.readBinary(path)

		const db = new this.SQL.Database(new Uint8Array(dbBin));
		if (!db) {
			throw new Error(`Failed to load database from ${path.path}`);
		}

		console.log(`INFO: loaded db at ${path.path} into memory`)
		return db
	}

	private async executeQuery(query: string, db: any) {
		const res = db.exec(query)

		if (!res || res.length === 0) {
			throw new Error("Query returned no results");
		}

		const cols = res[0].columns
		const rows = res[0].values

		return { cols, rows }
	}
	private renderTable(el: HTMLElement, cols: any, rows: any) {
		const table = el.createEl('table');
		const head = table.createEl('thead');
		const body = table.createEl('tbody');

		const htr = head.createEl('tr')
		for (let i = 0; i < cols.length; i++) {
			htr.createEl('th', { text: cols[i] })
		}

		for (let i = 0; i < rows.length; i++) {
			const row = body.createEl('tr');
			for (let j = 0; j < cols.length; j++) {
				row.createEl('td', { text: String(rows[i][j] || '') });
			}
		}
	}
}

function parseContents(source: string) {
	const lines = source.split('\n').filter(line => line.trim().length > 0);
	
	if (lines.length < 2) {
		throw new Error("Invalid format. Expected: file_path\\nquery");
	}

	let [f, q] = lines;
	f = f.trim();
	q = q.trim();

	if (f.length === 0) {
		throw new Error("Invalid format. File path is empty");
	}

	if (!f.endsWith(".db") && !f.endsWith(".sqlite") && !f.endsWith(".sqlite3")) {
		throw new Error("Invalid format. File path must end with .db, .sqlite, or .sqlite3");
	}

	if (q.length === 0) {
		throw new Error("Invalid format. Query is empty");
	}

	if (f.startsWith("./")) f = f.substring(2);
	if (!q.endsWith(";")) q = q + ';';

	return { f, q };
}

import { Plugin, TFile, addIcon, setIcon, setTooltip } from 'obsidian';
import initSqlJs, { SqlJsStatic, Database, QueryExecResult } from 'sql.js';

interface Settings {
	mySetting: string;
}

const DEFAULT_SETTINGS: Settings = {
	mySetting: 'default'
}

type SourceQuery = {
	file: string;
	query: string;
}

export default class SimpleSqlitePlugin extends Plugin {
	settings: Settings;
	private SQL: SqlJsStatic; 
	private dbCache: Map<string, { db: Database, lastModified: number }> 
	private queryCache: Map<string, { results: QueryExecResult, dbLastModified: number }> 

	async onload() {
		info("loading plugin", this)
		await this.loadSettings();

		this.SQL = await initSqlJs({
			locateFile: (file: string) => `https://sql.js.org/dist/${file}`
		});

		this.dbCache = new Map<string, { db: Database, lastModified: number }>();
		this.queryCache = new Map<string, { results: QueryExecResult, dbLastModified: number }>();

		this.registerMarkdownCodeBlockProcessor('sqlite-view', (source, el, _) => {
			this.processSqliteView(source, el)
		});

		info("plugin loaded", this)
	}

	onunload() {
		info("unloaded plugin", this)
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async processSqliteView(source: string, el: HTMLElement) {
		debug("processing sqlite view")
		debug("db cache at process view: ", this.dbCache)
		try {
			const sq = parseContents(source)
			const file = this.app.vault.getFileByPath(sq.file)
			if (!file) {
				el.createEl('div', { text: `Error: Database file "${sq.file}" not found` });
				return;
			}

			let queryResults = this.getCachedQueryResults(file, sq.query)

			if (!queryResults) {
				debug("no cached query results")
				const db = await this.loadDb(file)
				queryResults = await this.executeQuery(sq.query, db)
				this.cacheQuery(file, sq.query, queryResults)
			}

			this.renderTable(el, queryResults)
		} catch (error) {
			el.createEl('div', { text: `Error: ${error.message}` });
		}
	}

	private exportAndSave(db: Database, file: TFile) {
		info("exporting and saving db...")
		const buf = db.export()

		this.app.vault.modifyBinary(file, buf)
		info("db saved")
	}

	private getCachedQueryResults(file: TFile, query: string): QueryExecResult | undefined {
		let queryResults: QueryExecResult | undefined

		const normalizedQuery = normalizeQuery(query)
		const key = `${file.name}|${normalizedQuery}`

		debug("query cache key is: ", key)

		if (this.queryCache.has(key)) {
			const cached = this.queryCache.get(key)

			debug("cached query version: ", cached)

			if (!cached?.results) {
				throw new Error("ERROR: query results not found in cache")
			}

			debug("file mtime is: ", file.stat.mtime)
			if (!file.stat.mtime || !cached.dbLastModified
				|| file.stat.mtime != cached.dbLastModified) {
				throw new Error("ERROR: file modification time not found or doesn't match")
			}

			queryResults = cached.results
			debug("found query results in cache: ", queryResults)
		}

		return queryResults
	}

	private cacheQuery(file: TFile, query: string, queryResults: QueryExecResult) {
		const normalizedQuery = normalizeQuery(query)
		const key = `${file.name}|${normalizedQuery}`

		if (!file.stat.mtime) {
			throw new Error("ERROR: can not cache query; file mtime not found")
		}

		this.queryCache.set(key, { results: queryResults, dbLastModified: file.stat.mtime })
		info("results cached successfully")
		debug("cached results are: ", queryResults, "for key: ", key)
	}

	private cacheDb(file: TFile, db: Database) {
		if (!file.stat.mtime) {
			throw new Error("ERROR: can not cache db; file mtime not found")
		}
		this.dbCache.set(file.path, { db: db, lastModified: file.stat.mtime })
		info("db cached successfully")
	}

	private async loadDb(file: TFile): Promise<Database> {
		let db: Database | undefined

		if (this.dbCache.has(file.path)) {
			debug("key found in db cache")

			const cached = this.dbCache.get(file.path)

			if (cached?.lastModified && cached.lastModified == file.stat.mtime) {
				debug("file hasn't changed since caching, using db cache")
				if (!cached?.db) {
					throw new Error("ERROR: database not found in cache")
				}

				db = cached.db
				info("db loaded from cache")
			}
		}

		if (!db) {
			db = await this.connect(file)
			this.cacheDb(file, db)
			info("db loaded from file")
		}

		debug("db cache after load db: ", this.dbCache)
		return db
	}

	private async connect(file: TFile): Promise<Database> {
		debug("connecting to db, at: ", file)
		const buf = await this.app.vault.readBinary(file)

		const db = new this.SQL.Database(new Uint8Array(buf));
		if (!db) {
			throw new Error(`ERROR: failed to load database from ${file.path}`);
		}

		info(`loaded db at ${file.path} into memory`)
		return db
	}

	private async executeQuery(query: string, db: Database): Promise<QueryExecResult> {
		const res = db.exec(query)

		if (!res || res.length === 0) {
			throw new Error("ERROR: query returned no results");
		}

		return res[0]
	}

	private renderTable(el: HTMLElement, results: QueryExecResult) {
		const { columns: cols, values: rows } = results
		const tableWidget = el.createDiv({ cls: "cm-table-widget" })
		const wrapper = tableWidget.createDiv({ cls: "table-wrapper" })
		const table = wrapper.createEl('table', { cls: "table-editor" });
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

		wrapper.createDiv("table-row-btn", function(addRowBtn) {
			setIcon(addRowBtn, "lucide-plus");
			setTooltip(addRowBtn, "Add row after")

			addRowBtn.addEventListener("pointerdown", function(e) {
				return e.preventDefault();
			});

			addRowBtn.addEventListener("click", function() {
				console.log("inserting row")
				// todo: table.insertRow
			});
		});

		wrapper.createDiv("table-col-btn", function(addColBtn) {
			setIcon(addColBtn, "lucide-plus");
			setTooltip(addColBtn, "Add column after")

			addColBtn.addEventListener("pointerdown", function(e) {
				return e.preventDefault();
			});

			addColBtn.addEventListener("click", function() {
				console.log("inserting col")
				// todo: table.insertCol
			});
		});
	}
}

function parseContents(source: string): SourceQuery {
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

	return { file: f, query: q };
}

function normalizeQuery(query: string): string {
	return query
		.replace(/\s+/g, '')
		.trim()
		.toLowerCase();
}

function debug(...args: any) {
	console.log("DEBUG: ", ...args)
}

function info(...args: any) {
	console.log("INFO: ", ...args)
}

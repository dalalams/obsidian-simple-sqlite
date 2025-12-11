import { App, TFile } from "obsidian";
import { Database } from "sql.js";
import { Cache, DbFileCacheEntry, TableDataCacheEntry } from './cache';
import DatabaseManager from "./db/connection";
import { debug, info } from "./logging";
import Parser, { ParsedConfig } from "./parser";
import Renderer, { TableView } from "./renderer";
import SchemaProvider from "./schema_provider";
import Table, { TableData } from "./table";

type ViewState = {
	table: Table;
	view: TableView;
	dbPath: string;
	query: string;
}

export default class Engine {
	constructor(private app: App,
		private parser: Parser,
		private renderer: Renderer,
		private dbCache: Cache<DbFileCacheEntry>,
		private tableCache: Cache<TableDataCacheEntry>,
		private schemaProvider: SchemaProvider,
		private dbManager: DatabaseManager) {
	}

	async processSqliteView(source: string, el: HTMLElement) {
		debug("processing sqlite view")
		try {
			const parsingSpec = this.schemaProvider.getParsingSpec();
			const parsedCfg = this.parser.parse(source, parsingSpec)
			const file = this.app.vault.getFileByPath(parsedCfg.dbPath)
			if (!file) {
				el.createEl('div', { text: `Error: Database file "${parsedCfg.dbPath}" not found` });
				return;
			}

			const table = await this.processQuery(file, parsedCfg)

			const view = this.renderer.render(el, table.data, {
				onCellBlur: (rowIdx, colIdx, value) => {
					// todo
				},
				onSave: () => {
					// todo
				},
				onAddRow: () => {
					debug("row added");
					// todo
				},
				onAddCol: (name) => {
					debug("column added:", name);
					// todo
				},
			});

		} catch (error) {
			el.createEl('div', { text: `Error: ${error.message}` });
		}
	}

	private async processQuery(file: TFile, cfg: ParsedConfig): Promise<Table> {
		const tableData = this.getCachedTableData(file, cfg.query)
		if (tableData) {
			return Table.fromTableData(tableData)
		}

		debug("no cached table data")

		let db = this.getCachedDbFile(file)

		if (!db) {
			debug("connecting to db, at: ", file)
			const buf = await this.app.vault.readBinary(file)
			db = await this.dbManager.connect(file.path, buf);

			this.cacheDb(file, db)
			info("db loaded from file")
		}

		const schema = await this.schemaProvider.getSchema(cfg);
		const execResults = await this.dbManager.exec(file.path, cfg.query)

		const table = Table.fromExecResults(execResults.columns, execResults.values, schema)

		this.cacheTableData(file, cfg.query, table.data)

		return table
	}


	private getCachedTableData(file: TFile, query: string): TableData | undefined {
		let tableData: TableData | undefined

		const normalizedQuery = normalizeQuery(query)
		const key = `${file.name}|${normalizedQuery}`

		const cached = this.tableCache.get(key, file.stat.mtime)
		if (cached) {
			if (!cached?.data) {
				throw new Error("ERROR: table data not found in cache")
			}

			tableData = cached.data
			debug("found table data in cache: ", tableData)
		}

		return tableData
	}

	private getCachedDbFile(file: TFile): Database | undefined {
		const cached = this.dbCache.get(file.path, file.stat.mtime)
		if (!cached) {
			debug("db file not found in cache")
			return undefined
		}

		debug("key found in db cache")
		if (!cached?.db) {
			throw new Error("ERROR: database not found in cache")
		}

		info("db loaded from cache")

		return cached?.db
	}

	private cacheTableData(file: TFile, query: string, tableData: TableData) {
		const normalizedQuery = normalizeQuery(query)
		const key = `${file.name}|${normalizedQuery}`

		if (!file.stat.mtime) {
			throw new Error("ERROR: can not cache query; file mtime not found")
		}

		const entry = new TableDataCacheEntry(tableData, file.stat.mtime)
		this.tableCache.set(key, entry)
		info("table data cached successfully")
	}

	private cacheDb(file: TFile, db: Database) {
		if (!file.stat.mtime) {
			throw new Error("ERROR: can not cache db; file mtime not found")
		}

		const entry = new DbFileCacheEntry(db, file.stat.mtime)
		this.dbCache.set(file.path, entry)
		info("db cached successfully")
	}
}

function normalizeQuery(query: string): string {
	return query
		.replace(/\s+/g, '')
		.trim()
		.toLowerCase();
}


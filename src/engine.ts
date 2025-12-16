import { App, TFile } from "obsidian";
import { Database } from "sql.js";
import { Cache, DbFileCacheEntry, TableDataCacheEntry } from './cache/cache';
import DatabaseManager from "./db/connection";
import { debug, info } from "./logging";
import Parser, { ParsedConfig } from "./core/parser";
import Renderer, { TableView } from "./ui/renderer";
import SchemaProvider from "./db/schema_provider";
import Table, { TableData } from "./core/table";

export default class Engine {
	private showErrorsOnEdit = false;  // todo: make this a setting

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
					this.handleCellBlur(table, view, rowIdx, colIdx, value);
				},
				onSave: () => {
					this.handleSave(table, view, parsedCfg.dbPath, parsedCfg.query);
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
		const tableData = this.getCachedTableData(file.path, file.stat.mtime, cfg.query)
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

		this.cacheTableData(file.path, file.stat.mtime, cfg.query, table.data)

		return table
	}

	// view controller
	private handleCellBlur(
		table: Table,
		view: TableView,
		rowIdx: number,
		colIdx: number,
		value: string
	) {
		table.setCellValue(rowIdx, colIdx, value);

		const cellState = table.getCellState(rowIdx, colIdx);
		view.updateCellState(rowIdx, colIdx, {
			isModified: cellState.isModified,
			error: this.showErrorsOnEdit ? cellState.error : null,
		});

		debug("cell state updated")
	}

	private async handleSave(
		table: Table,
		view: TableView,
		dbPath: string,
		query: string
	) {
		if (table.hasErrors()) {
			debug("table has errors")
			view.showErrors(table.getErrors());
			view.showMessage("ERROR: Cannot save; fix validation errors first", "error");
			return;
		}

		try {
			// const mutations = table.mutations;
			// todo:
			// - map mutations to db operations
			// - apply operations to database
			// - export and vault write


			table.apply();

			const normalizedQuery = normalizeQuery(query);
			const tableKey = `${dbPath}|${normalizedQuery}`;

			this.tableCache.invalidate(tableKey);
			this.dbCache.invalidate(dbPath);

			view.clearErrors();
			view.clearModified();
			view.showMessage("Saved successfully", "success");

			info("changes saved");
		} catch (error) {
			view.showMessage(`ERROR: Save failed; ${error.message}`, "error");
		}
	}

	// cache 
	private getCachedTableData(filePath: string, mtime: number, query: string): TableData | undefined {
		let tableData: TableData | undefined

		const normalizedQuery = normalizeQuery(query)
		const key = `${filePath}|${normalizedQuery}`

		const cached = this.tableCache.get(key, mtime)
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

	private cacheTableData(filePath: string, mtime: number, query: string, tableData: TableData) {
		const normalizedQuery = normalizeQuery(query)
		const key = `${filePath}|${normalizedQuery}`

		if (!mtime) {
			throw new Error("ERROR: can not cache query; file mtime not found")
		}

		const entry = new TableDataCacheEntry(tableData, mtime)
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


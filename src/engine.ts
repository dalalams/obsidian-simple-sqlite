import { App, TFile } from "obsidian";
import { Database, QueryExecResult } from "sql.js";
import { Cache, DbFileCacheEntry, QueryResultCacheEntry } from './cache';
import DatabaseManager from "./db/connection";
import { debug, info } from "./logging";
import Parser, { ParsedConfig } from "./parser";
import Renderer, { TableView } from "./renderer";
import SchemaProvider from "./schema_provider";
import Table from "./table";

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
		private queryCache: Cache<QueryResultCacheEntry>,
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

			const view = this.renderer.render(el, table.getData(), {
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
		let queryResults = this.getCachedQueryResults(file, cfg.query)
		if (queryResults) {
			// todo: temporary; will cache table instead and schema will be available
			return Table.fromExecResults(queryResults.columns, queryResults.values, null)
		}

		debug("no cached query results")

		let db = this.getCachedDbFile(file)

		if (!db) {
			debug("connecting to db, at: ", file)
			const buf = await this.app.vault.readBinary(file)
			db = await this.dbManager.connect(file.path, buf);

			this.cacheDb(file, db)
			info("db loaded from file")
		}

		const schema = await this.schemaProvider.getSchema(cfg);
		queryResults = await this.dbManager.exec(file.path, cfg.query)

		const table = Table.fromExecResults(queryResults.columns, queryResults.values, schema)

		this.cacheQuery(file, cfg.query, queryResults)

		return table
	}


	private getCachedQueryResults(file: TFile, query: string): QueryExecResult | undefined {
		let queryResults: QueryExecResult | undefined

		const normalizedQuery = normalizeQuery(query)
		const key = `${file.name}|${normalizedQuery}`

		const cached = this.queryCache.get(key, file.stat.mtime)
		if (cached) {
			if (!cached?.results) {
				throw new Error("ERROR: query results not found in cache")
			}

			queryResults = cached.results
			debug("found query results in cache: ", queryResults)
		}

		return queryResults
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

	private cacheQuery(file: TFile, query: string, queryResults: QueryExecResult) {
		const normalizedQuery = normalizeQuery(query)
		const key = `${file.name}|${normalizedQuery}`

		if (!file.stat.mtime) {
			throw new Error("ERROR: can not cache query; file mtime not found")
		}

		const entry = new QueryResultCacheEntry(queryResults, file.stat.mtime)
		this.queryCache.set(key, entry)
		info("query results cached successfully")
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


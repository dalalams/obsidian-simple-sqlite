import { App, TFile } from "obsidian";
import { Database, QueryExecResult } from "sql.js";
import { Cache, DbFileCacheEntry, QueryResultCacheEntry } from './cache';
import DatabaseManager from "./db/manager";
import { debug, info } from "./logging";
import Parser from "./parser";
import Renderer from "./renderer";

export default class Engine {
	private app: App;
	private parser: Parser;
	private renderer: Renderer;
	private dbManager: DatabaseManager;

	private dbCache: Cache<DbFileCacheEntry>;
	private queryCache: Cache<QueryResultCacheEntry>;

	constructor(app: App,
		parser: Parser,
		renderer: Renderer,
		dbCache: Cache<DbFileCacheEntry>,
		queryCache: Cache<QueryResultCacheEntry>,
		dbManager: DatabaseManager) {
		this.parser = parser;
		this.renderer = renderer;
		this.dbManager = dbManager;

		this.dbCache = dbCache;
		this.queryCache = queryCache;

		this.app = app;
	}

	async processSqliteView(source: string, el: HTMLElement) {
		debug("processing sqlite view")
		try {
			const sq = this.parser.parse(source)
			const file = this.app.vault.getFileByPath(sq.dbPath)
			if (!file) {
				el.createEl('div', { text: `Error: Database file "${sq.dbPath}" not found` });
				return;
			}

			const queryResults = await this.processQuery(file, sq.query)

			this.renderer.render(el, queryResults)

		} catch (error) {
			el.createEl('div', { text: `Error: ${error.message}` });
		}
	}

	private async processQuery(file: TFile, query: string): Promise<QueryExecResult> {
		let queryResults = this.getCachedQueryResults(file, query)
		if (queryResults) {
			return queryResults
		}

		debug("no cached query results")

		let db = this.getCachedDbFile(file)

		if (!db) {
			debug("connecting to db, at: ", file)
			const buf = await this.app.vault.readBinary(file)
			db = await this.dbManager.connect(buf);

			this.cacheDb(file, db)
			info("db loaded from file")
		}

		queryResults = await this.dbManager.exec(db, query)

		this.cacheQuery(file, query, queryResults)

		return queryResults
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


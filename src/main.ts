import { Plugin } from 'obsidian';
import DatabaseManager, { DbConfig } from './db/manager';
import Engine from './engine';
import { CodeBlockParser } from './parser';
import { HTMLTableRenderer } from './renderer';
import { Cache, DbFileCacheEntry, QueryResultCacheEntry } from './cache';
import { info } from './logging';

// type Result<T, E> = { ok: true, value: T } | { ok: false, error: E }

interface Settings {
	mySetting: string;
}

const DEFAULT_SETTINGS: Settings = {
	mySetting: 'default'
}

export default class SimpleSqlitePlugin extends Plugin {
	settings: Settings;
	private engine: Engine;

	async onload() {
		info("loading plugin", this)
		await this.loadSettings();

		const parser = new CodeBlockParser();
		const renderer = new HTMLTableRenderer();
		const dbManager = await DatabaseManager.create(new DbConfig());

		const dbCache: Cache<DbFileCacheEntry> = new Cache();
		const queryCache: Cache<QueryResultCacheEntry> = new Cache();

		this.engine = new Engine(this.app, parser, renderer, dbCache, queryCache, dbManager);

		this.registerMarkdownCodeBlockProcessor('sqlite-view', (source, el, _) => {
			this.engine.processSqliteView(source, el)
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

}


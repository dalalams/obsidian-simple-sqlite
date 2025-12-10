import { Plugin } from 'obsidian';
import DatabaseManager, { DbConfig } from './db/connection';
import Engine from './engine';
import { CodeBlockParser } from './parser';
import { HTMLTableRenderer } from './renderer';
import { Cache, DbFileCacheEntry, TableDataCacheEntry } from './cache';
import { info } from './logging';
import { SimpleTableSchemaProvider } from './schema_provider';

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
		const schemaProvider = new SimpleTableSchemaProvider(dbManager)

		const dbCache: Cache<DbFileCacheEntry> = new Cache();
		const tableCache: Cache<TableDataCacheEntry> = new Cache();

		this.engine = new Engine(this.app, parser, renderer, dbCache, tableCache, schemaProvider, dbManager);

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


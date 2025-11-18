import { Database, QueryExecResult } from "sql.js";

export interface CacheEntry {
	isValid(compValue?: any): boolean
}

export class DbFileCacheEntry implements CacheEntry {
	constructor(public db: Database, public lastModified: number) { }

	isValid(compValue?: any): boolean {
		if (!this.lastModified || !compValue
			|| this.lastModified != compValue) {
			return false;
		}
		return true;
	}
}

export class QueryResultCacheEntry implements CacheEntry {
	constructor(
		public results: QueryExecResult,
		public dbLastModified: number
	) { }

	isValid(compValue?: any): boolean {
		if (!compValue || !this.dbLastModified
			|| compValue != this.dbLastModified) {
			return false
		}
		return true
	}
}

export class Cache<T extends CacheEntry> {
	private cache: Map<string, T>;
	private maxSize: number;
	// todo: config

	constructor() {
		this.cache = new Map<string, T>();
		this.maxSize = 5;
	}

	set(key: string, val: T) {
		if (this.maxSize == this.cache.size) {
			return
		}
		this.cache.set(key, val)
	}

	get(key: string, compValue?: any): T | undefined {
		const entry = this.cache.get(key);
		if (entry && !entry.isValid(compValue)) {
			throw new Error(`ERROR: cached version is not valid`)
		}
		return entry
	}
}

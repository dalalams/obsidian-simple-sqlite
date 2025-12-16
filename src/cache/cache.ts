import { Database } from "sql.js";
import { TableData } from "../core/table";

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

export class TableDataCacheEntry implements CacheEntry {
  constructor(
    public data: TableData,
    public dbLastModified: number
  ) {}
  
  isValid(compValue?: number): boolean {
    return !!compValue && compValue === this.dbLastModified
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
		if (!entry) return undefined;

		if (!entry.isValid(compValue)) {
			this.cache.delete(key);
			return undefined
		}

		return entry
	}

	invalidate(key: string) {
		this.cache.delete(key);
	}
}

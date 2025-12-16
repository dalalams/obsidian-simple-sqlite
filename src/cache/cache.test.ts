import { Cache, CacheEntry, DbFileCacheEntry, TableDataCacheEntry } from './cache';
import { TableData } from '../core/table';

class MockCacheEntry implements CacheEntry {
	constructor(public value: string, private validFor: number) {}

	isValid(compValue?: number): boolean {
		return compValue === this.validFor;
	}
}

describe('Cache', () => {
	let cache: Cache<MockCacheEntry>;

	beforeEach(() => {
		cache = new Cache<MockCacheEntry>();
	});

	describe('set and get', () => {
		it('should store and retrieve an entry', () => {
			const entry = new MockCacheEntry('data', 100);
			cache.set('key1', entry);

			const result = cache.get('key1', 100);
			expect(result).toBe(entry);
			expect(result?.value).toBe('data');
		});

		it('should return undefined for non-existent key', () => {
			const result = cache.get('non-existent', 100);
			expect(result).toBeUndefined();
		});

		it('should return undefined and delete entry when invalid', () => {
			const entry = new MockCacheEntry('data', 100);
			cache.set('key1', entry);

			// compValue doesn't match validFor
			const result = cache.get('key1', 999);
			expect(result).toBeUndefined();

			// entry should be deleted
			const secondResult = cache.get('key1', 100);
			expect(secondResult).toBeUndefined();
		});

		it('should not exceed max size', () => {
			for (let i = 0; i < 10; i++) {
				cache.set(`key${i}`, new MockCacheEntry(`data${i}`, i));
			}

			// default maxSize is 5, so keys 5-9 should not be stored
			expect(cache.get('key0', 0)).toBeDefined();
			expect(cache.get('key4', 4)).toBeDefined();
			expect(cache.get('key5', 5)).toBeUndefined();
		});
	});

	describe('invalidate', () => {
		it('should delete an entry', () => {
			const entry = new MockCacheEntry('data', 100);
			cache.set('key1', entry);

			cache.invalidate('key1');

			const result = cache.get('key1', 100);
			expect(result).toBeUndefined();
		});

		it('should not throw when invalidating non-existent key', () => {
			expect(() => cache.invalidate('non-existent')).not.toThrow();
		});
	});
});

describe('DbFileCacheEntry', () => {
	it('should be valid when mtime matches', () => {
		const mockDb = {} as any;
		const entry = new DbFileCacheEntry(mockDb, 1000);

		expect(entry.isValid(1000)).toBe(true);
	});

	it('should be invalid when mtime differs', () => {
		const mockDb = {} as any;
		const entry = new DbFileCacheEntry(mockDb, 1000);

		expect(entry.isValid(2000)).toBe(false);
	});

	it('should be invalid when compValue is undefined', () => {
		const mockDb = {} as any;
		const entry = new DbFileCacheEntry(mockDb, 1000);

		expect(entry.isValid(undefined)).toBe(false);
	});
});

describe('TableDataCacheEntry', () => {
	const mockTableData: TableData = {
		columns: ['id', 'name'],
		values: [[1, 'Alice']],
		schema: [],
	};

	it('should be valid when dbLastModified matches', () => {
		const entry = new TableDataCacheEntry(mockTableData, 1000);

		expect(entry.isValid(1000)).toBe(true);
	});

	it('should be invalid when dbLastModified differs', () => {
		const entry = new TableDataCacheEntry(mockTableData, 1000);

		expect(entry.isValid(2000)).toBe(false);
	});

	it('should be invalid when compValue is undefined', () => {
		const entry = new TableDataCacheEntry(mockTableData, 1000);

		expect(entry.isValid(undefined)).toBe(false);
	});
});

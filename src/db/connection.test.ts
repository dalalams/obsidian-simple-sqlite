
import DatabaseManager, { DbConfig } from './connection';
import * as fs from 'fs';
import * as path from 'path';

describe('DatabaseManager', () => {
	let dbManager: DatabaseManager;
	const dbName = 'test.db';
	const wasmPath = path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');

	beforeAll(async () => {
		const dbCfg: DbConfig = {
			WasmLocation: wasmPath,
		};
		dbManager = await DatabaseManager.create(dbCfg);
	});

	it('should connect to a database and execute a query', async () => {
		const dbPath = path.join(__dirname, dbName);
		const dbBuffer = fs.readFileSync(dbPath);

		await dbManager.connect(dbName, dbBuffer);
		const result = await dbManager.exec(dbName, 'SELECT 1');

		expect(result.values[0][0]).toBe(1);
	});

	it('should return the same database connection for the same name', async () => {
		const dbPath = path.join(__dirname, dbName);
		const dbBuffer = fs.readFileSync(dbPath);

		const db1 = await dbManager.connect(dbName, dbBuffer);
		const db2 = await dbManager.connect(dbName, dbBuffer);

		expect(db1).toBe(db2);
	});

	it('should throw an error if the database is not found', async () => {
		await expect(dbManager.exec('not-found.db', 'SELECT 1')).rejects.toThrow();
	});

	describe('run', () => {
		const testDbName = 'run-test.db';

		beforeEach(async () => {
			// Create a fresh in-memory database for run tests
			const dbPath = path.join(__dirname, dbName);
			const dbBuffer = fs.readFileSync(dbPath);
			await dbManager.connect(testDbName, dbBuffer);

			// Create a test table
			await dbManager.run(testDbName, 'CREATE TABLE IF NOT EXISTS test_run (id INTEGER PRIMARY KEY, value TEXT)', []);
		});

		it('should execute INSERT statement', async () => {
			await dbManager.run(testDbName, 'INSERT INTO test_run (id, value) VALUES (?, ?)', [1, 'hello']);

			const result = await dbManager.exec(testDbName, 'SELECT * FROM test_run WHERE id = 1');
			expect(result.values[0]).toEqual([1, 'hello']);
		});

		it('should execute UPDATE statement', async () => {
			await dbManager.run(testDbName, 'INSERT INTO test_run (id, value) VALUES (?, ?)', [2, 'original']);
			await dbManager.run(testDbName, 'UPDATE test_run SET value = ? WHERE id = ?', ['updated', 2]);

			const result = await dbManager.exec(testDbName, 'SELECT * FROM test_run WHERE id = 2');
			expect(result.values[0]).toEqual([2, 'updated']);
		});

		it('should execute DELETE statement', async () => {
			await dbManager.run(testDbName, 'INSERT INTO test_run (id, value) VALUES (?, ?)', [3, 'to-delete']);
			await dbManager.run(testDbName, 'DELETE FROM test_run WHERE id = ?', [3]);

			await expect(dbManager.exec(testDbName, 'SELECT * FROM test_run WHERE id = 3'))
				.rejects.toThrow('query returned no results');
		});

		it('should throw for non-existent database', async () => {
			await expect(dbManager.run('non-existent.db', 'INSERT INTO x VALUES (1)', []))
				.rejects.toThrow('database "non-existent.db" not found');
		});
	});

	describe('export', () => {
		const exportTestDb = 'export-test.db';

		beforeEach(async () => {
			const dbPath = path.join(__dirname, dbName);
			const dbBuffer = fs.readFileSync(dbPath);
			await dbManager.connect(exportTestDb, dbBuffer);
		});

		it('should export database as Uint8Array', () => {
			const exported = dbManager.export(exportTestDb);

			expect(exported).toBeInstanceOf(Uint8Array);
			expect(exported.length).toBeGreaterThan(0);
		});

		it('should export database with modifications', async () => {
			await dbManager.run(exportTestDb, 'CREATE TABLE IF NOT EXISTS export_test (id INTEGER)', []);
			await dbManager.run(exportTestDb, 'INSERT INTO export_test (id) VALUES (?)', [42]);

			const exported = dbManager.export(exportTestDb);

			// Verify by loading the exported data into a new connection
			const reloadedDbName = 'reloaded-export.db';
			await dbManager.connect(reloadedDbName, exported.buffer);
			const result = await dbManager.exec(reloadedDbName, 'SELECT * FROM export_test');

			expect(result.values[0][0]).toBe(42);
		});

		it('should throw for non-existent database', () => {
			expect(() => dbManager.export('non-existent.db'))
				.toThrow('database "non-existent.db" not found');
		});
	});
});

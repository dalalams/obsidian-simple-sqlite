
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
});

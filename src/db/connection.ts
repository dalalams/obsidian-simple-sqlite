import initSqlJs, { SqlJsStatic, Database, QueryExecResult } from 'sql.js';

export class DbConfig {
	public readonly WasmLocation: string;
}

class DatabaseManager {
	private static instance: DatabaseManager | null = null;

	private readonly dbCfg: DbConfig;
	private sql?: SqlJsStatic;
	private _connPool: Map<string, Database>;

	private constructor(dbCfg: DbConfig) {
		this.dbCfg = dbCfg
		this._connPool = new Map();
	}

	static async create(dbCfg: DbConfig): Promise<DatabaseManager> {
		if (!DatabaseManager.instance) {
			const manager = new DatabaseManager(dbCfg);
			await manager.init();
			DatabaseManager.instance = manager;
		}
		return DatabaseManager.instance
	}


	private async init() {
		this.sql = await initSqlJs({
			locateFile: (file: string) => this.dbCfg.WasmLocation ?? `https://sql.js.org/dist/${file}`
		});
	}


	async connect(name: string, buf: ArrayBuffer): Promise<Database> {
		if (!this.sql) {
			throw new Error(`ERROR: sql.js uninitialized`);
		}

		if (this._connPool.has(name)) {
			return this._connPool.get(name)!;
		}

		const db = new this.sql.Database(new Uint8Array(buf));
		if (!db) {
			throw new Error(`ERROR: failed to load database from buffer`);
		}

		this._connPool.set(name, db);
		return db
	}

	async exec(dbName: string, query: string): Promise<QueryExecResult> {
		const db = this._connPool.get(dbName);
		if (!db) {
			throw new Error(`ERROR: database "${dbName}" not found`);
		}

		const res = db.exec(query)

		if (!res || res.length === 0) {
			throw new Error("ERROR: query returned no results");
		}

		return res[0]
	}

	async run(dbName: string, sql: string, params: any[]): Promise<void> {
		const db = this._connPool.get(dbName);
		if (!db) {
			throw new Error(`ERROR: database "${dbName}" not found`);
		}

		db.run(sql, params);
	}

	export(dbName: string): Uint8Array {
		const db = this._connPool.get(dbName);
		if (!db) {
			throw new Error(`ERROR: database "${dbName}" not found`);
		}

		return db.export();
	}
}

export default DatabaseManager

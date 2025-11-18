import initSqlJs, { SqlJsStatic, Database, QueryExecResult } from 'sql.js';

export class DbConfig {
	public readonly WasmLocation: string;
}

class DatabaseManager {
	private static instance: DatabaseManager | null = null;

	private readonly dbCfg: DbConfig;
	private sql?: SqlJsStatic;
	private _connPool: Database[]; 

	private constructor(dbCfg: DbConfig) {
		this.dbCfg = dbCfg
	}

	static async create(dbCfg: DbConfig): Promise<DatabaseManager> {
		if (!DatabaseManager.instance) {
			const manager = new DatabaseManager(dbCfg);
			await manager.init();
			return manager;
		}
		return DatabaseManager.instance
	}


	private async init() {
		this.sql = await initSqlJs({
			locateFile: (file: string) => this.dbCfg.WasmLocation ?? `https://sql.js.org/dist/${file}`
		});
	}


	async connect(buf: ArrayBuffer): Promise<Database> {
		if (!this.sql) {
			throw new Error(`ERROR: sql.js uninitialized`);
		}

		const db = new this.sql.Database(new Uint8Array(buf));
		if (!db) {
			throw new Error(`ERROR: failed to load database from buffer`);
		}

		return db
	}

	async exec(db: Database, query: string): Promise<QueryExecResult> {
		const res = db.exec(query)

		if (!res || res.length === 0) {
			throw new Error("ERROR: query returned no results");
		}

		return res[0]
	}
}

export default DatabaseManager

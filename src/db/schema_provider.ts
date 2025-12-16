import { ParsedConfig, ParsingSpec } from "../core/parser"
import DatabaseManager from "./connection"
import { QueryExecResult } from "sql.js"

export type ColumnSchema = {
	readonly name: string,
	readonly type: string,
	readonly tableName?: string,
	readonly notNull: boolean,
	readonly isPrimaryKey: boolean,
}

export default interface SchemaProvider {
	getParsingSpec(): ParsingSpec
	getSchema(config: ParsedConfig): Promise<ReadonlyArray<ColumnSchema>>
}

export class SimpleTableSchemaProvider implements SchemaProvider {
	constructor(private dbManager: DatabaseManager) { }

	getParsingSpec(): ParsingSpec {
		return { needsNTableNames: 1, needsCustomSchema: false }
	}



	async getSchema(config: ParsedConfig): Promise<ReadonlyArray<ColumnSchema>> {
		const tableName = config.tableNames[0]

		const infoQuery = `PRAGMA table_info(${tableName})`
		const schemaResult = await this.dbManager.exec(config.dbPath, infoQuery)

		return this.parseSchemaFromPragma(schemaResult, tableName)
	}

	private parseSchemaFromPragma(pragmaResult: QueryExecResult, tableName: string): ReadonlyArray<ColumnSchema> {
		// PRAGMA table info returns: [cid, name, type, notnull, dflt_value, pk]
		/* eslint-disable @typescript-eslint/no-non-null-assertion */
		return pragmaResult.values.map(row => ({
			name: row[1]!.toString(),
			type: row[2]!.toString(),
			tableName,
			notNull: row[3] === 1,
			isPrimaryKey: row[5] === 1,
		}))
	}
}



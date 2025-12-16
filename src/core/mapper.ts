
import { SqlValue } from "sql.js";
import { ColumnSchema } from "../db/schema_provider";
import { TableMutations } from "./table";

export type SqlStatement = {
	sql: string;
	params: SqlValue[];
}

export type MappingContext = {
	tableName: string;
	columns: string[];
	pkColumn: string;
}

export function mapMutations(mutations: TableMutations, schema: ReadonlyArray<ColumnSchema>): SqlStatement[] {
	return [
		...mapUpdates(mutations.updates, schema),
		...mapInserts(mutations.inserts, schema),
	];
}

export function mapUpdates(
	updates: TableMutations['updates'],
	schema: ReadonlyArray<ColumnSchema>,
): SqlStatement[] {
	const statements: SqlStatement[] = [];

	const pkByTable = new Map<string, ColumnSchema>();
	for (const col of schema) {
		if (col.isPrimaryKey && col.tableName) {
			pkByTable.set(col.tableName, col);
		}
	}

	updates.forEach((entry) => {
		const tableStmts = new Map<string, {
			setClauses: string[],
			params: SqlValue[],
			pkColumn: ColumnSchema
		}>();

		entry.colsUpdated.forEach((value, colIdx) => {
			const tableName = schema[colIdx].tableName;
			if (!tableName) {
				throw new Error(`ERROR: column at index ${colIdx} has no table name`);
			}

			if (!tableStmts.has(tableName)) {
				const pkColumn = pkByTable.get(tableName);
				if (!pkColumn) {
					throw new Error(`ERROR: no primary key found for table ${tableName}`);
				}
				tableStmts.set(tableName, { setClauses: [], params: [], pkColumn });
			}

			const stmt = tableStmts.get(tableName)!;
			stmt.setClauses.push(`${schema[colIdx].name} = ?`);
			stmt.params.push(value);
		});

		if (tableStmts.size > 1) {
			throw new Error('ERROR: multi-table updates not yet supported');
		}

		tableStmts.forEach((stmt, tableName) => {
			stmt.params.push(entry.rowId);
			statements.push({
				sql: `UPDATE ${tableName} SET ${stmt.setClauses.join(', ')} WHERE ${stmt.pkColumn.name} = ?`,
				params: stmt.params
			});
		});
	});

	return statements;
}

export function mapInserts(
  inserts: TableMutations['inserts'],
  schema: ReadonlyArray<ColumnSchema>,
): SqlStatement[] {
  const statements: SqlStatement[] = [];

  inserts.forEach((entry) => {
    const tableStmts = new Map<string, {
      columns: string[],
      params: SqlValue[],
    }>();

    entry.colsUpdated.forEach((value, colIdx) => {
      const tableName = schema[colIdx].tableName;
      if (!tableName) {
        throw new Error(`ERROR: column at index ${colIdx} has no table name`);
      }

      if (!tableStmts.has(tableName)) {
        tableStmts.set(tableName, { columns: [], params: [] });
      }

      const stmt = tableStmts.get(tableName)!;
      stmt.columns.push(schema[colIdx].name);
      stmt.params.push(value);
    });

    if (tableStmts.size > 1) {
      throw new Error('ERROR: multi-table inserts not yet supported');
    }

    tableStmts.forEach((stmt, tableName) => {
      const placeholders = stmt.params.map(() => '?').join(', ');
      statements.push({
        sql: `INSERT INTO ${tableName} (${stmt.columns.join(', ')}) VALUES (${placeholders})`,
        params: stmt.params
      });
    });
  });

  return statements;
}

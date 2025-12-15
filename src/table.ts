import { SqlValue } from "sql.js";
import { ColumnSchema } from "./schema_provider";

export type TableMutations = {
	updates: Map<number, { rowId: SqlValue, colsUpdated: Map<number, SqlValue> }>,
	inserts: Map<number, { colsUpdated: Map<number, SqlValue> }>,
	deletes: { rowIdx: number, rowId: SqlValue }[], // todo
	alters: SchemaAlterations, // todo
}

export type TableData = {
	columns: string[],
	values: SqlValue[][],
	schema: ReadonlyArray<ColumnSchema>,
}

export type CellError = {
	rowIdx: number
	colIdx: number
	colName: string
	message: string
	severity: 'error' | 'warning'
}

type SchemaAlterations = {
	colsRenamed: { old: string, new: string }[],
	colsAdded: string[],
	colsDeleted: string[],
}

type ParseResult = {
	valid: boolean;
	message: string;
	parsed: SqlValue;
	warning?: boolean;
}

export default class Table {
	private _data: TableData;
	private _mutations: TableMutations;
	private _cellErrors: Map<string, CellError>;

	private constructor(data: TableData) {
		this._data = {
			columns: structuredClone(data.columns),
			values: structuredClone(data.values),
			schema: data.schema
		};

		this._cellErrors = new Map();
		this._mutations = {
			updates: new Map(),
			inserts: new Map(),
			deletes: [],
			alters: { colsRenamed: [], colsAdded: [], colsDeleted: [] },
		}
	}

	static fromExecResults(cols: string[], values: SqlValue[][], schema: ReadonlyArray<ColumnSchema>): Table {
		const data = {
			columns: cols,
			values: values,
			schema: schema
		};
		return new Table(data)
	}

	static fromTableData(data: TableData): Table {
		return new Table(data)
	}

	get data(): TableData {
		return this._data
	}

	get mutations(): TableMutations {
		return this._mutations
	}

	getErrors(): CellError[] {
		return Array.from(this._cellErrors.values())
	}

	hasErrors(): boolean {
		return Array.from(this._cellErrors.values()).some(e => e.severity === 'error');
	}

	apply() {
		if (this.hasErrors()) {
			throw new Error('ERROR: cannot apply; table has validation errors');
		}

		const setRowVals = (row: SqlValue[], entry: { colsUpdated: Map<number, SqlValue> }) => {
			entry.colsUpdated.forEach((val, colIdx) => {
				row[colIdx] = val;
			});
		};

		this.mutations.updates.forEach((entry, rowIdx) => {
			const row = this._data.values[rowIdx];
			if (!row) throw new Error(`ERROR: row ${rowIdx} does not exist`);
			setRowVals(row, entry);
		})

		const sortedInserts = [...this._mutations.inserts.entries()]
			.sort(([a], [b]) => a - b);

		for (const [, entry] of sortedInserts) {
			const newRow: SqlValue[] = new Array(this._data.columns.length).fill(null);
			setRowVals(newRow, entry);

			const hasValues = newRow.some(v => v !== null && v !== '');
			if (!hasValues) continue;

			this._data.values.push(newRow);
		}

		this.reset()
	}

	private reset() {
		this._cellErrors = new Map()
		this._mutations = {
			updates: new Map(),
			inserts: new Map(),
			deletes: [],
			alters: { colsRenamed: [], colsAdded: [], colsDeleted: [] },
		}
	}

	getCellState(rowIdx: number, colIdx: number): { isModified: boolean, error: CellError | null } {
		const key = `${rowIdx}-${colIdx}`
		const isModified = this._mutations.updates.get(rowIdx)?.colsUpdated.has(colIdx)
			|| this._mutations.inserts.get(rowIdx)?.colsUpdated.has(colIdx)
			|| false
		const error = this._cellErrors.get(key) ?? null
		return { isModified, error }
	}

	setCellValue(rowIdx: number, colIdx: number, newVal: string) {
		const key = `${rowIdx}-${colIdx}`;
		const isOriginalRow = rowIdx < this._data.values.length;
		const schema = this._data.schema[colIdx];

		let sqlVal: SqlValue = newVal

		if (schema) {
			const result = this.parseValue(newVal, schema);
			if (!result.valid || result.warning) {
				this._cellErrors.set(key, {
					rowIdx, colIdx,
					colName: schema.name,
					message: result.message,
					severity: result.warning ? 'warning' : 'error'
				});
			} else {
				this._cellErrors.delete(key);
			}
			sqlVal = result.parsed
		}

		if (isOriginalRow) {
			this.trackUpdate(rowIdx, colIdx, sqlVal);
		} else {
			this.trackInsert(rowIdx, colIdx, sqlVal);
		}
	}

	private trackUpdate(rowIdx: number, colIdx: number, newVal: SqlValue) {
		const oldVal = this._data.values[rowIdx][colIdx];

		if (this.valuesEqual(oldVal, newVal)) {
			const entry = this._mutations.updates.get(rowIdx);
			if (entry) {
				entry.colsUpdated.delete(colIdx);
				if (entry.colsUpdated.size === 0) {
					this._mutations.updates.delete(rowIdx);
				}
			}
			return;
		}

		let entry = this._mutations.updates.get(rowIdx);
		if (!entry) {
			entry = { rowId: this.getRowId(rowIdx), colsUpdated: new Map() };
			this._mutations.updates.set(rowIdx, entry);
		}
		entry.colsUpdated.set(colIdx, newVal);
	}

	private trackInsert(rowIdx: number, colIdx: number, newVal: SqlValue) {
		let entry = this._mutations.inserts.get(rowIdx);
		if (!entry) {
			entry = { colsUpdated: new Map() };
			this._mutations.inserts.set(rowIdx, entry);
		}
		entry.colsUpdated.set(colIdx, newVal);

		const hasValues = [...entry.colsUpdated.values()].some(v => v !== null && v !== '');
		if (!hasValues) {
			this._mutations.inserts.delete(rowIdx);
		}
	}

	private parseValue(value: string | null, schema: ColumnSchema): ParseResult {
		if (value === null || value === '') {
			if (schema.notNull) {
				return { valid: false, message: `${schema.name} cannot be null`, parsed: null };
			}
			return { valid: true, message: '', parsed: null };
		}

		value = value.trim();
		const affinity = this.getAffinity(schema.type);

		switch (affinity) {
			case 'INTEGER': {
				if (/^-?\d+$/.test(value)) {
					return { valid: true, message: '', parsed: parseInt(value, 10) };
				}
				return { valid: true, message: `${schema.name} expects an integer`, parsed: value, warning: true };
			}

			case 'REAL': {
				const num = Number(value);
				if (!isNaN(num)) {
					return { valid: true, message: '', parsed: num };
				}
				return { valid: true, message: `${schema.name} expects a number`, parsed: value, warning: true };
			}

			case 'NUMERIC': {
				// tries number first, falls back to text - both valid
				const num = Number(value);
				if (!isNaN(num) && value !== '') {
					return { valid: true, message: '', parsed: num };
				}
				return { valid: true, message: '', parsed: value };
			}

			case 'TEXT':
			case 'BLOB':
			default:
				return { valid: true, message: '', parsed: value };
		}
	}

	private getAffinity(declaredType: string): 'INTEGER' | 'TEXT' | 'BLOB' | 'REAL' | 'NUMERIC' {
		const type = declaredType.toUpperCase();

		// affinity rules (https://www.sqlite.org/datatype3.html)
		if (type.includes('INT')) return 'INTEGER';
		if (type.includes('CHAR') || type.includes('CLOB') || type.includes('TEXT')) return 'TEXT';
		if (type === 'BLOB' || type === '') return 'BLOB';
		if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) return 'REAL';

		return 'NUMERIC';
	}

	private valuesEqual(a: SqlValue, b: SqlValue): boolean {
		if (a === b) return true;
		if (a === null && b === '') return true;
		if (a === '' && b === null) return true;
		return String(a) === String(b);
	}

	private getRowId(rowIdx: number): SqlValue {
		const pkColIdx = this._data.schema.findIndex(col => col.isPrimaryKey);
		if (pkColIdx === -1) {
			return null;
		}
		return this._data.values[rowIdx][pkColIdx];
	}
}


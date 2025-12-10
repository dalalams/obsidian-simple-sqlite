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
}

export default class Table {
	private _data: TableData;
	private mutations: TableMutations;
	private cellErrors: Map<string, CellError>;

	private constructor(data: TableData) {
		this._data = {
			columns: structuredClone(data.columns),
			values: structuredClone(data.values),
			schema: data.schema
		};

		this.cellErrors = new Map();
		this.mutations = {
			updates: new Map(),
			inserts: new Map(),
			deletes: [],
			alters: { colsRenamed: [], colsAdded: [], colsDeleted: [] },
		}
	}

	static fromExecResults(cols: string[], values: SqlValue[][], schema: ColumnSchema[]): Table {
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


	getErrors(): CellError[] {
		return Array.from(this.cellErrors.values())
	}

	hasErrors(): boolean {
		return this.cellErrors.size > 0
	}

	getData(): TableData {
		return this._data
	}

	getMutations() {
		return this.mutations
	}

	apply() {
		this.reset()
		throw new Error("todo")
	}

	private reset() {
		this.cellErrors = new Map()
		this.mutations = {
			updates: new Map(),
			inserts: new Map(),
			deletes: [],
			alters: { colsRenamed: [], colsAdded: [], colsDeleted: [] },
		}
	}

	setCellValue(rowIdx: number, colIdx: number, newVal: string) {
		const key = `${rowIdx}-${colIdx}`;
		const isOriginalRow = rowIdx < this._data.values.length;
		const schema = this._data.schema[colIdx];

		let sqlVal: SqlValue = newVal

		if (schema) {
			const result = this.parseValue(newVal, schema);
			if (!result.valid) {
				this.cellErrors.set(key, {
					rowIdx, colIdx,
					colName: schema.name,
					message: result.message,
					severity: 'error'
				});
			} else {
				this.cellErrors.delete(key);
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
			const entry = this.mutations.updates.get(rowIdx);
			if (entry) {
				entry.colsUpdated.delete(colIdx);
				if (entry.colsUpdated.size === 0) {
					this.mutations.updates.delete(rowIdx);
				}
			}
			return;
		}

		let entry = this.mutations.updates.get(rowIdx);
		if (!entry) {
			entry = { rowId: this.getRowId(rowIdx), colsUpdated: new Map() };
			this.mutations.updates.set(rowIdx, entry);
		}
		entry.colsUpdated.set(colIdx, newVal);
	}

	private trackInsert(rowIdx: number, colIdx: number, newVal: SqlValue) {
		let entry = this.mutations.inserts.get(rowIdx);
		if (!entry) {
			entry = { colsUpdated: new Map() };
			this.mutations.inserts.set(rowIdx, entry);
		}
		entry.colsUpdated.set(colIdx, newVal);
	}

	private parseValue(value: string | null, schema: ColumnSchema): ParseResult {
		if (value === null || value === '') {
			if (schema.notNull) {
				return { valid: false, message: `${schema.name} cannot be null`, parsed: null };
			}
			return { valid: true, message: '', parsed: null };
		}

		value = value.trim()
		const type = schema.type.toUpperCase();

		if (type === 'INTEGER') {
			if (!/^-?\d+$/.test(value)) {
				return { valid: false, message: `${schema.name} must be an integer`, parsed: value };
			}
			return { valid: true, message: '', parsed: parseInt(value, 10) };
		}

		if (type === 'REAL' || type === 'NUMERIC') {
			const num = Number(value);
			if (isNaN(num)) {
				return { valid: false, message: `${schema.name} must be a number`, parsed: value };
			}
			return { valid: true, message: '', parsed: num };
		}

		// TEXT & BLOB 
		return { valid: true, message: '', parsed: value };
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



import Table, { TableData } from './table';
import { ColumnSchema } from './schema_provider';

describe('Table', () => {
	let schema: ReadonlyArray<ColumnSchema>;
	beforeEach(() => {
		schema = [
			{ name: 'id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: "test" },
			{ name: 'name', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: "test" },
			{ name: 'value', type: 'REAL', isPrimaryKey: false, notNull: false, tableName: "test" },
		];
	})

	it('should create a table from execution results', () => {
		const cols = ['id', 'name'];
		const values = [[1, 'Alice'], [2, 'Bob']];
		const table = Table.fromExecResults(cols, values, schema);
		expect(table).toBeInstanceOf(Table);
	});

	it('should create a table from table data', () => {
		const tableData: TableData = {
			columns: ['id', 'name'],
			values: [[1, 'Alice'], [2, 'Bob']],
			schema: schema,
		};
		const table = Table.fromTableData(tableData);
		expect(table).toBeInstanceOf(Table);
	});

	it('should track updates when a cell value is changed', () => {
		const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
		table.setCellValue(0, 1, 'Alicia');
		const mutations = table.mutations;
		expect(mutations.updates.size).toBe(1);
		expect(mutations.updates.get(0)?.colsUpdated.get(1)).toBe('Alicia');
	});

	it('should track inserts when a new row is added', () => {
		const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
		table.setCellValue(1, 1, 'Bob');
		const mutations = table.mutations;
		expect(mutations.inserts.size).toBe(1);
		expect(mutations.inserts.get(1)?.colsUpdated.get(1)).toBe('Bob');
	});

	it('should report an error for invalid data type', () => {
		const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
		table.setCellValue(0, 0, 'not-an-integer');
		expect(table.hasErrors()).toBe(true);
		const errors = table.getErrors();
		expect(errors.length).toBe(1);
		expect(errors[0].message).toBe('id must be an integer');
	});

	it('should report an error for a null value in a not-null column', () => {
		const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
		table.setCellValue(0, 0, '');
		expect(table.hasErrors()).toBe(true);
		const errors = table.getErrors();
		expect(errors.length).toBe(1);
		expect(errors[0].message).toBe('id cannot be null');
	});


	describe('apply', () => {
		let schema: ReadonlyArray<ColumnSchema>;

		beforeEach(() => {
			schema = [
				{ name: 'id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: 'test' },
				{ name: 'name', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: 'test' },
				{ name: 'value', type: 'REAL', isPrimaryKey: false, notNull: false, tableName: 'test' },
			];
		});

		it('should apply updates to existing rows', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(0, 1, 'Alicia');

			table.apply();

			expect(table.data.values[0][1]).toBe('Alicia');
		});

		it('should apply multiple updates to same row', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(0, 1, 'Alicia');
			table.setCellValue(0, 2, '2.5');

			table.apply();

			expect(table.data.values[0][1]).toBe('Alicia');
			expect(table.data.values[0][2]).toBe(2.5);
		});

		it('should apply inserts as new rows', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(1, 1, 'Bob');

			table.apply();

			expect(table.data.values.length).toBe(2);
			expect(table.data.values[1][1]).toBe('Bob');
		});

		it('should apply inserts in rowIdx order regardless of edit order', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			// Edit row 3 first, then row 2
			table.setCellValue(3, 1, 'Third');
			table.setCellValue(2, 1, 'Second');

			table.apply();

			expect(table.data.values.length).toBe(3);
			expect(table.data.values[1][1]).toBe('Second');
			expect(table.data.values[2][1]).toBe('Third');
		});

		it('should fill unset columns with null on insert', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(1, 1, 'Bob'); // only set name column

			table.apply();

			expect(table.data.values[1][0]).toBeNull();
			expect(table.data.values[1][1]).toBe('Bob');
			expect(table.data.values[1][2]).toBeNull();
		});

		it('should reset mutations after apply', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(0, 1, 'Alicia');
			table.setCellValue(1, 1, 'Bob');

			table.apply();

			const mutations = table.mutations;
			expect(mutations.updates.size).toBe(0);
			expect(mutations.inserts.size).toBe(0);
		});

		it('should throw when table has errors', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(0, 2, 'not-a-number'); // triggers error

			expect(table.hasErrors()).toBe(true);
			expect(() => table.apply()).toThrow('ERROR: cannot apply; table has validation errors');
		});

		it('should clear errors after successful apply', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(0, 1, 'Alicia'); // valid edit

			table.apply();

			expect(table.hasErrors()).toBe(false);
		});

		it('should throw when updating non-existent row', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			// Manually inject bad update to simulate bug
			table.mutations.updates.set(99, { rowId: 99, colsUpdated: new Map([[1, 'Ghost']]) });

			expect(() => table.apply()).toThrow('ERROR: row 99 does not exist');
		});

		it('should handle mixed updates and inserts', () => {
			const table = Table.fromExecResults(
				['id', 'name', 'value'],
				[[1, 'Alice', 1.0], [2, 'Bob', 2.0]],
				schema
			);
			table.setCellValue(0, 1, 'Alicia');  // update
			table.setCellValue(1, 2, '2.5');      // update
			table.setCellValue(2, 1, 'Charlie'); // insert

			table.apply();

			expect(table.data.values.length).toBe(3);
			expect(table.data.values[0][1]).toBe('Alicia');
			expect(table.data.values[1][2]).toBe(2.5);
			expect(table.data.values[2][1]).toBe('Charlie');
		});

		it('should skip fully empty insert rows', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(1, 1, 'Bob');
			table.setCellValue(1, 1, '');  // user clears it

			table.apply();

			expect(table.data.values.length).toBe(1); // no new row added
		});

		it('should keep insert row if at least one column has value', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(1, 1, '');
			table.setCellValue(1, 2, '5.0');

			table.apply();

			expect(table.data.values.length).toBe(2);
			expect(table.data.values[1][2]).toBe(5.0);
		});

		it('should revert update when value reset to original', () => {
			const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
			table.setCellValue(0, 1, 'Alicia');
			table.setCellValue(0, 1, 'Alice'); // back to original

			expect(table.mutations.updates.size).toBe(0);

			table.apply();

			expect(table.data.values[0][1]).toBe('Alice');
		});
	});
});

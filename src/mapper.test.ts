import { mapMutations, mapUpdates, mapInserts, SqlStatement } from './mapper';
import { TableMutations } from './table';
import { ColumnSchema } from './schema_provider';

describe('mapper', () => {
	let schema: ReadonlyArray<ColumnSchema>;

	beforeEach(() => {
		schema = [
			{ name: 'id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: 'users' },
			{ name: 'name', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: 'users' },
			{ name: 'email', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: 'users' },
		];
	});

	describe('mapUpdates', () => {
		it('should generate UPDATE statement for single column', () => {
			const updates: TableMutations['updates'] = new Map([
				[0, { rowId: 1, colsUpdated: new Map([[1, 'Alice']]) }]
			]);

			const result = mapUpdates(updates, schema);

			expect(result).toHaveLength(1);
			expect(result[0].sql).toBe('UPDATE users SET name = ? WHERE id = ?');
			expect(result[0].params).toEqual(['Alice', 1]);
		});

		it('should generate UPDATE statement for multiple columns', () => {
			const updates: TableMutations['updates'] = new Map([
				[0, { rowId: 1, colsUpdated: new Map([[1, 'Alice'], [2, 'alice@test.com']]) }]
			]);

			const result = mapUpdates(updates, schema);

			expect(result).toHaveLength(1);
			expect(result[0].sql).toBe('UPDATE users SET name = ?, email = ? WHERE id = ?');
			expect(result[0].params).toEqual(['Alice', 'alice@test.com', 1]);
		});

		it('should generate multiple UPDATE statements for multiple rows', () => {
			const updates: TableMutations['updates'] = new Map([
				[0, { rowId: 1, colsUpdated: new Map([[1, 'Alice']]) }],
				[1, { rowId: 2, colsUpdated: new Map([[1, 'Bob']]) }],
			]);

			const result = mapUpdates(updates, schema);

			expect(result).toHaveLength(2);
			expect(result[0].params).toEqual(['Alice', 1]);
			expect(result[1].params).toEqual(['Bob', 2]);
		});

		it('should throw if column has no table name', () => {
			const badSchema: ReadonlyArray<ColumnSchema> = [
				{ name: 'id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: 'users' },
				{ name: 'name', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: undefined },
			];
			const updates: TableMutations['updates'] = new Map([
				[0, { rowId: 1, colsUpdated: new Map([[1, 'Alice']]) }]
			]);

			expect(() => mapUpdates(updates, badSchema)).toThrow('column at index 1 has no table name');
		});

		it('should throw if table has no primary key', () => {
			const noPkSchema: ReadonlyArray<ColumnSchema> = [
				{ name: 'id', type: 'INTEGER', isPrimaryKey: false, notNull: true, tableName: 'users' },
				{ name: 'name', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: 'users' },
			];
			const updates: TableMutations['updates'] = new Map([
				[0, { rowId: 1, colsUpdated: new Map([[1, 'Alice']]) }]
			]);

			expect(() => mapUpdates(updates, noPkSchema)).toThrow('no primary key found for table users');
		});

		it('should throw for multi-table updates', () => {
			const multiTableSchema: ReadonlyArray<ColumnSchema> = [
				{ name: 'id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: 'users' },
				{ name: 'post_id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: 'posts' },
				{ name: 'title', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: 'posts' },
			];
			const updates: TableMutations['updates'] = new Map([
				[0, { rowId: 1, colsUpdated: new Map([[0, 1], [1, 'Hello']]) }]
			]);

			expect(() => mapUpdates(updates, multiTableSchema)).toThrow('multi-table updates not yet supported');
		});

		it('should return empty array for no updates', () => {
			const updates: TableMutations['updates'] = new Map();

			const result = mapUpdates(updates, schema);

			expect(result).toEqual([]);
		});
	});

	describe('mapInserts', () => {
		it('should generate INSERT statement for single column', () => {
			const inserts: TableMutations['inserts'] = new Map([
				[1, { colsUpdated: new Map([[1, 'Alice']]) }]
			]);

			const result = mapInserts(inserts, schema);

			expect(result).toHaveLength(1);
			expect(result[0].sql).toBe('INSERT INTO users (name) VALUES (?)');
			expect(result[0].params).toEqual(['Alice']);
		});

		it('should generate INSERT statement for multiple columns', () => {
			const inserts: TableMutations['inserts'] = new Map([
				[1, { colsUpdated: new Map([[0, 2], [1, 'Alice'], [2, 'alice@test.com']]) }]
			]);

			const result = mapInserts(inserts, schema);

			expect(result).toHaveLength(1);
			expect(result[0].sql).toBe('INSERT INTO users (id, name, email) VALUES (?, ?, ?)');
			expect(result[0].params).toEqual([2, 'Alice', 'alice@test.com']);
		});

		it('should generate multiple INSERT statements for multiple rows', () => {
			const inserts: TableMutations['inserts'] = new Map([
				[1, { colsUpdated: new Map([[1, 'Alice']]) }],
				[2, { colsUpdated: new Map([[1, 'Bob']]) }],
			]);

			const result = mapInserts(inserts, schema);

			expect(result).toHaveLength(2);
			expect(result[0].params).toEqual(['Alice']);
			expect(result[1].params).toEqual(['Bob']);
		});

		it('should throw if column has no table name', () => {
			const badSchema: ReadonlyArray<ColumnSchema> = [
				{ name: 'id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: 'users' },
				{ name: 'name', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: undefined },
			];
			const inserts: TableMutations['inserts'] = new Map([
				[1, { colsUpdated: new Map([[1, 'Alice']]) }]
			]);

			expect(() => mapInserts(inserts, badSchema)).toThrow('column at index 1 has no table name');
		});

		it('should throw for multi-table inserts', () => {
			const multiTableSchema: ReadonlyArray<ColumnSchema> = [
				{ name: 'id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: 'users' },
				{ name: 'title', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: 'posts' },
			];
			const inserts: TableMutations['inserts'] = new Map([
				[1, { colsUpdated: new Map([[0, 1], [1, 'Hello']]) }]
			]);

			expect(() => mapInserts(inserts, multiTableSchema)).toThrow('multi-table inserts not yet supported');
		});

		it('should return empty array for no inserts', () => {
			const inserts: TableMutations['inserts'] = new Map();

			const result = mapInserts(inserts, schema);

			expect(result).toEqual([]);
		});
	});

	describe('mapMutations', () => {
		it('should combine updates and inserts', () => {
			const mutations: TableMutations = {
				updates: new Map([
					[0, { rowId: 1, colsUpdated: new Map([[1, 'Updated']]) }]
				]),
				inserts: new Map([
					[1, { colsUpdated: new Map([[1, 'New']]) }]
				]),
				deletes: [],
				alters: { colsRenamed: [], colsAdded: [], colsDeleted: [] },
			};

			const result = mapMutations(mutations, schema);

			expect(result).toHaveLength(2);
			expect(result[0].sql).toContain('UPDATE');
			expect(result[1].sql).toContain('INSERT');
		});

		it('should return empty array for no mutations', () => {
			const mutations: TableMutations = {
				updates: new Map(),
				inserts: new Map(),
				deletes: [],
				alters: { colsRenamed: [], colsAdded: [], colsDeleted: [] },
			};

			const result = mapMutations(mutations, schema);

			expect(result).toEqual([]);
		});
	});
});

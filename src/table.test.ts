
import Table, { TableData } from './table';
import { ColumnSchema } from './schema_provider';

describe('Table', () => {
    let schema: ColumnSchema[];
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
        const mutations = table.getMutations();
        expect(mutations.updates.size).toBe(1);
        expect(mutations.updates.get(0)?.colsUpdated.get(1)).toBe('Alicia');
    });

    it('should track inserts when a new row is added', () => {
        const table = Table.fromExecResults(['id', 'name', 'value'], [[1, 'Alice', 1.0]], schema);
        table.setCellValue(1, 1, 'Bob');
        const mutations = table.getMutations();
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
});

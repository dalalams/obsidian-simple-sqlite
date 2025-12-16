
import { SimpleTableSchemaProvider } from './schema_provider';
import DatabaseManager from './connection';
import { ParsedConfig, ParsingSpec } from '../core/parser';
import { QueryExecResult } from 'sql.js';

jest.mock('./connection');

describe('SimpleTableSchemaProvider', () => {
    let dbManager: jest.Mocked<DatabaseManager>;
    let schemaProvider: SimpleTableSchemaProvider;

    beforeEach(() => {
        dbManager = new DatabaseManager() as jest.Mocked<DatabaseManager>;
        schemaProvider = new SimpleTableSchemaProvider(dbManager);
    });

    it('should return the correct parsing spec', () => {
        const spec: ParsingSpec = schemaProvider.getParsingSpec();
        expect(spec).toEqual({
            needsNTableNames: 1,
            needsCustomSchema: false
        });
    });

    it('should get the schema for a table', async () => {
        const config: ParsedConfig = {
            dbPath: 'my/db/path.db',
            query: 'SELECT * FROM users',
            tableNames: ['users'],
            customSchema: null
        };
        const pragmaResult: QueryExecResult = {
            columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'],
            values: [
                [0, 'id', 'INTEGER', 1, null, 1],
                [1, 'name', 'TEXT', 0, null, 0]
            ]
        };
        dbManager.exec.mockResolvedValue(pragmaResult);

        const schema = await schemaProvider.getSchema(config);

        expect(dbManager.exec).toHaveBeenCalledWith('my/db/path.db', 'PRAGMA table_info(users)');
        expect(schema).toEqual([
            {
                name: 'id',
                type: 'INTEGER',
                tableName: 'users',
                notNull: true,
                isPrimaryKey: true
            },
            {
                name: 'name',
                type: 'TEXT',
                tableName: 'users',
                notNull: false,
                isPrimaryKey: false
            }
        ]);
    });
});

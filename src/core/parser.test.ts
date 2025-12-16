
import { CodeBlockParser, ParsedConfig, ParsingSpec } from './parser';

describe('CodeBlockParser', () => {
    let parser: CodeBlockParser;

    beforeEach(() => {
        parser = new CodeBlockParser();
    });

    it('should parse a valid code block', () => {
        const code = `
            my/db/path.db
            SELECT * FROM users
        `;
        const spec: ParsingSpec = { needsNTableNames: 0, needsCustomSchema: false };
        const result: ParsedConfig = parser.parse(code, spec);
        expect(result).toEqual({
            dbPath: 'my/db/path.db',
            query: 'SELECT * FROM users',
            tableNames: [],
            customSchema: null
        });
    });

    it('should throw an error for a missing file path', () => {
        const code = `
            SELECT * FROM users
        `;
        const spec: ParsingSpec = { needsNTableNames: 0, needsCustomSchema: false };
        expect(() => parser.parse(code, spec)).toThrow('Invalid format. Expected: file_path\\nquery');
    });

    it('should throw an error for a missing query', () => {
        const code = `
            my/db/path.db
        `;
        const spec: ParsingSpec = { needsNTableNames: 0, needsCustomSchema: false };
        expect(() => parser.parse(code, spec)).toThrow('Invalid format. Expected: file_path\\nquery');
    });

    it('should parse a code block that needs table names', () => {
        const code = `
            my/db/path.db
            SELECT * FROM users JOIN posts ON users.id = posts.user_id
        `;
        const spec: ParsingSpec = { needsNTableNames: 2, needsCustomSchema: false };
        const result: ParsedConfig = parser.parse(code, spec);
        expect(result).toEqual({
            dbPath: 'my/db/path.db',
            query: 'SELECT * FROM users JOIN posts ON users.id = posts.user_id',
            tableNames: ['users', 'posts'],
            customSchema: null
        });
    });

    it('should throw an error for an invalid number of table names', () => {
        const code = `
            my/db/path.db
            SELECT * FROM users
        `;
        const spec: ParsingSpec = { needsNTableNames: 2, needsCustomSchema: false };
        expect(() => parser.parse(code, spec)).toThrow('Invalid format: Invalid number of tables');
    });

    it('should parse a code block that needs a custom schema', () => {
        const code = `
            my/db/path.db
            SELECT * FROM users
            schema: id:INTEGER:users:pk, name:TEXT:users, title:TEXT:posts
        `;
        const spec: ParsingSpec = { needsNTableNames: 0, needsCustomSchema: true };
        const result: ParsedConfig = parser.parse(code, spec);
        expect(result).toEqual({
            dbPath: 'my/db/path.db',
            query: 'SELECT * FROM users',
            tableNames: [],
            customSchema: 'id:INTEGER:users:pk, name:TEXT:users, title:TEXT:posts'
        });
    });

    it('should throw an error for a missing custom schema', () => {
        const code = `
            my/db/path.db
            SELECT * FROM users
        `;
        const spec: ParsingSpec = { needsNTableNames: 0, needsCustomSchema: true };
        expect(() => parser.parse(code, spec)).toThrow('Invalid format: Schema information missing');
    });
});

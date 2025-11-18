
type ParsedContent = { dbPath: string, query: string, options?: object }

export default interface Parser {
	parse(source: string): ParsedContent
}

export class CodeBlockParser implements Parser {
	parse(codeBlockContent: string): ParsedContent {
		const lines = codeBlockContent.split('\n').filter(line => line.trim().length > 0);

		if (lines.length < 2) {
			throw new Error("Invalid format. Expected: file_path\\nquery");
		}

		let [f, q] = lines;
		f = f.trim();
		q = q.trim();

		if (f.length === 0) {
			throw new Error("Invalid format. File path is empty");
		}

		if (!f.endsWith(".db") && !f.endsWith(".sqlite") && !f.endsWith(".sqlite3")) {
			throw new Error("Invalid format. File path must end with .db, .sqlite, or .sqlite3");
		}

		if (q.length === 0) {
			throw new Error("Invalid format. Query is empty");
		}

		if (f.startsWith("./")) f = f.substring(2);
		if (!q.endsWith(";")) q = q + ';';

		return { dbPath: f, query: q };
	}
}


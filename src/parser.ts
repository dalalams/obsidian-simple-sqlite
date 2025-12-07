
export type ParsingSpec = {
	needsNTableNames: number,
	needsCustomSchema: boolean,
}

export type ParsedConfig = {
	dbPath: string,
	query: string,
	tableNames: string[],
	customSchema: string | null,
}

export default interface Parser {
	parse(source: string, spec: ParsingSpec): ParsedConfig
}

export class CodeBlockParser implements Parser {
	parse(codeBlockContent: string, spec: ParsingSpec): ParsedConfig {
		const lines = codeBlockContent.split('\n')
			.map(l => l.trim())
			.filter(l => l.length > 0)

		if (lines.length < 2) {
			throw new Error("Invalid format. Expected: file_path\\nquery");
		}

		const fileLine = lines[0]
		const queryLine = lines[1]

		if (!fileLine || fileLine.length === 0) {
			throw new Error("Invalid format. File path missing");
		}

		if (!queryLine || queryLine.length === 0) {
			throw new Error("Invalid format. Query string missing");
		}

		let tableNames: string[] = []
		let customSchema: string | null = null

		if (spec.needsNTableNames > 0) {
			tableNames = CodeBlockParser.extractTableNames(queryLine, spec.needsNTableNames)
			if (tableNames.length != spec.needsNTableNames) {
				throw new Error("Invalid format: Invalid number of tables")
			}
		}

		if (spec.needsCustomSchema) {
			const schemaLine = lines.find(l => l.startsWith('schema:'))
			if (!schemaLine) {
				throw new Error("Invalid format: Schema information missing")
			}
			customSchema = schemaLine.substring(7).trim()
		}

		return {
			dbPath: fileLine,
			query: queryLine,
			tableNames,
			customSchema,
		}
	}

	private static extractTableNames(sql: string, count: number): string[] {
		const tables: string[] = []

		const fromMatch = sql.match(/FROM\s+(\w+)/i)
		if (fromMatch) tables.push(fromMatch[1])

		const joinMatches = sql.matchAll(/JOIN\s+(\w+)/gi)
		for (const match of joinMatches) {
			if (tables.length < count) tables.push(match[1])
		}

		return tables
	}
}


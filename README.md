# Simple Sqlite

Embed SQLite database queries directly in your Obsidian notes and view results as formatted tables

## Usage

Use the `sqlite-view` code block to query SQLite databases in your vault:

````markdown
```sqlite-view
path/to/database.db
SELECT * FROM users WHERE active = 1;
```
````

### Format

- **Line 1**: Path to your SQLite database file (`.db`, `.sqlite`, or `.sqlite3`)
- **Line 2+**: SQL query to execute

## Important Notes

- **Memory Usage**: Database files are loaded entirely into memory for querying. Large databases may impact performance
- Database files must be located within your Obsidian vault

import Engine from './engine';
import { Cache, DbFileCacheEntry, TableDataCacheEntry } from './cache/cache';
import DatabaseManager from './db/connection';
import Parser, { ParsedConfig } from './core/parser';
import Renderer, { RenderCallbacks, TableView } from './ui/renderer';
import SchemaProvider, { ColumnSchema } from './db/schema_provider';
import { App, TFile } from 'obsidian';
import { TableData } from './core/table';

jest.mock('obsidian', () => ({
	setIcon: jest.fn(),
	setTooltip: jest.fn(),
}));

// polyfill Obsidian's HTMLElement extensions
if (typeof HTMLElement !== 'undefined') {
	(HTMLElement.prototype as any).createDiv = function (options: any, callback: any) {
		const div = document.createElement('div');
		if (options && options.cls) {
			div.className = options.cls;
		}
		this.appendChild(div);
		if (callback) {
			callback(div);
		}
		return div;
	};
	(HTMLElement.prototype as any).createEl = function (tag: any, options: any, callback: any) {
		const el = document.createElement(tag);
		if (options && options.cls) {
			el.className = options.cls;
		}
		if (options && options.text) {
			el.textContent = options.text;
		}
		this.appendChild(el);
		if (callback) {
			callback(el);
		}
		return el;
	};
}

describe('Engine Integration', () => {
	let mockApp: jest.Mocked<App>;
	let mockParser: jest.Mocked<Parser>;
	let mockRenderer: jest.Mocked<Renderer>;
	let mockDbCache: jest.Mocked<Cache<DbFileCacheEntry>>;
	let mockTableCache: jest.Mocked<Cache<TableDataCacheEntry>>;
	let mockSchemaProvider: jest.Mocked<SchemaProvider>;
	let mockDbManager: jest.Mocked<DatabaseManager>;

	let capturedCallbacks: RenderCallbacks;
	let mockView: jest.Mocked<TableView>;

	let schema: ReadonlyArray<ColumnSchema>;
	let parsedCfg: ParsedConfig;
	let mockFile: TFile;

	let engine: Engine;

	beforeEach(() => {
		schema = [
			{ name: 'id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: 'users' },
			{ name: 'name', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: 'users' },
		];

		parsedCfg = {
			dbPath: 'test.db',
			query: 'SELECT * FROM users',
			tableNames: ['users'],
			customSchema: null,
		};

		mockFile = {
			path: 'test.db',
			stat: { mtime: 1000 },
		} as unknown as TFile;

		mockView = {
			updateCellState: jest.fn(),
			showErrors: jest.fn(),
			clearErrors: jest.fn(),
			clearModified: jest.fn(),
			showMessage: jest.fn(),
			destroy: jest.fn(),
		};

		mockApp = {
			vault: {
				getFileByPath: jest.fn().mockReturnValue(mockFile),
				readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
				modifyBinary: jest.fn().mockResolvedValue(undefined),
			},
		} as unknown as jest.Mocked<App>;

		mockParser = {
			parse: jest.fn().mockReturnValue(parsedCfg),
		} as jest.Mocked<Parser>;

		mockRenderer = {
			render: jest.fn().mockImplementation((el, data, callbacks) => {
				capturedCallbacks = callbacks;
				return mockView;
			}),
		} as jest.Mocked<Renderer>;

		mockDbCache = {
			get: jest.fn().mockReturnValue(undefined),
			set: jest.fn(),
			invalidate: jest.fn(),
		} as unknown as jest.Mocked<Cache<DbFileCacheEntry>>;

		mockTableCache = {
			get: jest.fn().mockReturnValue(undefined),
			set: jest.fn(),
			invalidate: jest.fn(),
		} as unknown as jest.Mocked<Cache<TableDataCacheEntry>>;

		mockSchemaProvider = {
			getParsingSpec: jest.fn().mockReturnValue({ needsNTableNames: 1, needsCustomSchema: false }),
			getSchema: jest.fn().mockResolvedValue(schema),
		} as jest.Mocked<SchemaProvider>;

		mockDbManager = {
			connect: jest.fn().mockResolvedValue({}),
			exec: jest.fn().mockResolvedValue({
				columns: ['id', 'name'],
				values: [[1, 'Alice'], [2, 'Bob']],
			}),
			run: jest.fn().mockResolvedValue(undefined),
			export: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
		} as unknown as jest.Mocked<DatabaseManager>;

		engine = new Engine(
			mockApp,
			mockParser,
			mockRenderer,
			mockDbCache,
			mockTableCache,
			mockSchemaProvider,
			mockDbManager
		);
	});

	describe('processSqliteView', () => {
		it('should render table with data from database', async () => {
			const el = document.createElement('div');
			await engine.processSqliteView('test.db\nSELECT * FROM users', el);

			expect(mockRenderer.render).toHaveBeenCalledTimes(1);
			const renderedData: TableData = mockRenderer.render.mock.calls[0][1];
			expect(renderedData.columns).toEqual(['id', 'name']);
			expect(renderedData.values).toEqual([[1, 'Alice'], [2, 'Bob']]);
		});

		it('should show error when database file not found', async () => {
			mockApp.vault.getFileByPath = jest.fn().mockReturnValue(null);
			const el = document.createElement('div');

			await engine.processSqliteView('missing.db\nSELECT * FROM users', el);

			expect(el.textContent).toContain('not found');
		});
	});

	describe('save flow', () => {
		beforeEach(async () => {
			const el = document.createElement('div');
			await engine.processSqliteView('test.db\nSELECT * FROM users', el);
		});

		it('should execute UPDATE in transaction and write to vault', async () => {
			// Edit a cell
			capturedCallbacks.onCellBlur(0, 1, 'Alicia');

			// Save
			await capturedCallbacks.onSave();

			// Verify transaction
			expect(mockDbManager.run).toHaveBeenCalledWith('test.db', 'BEGIN', []);
			expect(mockDbManager.run).toHaveBeenCalledWith(
				'test.db',
				'UPDATE users SET name = ? WHERE id = ?',
				['Alicia', 1]
			);
			expect(mockDbManager.run).toHaveBeenCalledWith('test.db', 'COMMIT', []);

			// Verify export and vault write
			expect(mockDbManager.export).toHaveBeenCalledWith('test.db');
			expect(mockApp.vault.modifyBinary).toHaveBeenCalledWith(
				mockFile,
				new Uint8Array([1, 2, 3])
			);
		});

		it('should execute INSERT in transaction', async () => {
			// Add new row
			capturedCallbacks.onCellBlur(2, 1, 'Charlie');

			// Save
			await capturedCallbacks.onSave();

			// Verify transaction
			expect(mockDbManager.run).toHaveBeenCalledWith('test.db', 'BEGIN', []);
			expect(mockDbManager.run).toHaveBeenCalledWith(
				'test.db',
				'INSERT INTO users (name) VALUES (?)',
				['Charlie']
			);
			expect(mockDbManager.run).toHaveBeenCalledWith('test.db', 'COMMIT', []);
		});

		it('should ROLLBACK on database error', async () => {
			mockDbManager.run
				.mockResolvedValueOnce(undefined) // BEGIN
				.mockRejectedValueOnce(new Error('UNIQUE constraint failed')) // UPDATE
				.mockResolvedValueOnce(undefined); // ROLLBACK

			capturedCallbacks.onCellBlur(0, 1, 'Alicia');
			await capturedCallbacks.onSave();

			expect(mockDbManager.run).toHaveBeenCalledWith('test.db', 'ROLLBACK', []);
			expect(mockApp.vault.modifyBinary).not.toHaveBeenCalled();
			expect(mockView.showMessage).toHaveBeenCalledWith(
				expect.stringContaining('UNIQUE constraint failed'),
				'error'
			);
		});

		it('should invalidate caches after successful save', async () => {
			capturedCallbacks.onCellBlur(0, 1, 'Alicia');
			await capturedCallbacks.onSave();

			expect(mockTableCache.invalidate).toHaveBeenCalledWith('test.db|select*fromusers');
			expect(mockDbCache.invalidate).toHaveBeenCalledWith('test.db');
		});

		it('should update view after successful save', async () => {
			capturedCallbacks.onCellBlur(0, 1, 'Alicia');
			await capturedCallbacks.onSave();

			expect(mockView.clearErrors).toHaveBeenCalled();
			expect(mockView.clearModified).toHaveBeenCalled();
			expect(mockView.showMessage).toHaveBeenCalledWith('Saved successfully', 'success');
		});

		it('should not save when table has validation errors', async () => {
			// Trigger NOT NULL violation on primary key
			capturedCallbacks.onCellBlur(0, 0, '');

			await capturedCallbacks.onSave();

			expect(mockDbManager.run).not.toHaveBeenCalled();
			expect(mockView.showErrors).toHaveBeenCalled();
			expect(mockView.showMessage).toHaveBeenCalledWith(
				expect.stringContaining('fix validation errors'),
				'error'
			);
		});

		it('should skip transaction for empty mutations', async () => {
			// No edits, just save
			await capturedCallbacks.onSave();

			// Should not call BEGIN/COMMIT
			expect(mockDbManager.run).not.toHaveBeenCalledWith('test.db', 'BEGIN', []);
			expect(mockDbManager.run).not.toHaveBeenCalledWith('test.db', 'COMMIT', []);

			// Should still export and write (in case we want to persist unchanged db)
			expect(mockDbManager.export).toHaveBeenCalled();
			expect(mockApp.vault.modifyBinary).toHaveBeenCalled();
		});
	});

	describe('cell editing', () => {
		beforeEach(async () => {
			const el = document.createElement('div');
			await engine.processSqliteView('test.db\nSELECT * FROM users', el);
		});

		it('should update cell state on blur', async () => {
			capturedCallbacks.onCellBlur(0, 1, 'Alicia');

			expect(mockView.updateCellState).toHaveBeenCalledWith(0, 1, {
				isModified: true,
				error: null, // showErrorsOnEdit is false by default
			});
		});

		it('should track multiple edits', async () => {
			capturedCallbacks.onCellBlur(0, 1, 'Alicia');
			capturedCallbacks.onCellBlur(1, 1, 'Bobby');

			await capturedCallbacks.onSave();

			// Both updates should be in transaction
			expect(mockDbManager.run).toHaveBeenCalledWith(
				'test.db',
				'UPDATE users SET name = ? WHERE id = ?',
				['Alicia', 1]
			);
			expect(mockDbManager.run).toHaveBeenCalledWith(
				'test.db',
				'UPDATE users SET name = ? WHERE id = ?',
				['Bobby', 2]
			);
		});

		it('should revert modification when value reset to original', async () => {
			capturedCallbacks.onCellBlur(0, 1, 'Alicia');
			capturedCallbacks.onCellBlur(0, 1, 'Alice'); // Back to original

			expect(mockView.updateCellState).toHaveBeenLastCalledWith(0, 1, {
				isModified: false,
				error: null,
			});
		});
	});

	describe('caching', () => {
		it('should use cached table data when available', async () => {
			const cachedData: TableData = {
				columns: ['id', 'name'],
				values: [[99, 'Cached']],
				schema,
			};
			mockTableCache.get = jest.fn().mockReturnValue({ data: cachedData, dbLastModified: 1000 });

			const el = document.createElement('div');
			await engine.processSqliteView('test.db\nSELECT * FROM users', el);

			// Should not query database
			expect(mockDbManager.exec).not.toHaveBeenCalled();

			// Should render cached data
			const renderedData: TableData = mockRenderer.render.mock.calls[0][1];
			expect(renderedData.values).toEqual([[99, 'Cached']]);
		});

		it('should cache table data after query', async () => {
			const el = document.createElement('div');
			await engine.processSqliteView('test.db\nSELECT * FROM users', el);

			expect(mockTableCache.set).toHaveBeenCalledWith(
				'test.db|select*fromusers',
				expect.objectContaining({ dbLastModified: 1000 })
			);
		});
	});
});

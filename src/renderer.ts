import { setIcon, setTooltip } from 'obsidian';
import { CellError, TableData } from "./table";
import { ColumnSchema } from "./schema_provider";

export type RenderCallbacks = {
	onCellBlur: (rowIdx: number, colIdx: number, value: string) => void;
	onSave: () => void;
	onAddRow: () => void;
	onAddCol: (name: string) => void;
}

export type CellState = {
	isModified: boolean;
	error: { message: string } | null;
}

export interface TableView {
	updateCellState(rowIdx: number, colIdx: number, state: CellState): void;
	showErrors(errors: CellError[]): void;
	clearErrors(): void;
	clearModified(): void;
	showMessage(msg: string, type: 'error' | 'success' | 'info'): void;
	destroy(): void;
}

export default interface Renderer {
	render(el: HTMLElement, data: TableData, callbacks: RenderCallbacks): TableView;

}

const CSS = {
    MODIFIED: 'modified',
    CELL_ERROR: 'cell-error',
    READONLY: 'readonly',
    PRIMARY_KEY: 'primary-key',
} as const;

export class HTMLTableRenderer implements Renderer {
	render(el: HTMLElement, data: TableData, callbacks: RenderCallbacks): TableView {
		const cells: Map<string, HTMLTableCellElement> = new Map()
		const cellKey = (row: number, col: number) => `${row}-${col}`;

		const { columns: cols, values: rows, schema } = data
		let rowCount = rows.length;

		const tableWidget = el.createDiv({ cls: "cm-table-widget" })
		const messageBanner = tableWidget.createDiv({ cls: "sqlite-message-banner hidden" });

		const wrapper = tableWidget.createDiv({ cls: "table-wrapper" })
		const table = wrapper.createEl('table', { cls: "table-editor" });
		const head = table.createEl('thead');
		const body = table.createEl('tbody');

		const htr = head.createEl('tr')
		for (let i = 0; i < cols.length; i++) {
			const th = htr.createEl('th', { text: cols[i] })
			if (schema && schema[i]?.isPrimaryKey) {
				th.classList.add(CSS.PRIMARY_KEY)
			}
		}

		for (let i = 0; i < rows.length; i++) {
			HTMLTableRenderer.createRow(body, i, cols.length, rows[i], schema, cells, callbacks);
		}

		// add row
		wrapper.createDiv({ cls: "table-row-btn" }, (addRowBtn) => {
			setIcon(addRowBtn, "lucide-plus");
			setTooltip(addRowBtn, "Add row");

			addRowBtn.addEventListener("pointerdown", (e) => e.preventDefault());
			addRowBtn.addEventListener("click", () => {
				const newRowIdx = rowCount++;
				const row = body.createEl('tr');

				for (let colIdx = 0; colIdx < cols.length; colIdx++) {
					const colSchema = schema ? schema[colIdx] : null;
					const td = row.createEl('td', { text: '' });

					if (colSchema?.isPrimaryKey) {
						td.contentEditable = 'false';
						td.classList.add(CSS.READONLY);
					} else {
						td.contentEditable = 'true';
						td.addEventListener('blur', () => {
							callbacks.onCellBlur(newRowIdx, colIdx, td.textContent ?? '');
						});
					}

					cells.set(`${newRowIdx}-${colIdx}`, td);
				}

				callbacks.onAddRow();
			});
		});

		// add col
		wrapper.createDiv({ cls: "table-col-btn" }, (addColBtn) => {
			setIcon(addColBtn, "lucide-plus");
			setTooltip(addColBtn, "Add column");

			addColBtn.addEventListener("pointerdown", (e) => e.preventDefault());
			addColBtn.addEventListener("click", () => {
				const name = prompt("Column name:");
				if (name) {
					callbacks.onAddCol(name);
				}
			});
		});

		// save
		const toolbar = tableWidget.createDiv({ cls: "sqlite-toolbar" });
		toolbar.createEl('button', { text: "Save", cls: "sqlite-save-btn" }, (saveBtn) => {
			saveBtn.addEventListener("click", () => {
				callbacks.onSave();
			});
		});

		return {
			updateCellState(rowIdx: number, colIdx: number, state: CellState) {
				const td = cells.get(cellKey(rowIdx, colIdx));
				if (!td) return;

				td.classList.toggle(CSS.MODIFIED, state.isModified);
				td.classList.toggle(CSS.CELL_ERROR, !!state.error);
				td.title = state.error?.message ?? '';
			},

			showErrors(errors) {
				for (const err of errors) {
					const td = cells.get(cellKey(err.rowIdx, err.colIdx));
					if (td) {
						td.classList.add(CSS.CELL_ERROR);
						td.title = err.message;
					}
				}
			},

			clearErrors() {
				cells.forEach(td => {
					td.classList.remove(CSS.CELL_ERROR)
					td.title = ''
				})
			},

			clearModified(): void {
				cells.forEach((td) => {
					td.classList.remove(CSS.MODIFIED);
				});
			},

			showMessage(msg: string, type: 'error' | 'success' | 'info'): void {
				messageBanner.textContent = msg;
				messageBanner.className = `sqlite-message-banner ${type}`;
				messageBanner.classList.remove('hidden');

				if (type === 'success' || type === 'info') {
					setTimeout(() => {
						messageBanner.classList.add('hidden');
					}, 3000);
				}
			},

			destroy(): void {
				tableWidget.remove();
				cells.clear();
			}
		} as TableView
	}

	private static createRow(
		body: HTMLElement,
		rowIdx: number,
		colCount: number,
		values: any[],
		schema: ColumnSchema[],
		cells: Map<string, HTMLTableCellElement>,
		callbacks: RenderCallbacks
	): HTMLTableRowElement {
		const row = body.createEl('tr');

		for (let colIdx = 0; colIdx < colCount; colIdx++) {
			const value = values[colIdx] ?? '';
			const colSchema = schema ? schema[colIdx] : null;
			const td = row.createEl('td', { text: String(value) });

			if (colSchema?.isPrimaryKey) {
				td.contentEditable = 'false';
				td.classList.add(CSS.READONLY);
			} else {
				td.contentEditable = 'true';
				td.addEventListener('blur', () => {
					callbacks.onCellBlur(rowIdx, colIdx, td.textContent ?? '');
				});
			}

			td.addEventListener('keydown', (e) => {
				if (e.key === 'Escape') {
					td.blur();
				}
			});

			cells.set(`${rowIdx}-${colIdx}`, td);
		}

		return row;
	}
}

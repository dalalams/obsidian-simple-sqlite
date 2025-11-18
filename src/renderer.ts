import { QueryExecResult } from "sql.js";
import { setIcon, setTooltip } from 'obsidian';

type Table = {
	cols: HTMLTableCellElement[],
	rows: HTMLTableRowElement[],
}


export default interface Renderer {
	// todo: change results to table state
	render(el: HTMLElement, results: QueryExecResult): void
}

export class HTMLTableRenderer implements Renderer {
	static insertRow(t: Table, tBody: HTMLElement) {
		const row = tBody.createEl('tr');
		for (let j = 0; j < t.cols.length; j++) {
			row.createEl('td', { text: '' }, function(td) {
				td.contentEditable = 'true'
			});
		}
		t.rows.push(row)
	}

	static insertCol(t: Table, htr: HTMLElement) {
		const col = htr.createEl('th', { text: '' }, function(td) {
			td.contentEditable = 'true'
		})

		t.cols.push(col)

		t.rows.forEach(row => row.createEl('td', { text: '' }, function(td) {
			td.contentEditable = 'true'
		}))
	}

	render(el: HTMLElement, results: QueryExecResult): void {
		const { columns: cols, values: rows } = results

		const t: Table = {
			cols: [],
			rows: [],
		}

		const tableWidget = el.createDiv({ cls: "cm-table-widget" })
		const wrapper = tableWidget.createDiv({ cls: "table-wrapper" })
		const table = wrapper.createEl('table', { cls: "table-editor" });
		const head = table.createEl('thead');
		const body = table.createEl('tbody');

		const htr = head.createEl('tr')
		for (let i = 0; i < cols.length; i++) {
			const col = htr.createEl('th', { text: cols[i] })
			t.cols.push(col)
		}


		for (let i = 0; i < rows.length; i++) {
			const row = body.createEl('tr');
			for (let j = 0; j < cols.length; j++) {
				row.createEl('td', { text: String(rows[i][j] || '') });
			}
			t.rows.push(row)
		}

		wrapper.createDiv("table-row-btn", function(addRowBtn) {
			setIcon(addRowBtn, "lucide-plus");
			setTooltip(addRowBtn, "Add row after")

			addRowBtn.addEventListener("pointerdown", function(e) {
				return e.preventDefault();
			});

			addRowBtn.addEventListener("click", function() {
				console.log("inserting row")
				HTMLTableRenderer.insertRow(t, body)
			});
		});

		wrapper.createDiv("table-col-btn", function(addColBtn) {
			setIcon(addColBtn, "lucide-plus");
			setTooltip(addColBtn, "Add column after")

			addColBtn.addEventListener("pointerdown", function(e) {
				return e.preventDefault();
			});

			addColBtn.addEventListener("click", function() {
				console.log("inserting col")
				HTMLTableRenderer.insertCol(t, htr)
			});
		});
	}
}

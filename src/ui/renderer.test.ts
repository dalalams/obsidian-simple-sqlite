import { HTMLTableRenderer, RenderCallbacks, TableView } from './renderer';
import { TableData } from '../core/table';
import { ColumnSchema } from '../db/schema_provider';

jest.mock('obsidian', () => ({
    setIcon: jest.fn(),
    setTooltip: jest.fn(),
}));

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

describe('HTMLTableRenderer', () => {
    let renderer: HTMLTableRenderer;
    let el: HTMLElement;
    let callbacks: RenderCallbacks;
    let schema: ReadonlyArray<ColumnSchema>;
    let data: TableData;

    beforeEach(() => {
        renderer = new HTMLTableRenderer();
        el = document.createElement('div');

        callbacks = {
            onCellBlur: jest.fn(),
            onSave: jest.fn(),
            onAddRow: jest.fn(),
            onAddCol: jest.fn(),
        };

        schema = [
            { name: 'id', type: 'INTEGER', isPrimaryKey: true, notNull: true, tableName: 'test' },
            { name: 'name', type: 'TEXT', isPrimaryKey: false, notNull: false, tableName: 'test' },
        ];

        data = {
            columns: ['id', 'name'],
            values: [[1, 'Alice'], [2, 'Bob']],
            schema,
        };
    });

    describe('render', () => {
        it('should create table structure', () => {
            renderer.render(el, data, callbacks);

            expect(el.querySelector('table')).toBeTruthy();
            expect(el.querySelector('thead')).toBeTruthy();
            expect(el.querySelector('tbody')).toBeTruthy();
        });

        it('should render column headers', () => {
            renderer.render(el, data, callbacks);

            const headers = el.querySelectorAll('th');
            expect(headers).toHaveLength(2);
            expect(headers[0].textContent).toBe('id');
            expect(headers[1].textContent).toBe('name');
        });

        it('should mark primary key header', () => {
            renderer.render(el, data, callbacks);

            const headers = el.querySelectorAll('th');
            expect(headers[0].classList.contains('primary-key')).toBe(true);
            expect(headers[1].classList.contains('primary-key')).toBe(false);
        });

        it('should render data rows', () => {
            renderer.render(el, data, callbacks);

            const rows = el.querySelectorAll('tbody tr');
            expect(rows).toHaveLength(2);

            const firstRowCells = rows[0].querySelectorAll('td');
            expect(firstRowCells[0].textContent).toBe('1');
            expect(firstRowCells[1].textContent).toBe('Alice');
        });

        it('should make primary key cells readonly', () => {
            renderer.render(el, data, callbacks);

            const cells = el.querySelectorAll('tbody td');
            expect(cells[0].contentEditable).toBe('false');
            expect(cells[0].classList.contains('readonly')).toBe(true);
            expect(cells[1].contentEditable).toBe('true');
        });
    });

    describe('callbacks', () => {
        it('should call onCellBlur when editable cell blurs', () => {
            renderer.render(el, data, callbacks);

            const editableCell = el.querySelectorAll('tbody td')[1]; 
            editableCell.textContent = 'Alicia';
            editableCell.dispatchEvent(new Event('blur'));

            expect(callbacks.onCellBlur).toHaveBeenCalledWith(0, 1, 'Alicia');
        });

        it('should not call onCellBlur for primary key cells', () => {
            renderer.render(el, data, callbacks);

            const pkCell = el.querySelectorAll('tbody td')[0];
            pkCell.dispatchEvent(new Event('blur'));

            expect(callbacks.onCellBlur).not.toHaveBeenCalled();
        });

        it('should call onSave when save button clicked', () => {
            renderer.render(el, data, callbacks);

            const saveBtn = el.querySelector('.sqlite-save-btn') as HTMLElement;
            saveBtn.click();

            expect(callbacks.onSave).toHaveBeenCalled();
        });

        it('should call onAddRow when add row button clicked', () => {
            renderer.render(el, data, callbacks);

            const addRowBtn = el.querySelector('.table-row-btn') as HTMLElement;
            addRowBtn.click();

            expect(callbacks.onAddRow).toHaveBeenCalled();
        });

        it('should call onAddCol with name when add column button clicked', () => {
            global.prompt = jest.fn().mockReturnValue('age');
            renderer.render(el, data, callbacks);

            const addColBtn = el.querySelector('.table-col-btn') as HTMLElement;
            addColBtn.click();

            expect(callbacks.onAddCol).toHaveBeenCalledWith('age');
        });
    });

    describe('TableView', () => {
        let view: TableView;

        beforeEach(() => {
            view = renderer.render(el, data, callbacks);
        });

        describe('updateCellState', () => {
            it('should add modified class', () => {
                view.updateCellState(0, 1, { isModified: true, error: null });

                const cell = el.querySelectorAll('tbody td')[1];
                expect(cell.classList.contains('modified')).toBe(true);
            });

            it('should add error class and title', () => {
                view.updateCellState(0, 1, { 
                    isModified: false, 
                    error: { message: 'Invalid value' } 
                });

                const cell = el.querySelectorAll('tbody td')[1];
                expect(cell.classList.contains('cell-error')).toBe(true);
                expect(cell.title).toBe('Invalid value');
            });

            it('should remove classes when state cleared', () => {
                view.updateCellState(0, 1, { isModified: true, error: { message: 'Error' } });
                view.updateCellState(0, 1, { isModified: false, error: null });

                const cell = el.querySelectorAll('tbody td')[1];
                expect(cell.classList.contains('modified')).toBe(false);
                expect(cell.classList.contains('cell-error')).toBe(false);
                expect(cell.title).toBe('');
            });
        });

        describe('showErrors', () => {
            it('should highlight multiple error cells', () => {
                view.showErrors([
                    { rowIdx: 0, colIdx: 1, colName: 'name', message: 'Error 1', severity: 'error' },
                    { rowIdx: 1, colIdx: 1, colName: 'name', message: 'Error 2', severity: 'error' },
                ]);

                const cells = el.querySelectorAll('tbody td');
                expect(cells[1].classList.contains('cell-error')).toBe(true);
                expect(cells[1].title).toBe('Error 1');
                expect(cells[3].classList.contains('cell-error')).toBe(true);
                expect(cells[3].title).toBe('Error 2');
            });
        });

        describe('clearErrors', () => {
            it('should remove all error classes', () => {
                view.showErrors([
                    { rowIdx: 0, colIdx: 1, colName: 'name', message: 'Error', severity: 'error' },
                ]);
                view.clearErrors();

                const cells = el.querySelectorAll('tbody td');
                cells.forEach(cell => {
                    expect(cell.classList.contains('cell-error')).toBe(false);
                });
            });
        });

        describe('clearModified', () => {
            it('should remove all modified classes', () => {
                view.updateCellState(0, 1, { isModified: true, error: null });
                view.updateCellState(1, 1, { isModified: true, error: null });
                view.clearModified();

                const cells = el.querySelectorAll('tbody td');
                cells.forEach(cell => {
                    expect(cell.classList.contains('modified')).toBe(false);
                });
            });
        });

        describe('showMessage', () => {
            it('should show error message', () => {
                view.showMessage('Something went wrong', 'error');

                const banner = el.querySelector('.sqlite-message-banner');
                expect(banner?.textContent).toBe('Something went wrong');
                expect(banner?.classList.contains('error')).toBe(true);
                expect(banner?.classList.contains('hidden')).toBe(false);
            });

            it('should auto-hide success message', () => {
                jest.useFakeTimers();
                view.showMessage('Saved!', 'success');

                const banner = el.querySelector('.sqlite-message-banner');
                expect(banner?.classList.contains('hidden')).toBe(false);

                jest.advanceTimersByTime(3000);
                expect(banner?.classList.contains('hidden')).toBe(true);

                jest.useRealTimers();
            });
        });

        describe('destroy', () => {
            it('should remove table from DOM', () => {
                view.destroy();

                expect(el.querySelector('.cm-table-widget')).toBeFalsy();
            });
        });
    });
});

import { addColumn, addRow, removeColumn, removeRow, setCellDoc, toggleHeaderRow } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { TableBlock } from '../types';
import type { BlockViewProps } from './types';
import { TableCellEditor } from './TableCellEditor';
import './table.css';

/**
 * Cell-level rich text and row/column add/remove are built. Explicitly
 * deferred (§4.5 lists these too, but they're a bigger UI lift each, and
 * nothing in the phase-2 acceptance bar needs them): merge/split (colspan/
 * rowspan stay 1 for every cell created here), column resize (a draggable
 * divider — same gap `ColumnsBlock` has), and per-cell style (no settings
 * popover exists yet — see the phase-2 "known up front" notes).
 */
export function TableBlockView({ pageId, block, selected }: BlockViewProps<TableBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const rowCount = block.rows.length;
	const columnCount = block.columnWidths.length;

	// Generic over the event type so the same helper covers both the toolbar
	// buttons' onClick (MouseEvent) and the header-row checkbox's onChange
	// (ChangeEvent) — both just need stopPropagation() before it bubbles up
	// to the table block's own SortableBlock and re-selects it.
	function stopAnd<E extends { stopPropagation: () => void }>(action: () => void) {
		return (e: E) => {
			e.stopPropagation();
			action();
		};
	}

	return (
		<div className="block-table-wrapper">
			<table className="block-table">
				<colgroup>
					{block.columnWidths.map((width, columnIndex) => (
						<col key={columnIndex} style={{ width: `${width * 100}%` }} />
					))}
				</colgroup>
				<tbody>
					{block.rows.map((row, rowIndex) => (
						<tr key={rowIndex} className={block.headerRow && rowIndex === 0 ? 'block-table-header-row' : undefined}>
							{row.cells.map((cell, columnIndex) => (
								<td key={columnIndex}>
									<TableCellEditor
										doc={cell.doc}
										locked={block.locked}
										onChange={(doc) =>
											runCommand(setCellDoc(pageId, block.id, rowIndex, columnIndex, doc), {
												coalesceKey: `${block.id}-${rowIndex}-${columnIndex}`,
											})
										}
										onBlur={endCoalescing}
									/>
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			{selected && !block.locked && (
				<div className="block-table-controls">
					<button type="button" onClick={stopAnd(() => runCommand(addRow(pageId, block.id, rowCount)))}>
						+ Row
					</button>
					<button type="button" disabled={rowCount <= 1} onClick={stopAnd(() => runCommand(removeRow(pageId, block.id, rowCount - 1)))}>
						− Row
					</button>
					<button type="button" onClick={stopAnd(() => runCommand(addColumn(pageId, block.id, columnCount)))}>
						+ Column
					</button>
					<button
						type="button"
						disabled={columnCount <= 1}
						onClick={stopAnd(() => runCommand(removeColumn(pageId, block.id, columnCount - 1)))}
					>
						− Column
					</button>
					<label className="block-table-header-toggle">
						<input type="checkbox" checked={block.headerRow} onChange={stopAnd(() => runCommand(toggleHeaderRow(pageId, block.id)))} />
						Header row
					</label>
				</div>
			)}
		</div>
	);
}

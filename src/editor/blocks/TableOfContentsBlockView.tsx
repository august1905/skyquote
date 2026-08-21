import { setTocLevels } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { TableOfContentsBlock } from '../types';
import { collectHeadings } from '../toc/collectHeadings';
import type { BlockViewProps } from './types';
import './toc.css';

const LEVEL_OPTIONS: { value: number; label: string }[] = [
	{ value: 1, label: 'Heading 1' },
	{ value: 2, label: 'Headings 1–2' },
	{ value: 3, label: 'Headings 1–3' },
];

/**
 * §4.5: "Non-editable rendered list, derived from headings. Live-updates as
 * headings change. Page numbers resolve only after pagination." Entries
 * come from `collectHeadings` (walks every page's blocks, §4.5: "headings
 * feed the TOC"); each entry's page number comes from `editorStore`'s
 * `blockPageNumbers` — a document-wide map `TemplateCanvas.tsx` rebuilds
 * whenever any page's pagination settles (see that file's own comment).
 *
 * §10 point 6 ("run the pagination pass twice… so TOC page numbers reflect
 * the pagination the TOC itself influenced") is satisfied by this app's
 * existing measure-render-measure loop rather than a literal second pass:
 * this block's own rendered height depends only on how many headings exist
 * (known synchronously from `body`, before any page number resolves), not
 * on the resolved page numbers themselves — so there's no real height
 * feedback loop to unwind. If a future revision makes a TOC entry's own
 * layout depend on its resolved page number (e.g. wrapping onto multiple
 * lines once numbers are known), revisit this.
 */
export function TableOfContentsBlockView({ pageId, block, selected }: BlockViewProps<TableOfContentsBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const body = useEditorStore((s) => s.body);
	const blockPageNumbers = useEditorStore((s) => s.blockPageNumbers);
	const editable = selected && !block.locked;

	const entries = body ? collectHeadings(body, block.levels) : [];

	return (
		<div className="block-toc">
			{editable && (
				<div className="toc-toolbar" onClick={(e) => e.stopPropagation()}>
					<label>
						Heading depth
						<select value={block.levels} onChange={(e) => runCommand(setTocLevels(pageId, block.id, Number(e.target.value)))}>
							{LEVEL_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
				</div>
			)}
			<div className="toc-title">Table of Contents</div>
			{entries.length === 0 && <p className="toc-empty">No headings yet — headings you add will appear here.</p>}
			{entries.length > 0 && (
				<ul className="toc-entries">
					{entries.map((entry) => (
						<li key={entry.id} className="toc-entry" style={{ marginLeft: (entry.level - 1) * 16 }}>
							<span className="toc-entry-text">{entry.text || 'Untitled heading'}</span>
							<span className="toc-entry-page">{blockPageNumbers.get(entry.blockId) ?? '–'}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

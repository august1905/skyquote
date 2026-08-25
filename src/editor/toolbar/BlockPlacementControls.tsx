import { clampPlacement, setBlockPlacement } from '../commands';
import { findBlockById } from '../commands/blockTree';
import { measureBlockOnPage } from '../canvas/measureBlockOnPage';
import { pageDimensions } from '../pagination/pageDimensions';
import { defaultPageSettings } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { BlockPlacement } from '../types';

const FIELDS = [
	{ key: 'x', label: 'X', title: 'Distance from the left edge of the page (px)' },
	{ key: 'y', label: 'Y', title: 'Distance from the top edge of the page (px)' },
	{ key: 'width', label: 'W', title: 'Width (px)' },
	{ key: 'height', label: 'H', title: 'Height (px) — leave empty to size to the content' },
] as const;

/**
 * §4.3's placement: pin the selected block at an exact spot on the page, and
 * type the coordinates.
 *
 * The reason this exists rather than more spacing controls: padding and margin
 * can only push a block away from its neighbours, so "the headline sits over
 * *that* band of the background image, 80px from the left" is not something they
 * can express — the block never leaves the column. Reported as margin not moving
 * the container, which it can't; the container is the column.
 *
 * **Pin captures where the block already is**, measured from the DOM, so pinning
 * never teleports it — you pin it, then nudge. Unpin returns it to the flow at
 * its original position in `page.blocks`, which is why placement is a separate
 * field rather than a rewrite of the block's order.
 */
export function BlockPlacementControls() {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const selection = useEditorStore((s) => s.selection);
	const pages = useEditorStore((s) => s.body?.pages);
	const settings = useEditorStore((s) => s.body?.settings ?? defaultPageSettings());

	const blockId = selection?.blockId ?? null;
	const block = blockId && pages ? findBlockById(pages, blockId) : undefined;
	const disabled = !block || !selection || block.locked;
	const placement = block?.placement;
	const { width: pageWidthPx, height: pageHeightPx } = pageDimensions(settings.pageSize, settings.orientation);

	function write(next: BlockPlacement | undefined) {
		if (!block || !selection) return;
		runCommand(setBlockPlacement(selection.pageId, block.id, next && clampPlacement(next, pageWidthPx, pageHeightPx)), {
			coalesceKey: `placement-${block.id}`,
		});
	}

	function togglePin() {
		if (!block) return;
		if (placement) {
			write(undefined);
			return;
		}
		// Measured rather than defaulted: dropping a pinned block at 0,0 would move
		// it the moment you pinned it, and the first thing you'd have to do is put
		// it back. A block the DOM can't find (never rendered) falls back to a
		// readable box near the top-left rather than refusing.
		write(measureBlockOnPage(block.id, pageWidthPx) ?? { x: 48, y: 48, width: Math.round(pageWidthPx / 2) });
	}

	function setField(key: (typeof FIELDS)[number]['key'], raw: string) {
		if (!placement) return;
		if (key === 'height' && raw === '') {
			// Empty height is a real state — "size to the content" — not zero, and not
			// a present-but-undefined key (`exactOptionalPropertyTypes` forbids that,
			// and a stored `height: undefined` would serialize into the template).
			write({ x: placement.x, y: placement.y, width: placement.width });
			return;
		}
		const px = Number(raw);
		if (!Number.isFinite(px)) return;
		write({ ...placement, [key]: px });
	}

	return (
		<span className="toolbar-spacing-group">
			<button
				type="button"
				className="toolbar-pin-toggle"
				aria-label="Pin block to the page"
				aria-pressed={Boolean(placement)}
				title="Take this block out of the flow and place it anywhere on the page"
				disabled={disabled}
				onClick={togglePin}
			>
				📌 Pin
			</button>
			{FIELDS.map((field) => (
				<input
					key={field.key}
					type="number"
					className="toolbar-spacing-input"
					aria-label={`Position ${field.label}`}
					placeholder={field.label}
					title={field.title}
					// Inert until the block is pinned: an X with nothing to move is a
					// control that lies about what it does.
					disabled={disabled || !placement}
					value={placement?.[field.key] ?? ''}
					onChange={(e) => setField(field.key, e.target.value)}
					onBlur={endCoalescing}
				/>
			))}
		</span>
	);
}

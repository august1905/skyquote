import { setBlockStyle } from '../commands';
import { findBlockById } from '../commands/blockTree';
import { useEditorStore } from '../store/editorStore';
import type { BlockStyle, Spacing } from '../types';

const SIDES = [
	{ key: 'top', label: 'Top', short: 'T' },
	{ key: 'right', label: 'Right', short: 'R' },
	{ key: 'bottom', label: 'Bottom', short: 'B' },
	{ key: 'left', label: 'Left', short: 'L' },
] as const;

const ZERO: Spacing = { top: 0, right: 0, bottom: 0, left: 0 };

/** All four sides at zero is the same as no spacing at all — stored as absent so a cleared block goes back to a clean `{}` rather than carrying a no-op object around in the saved template. */
function normalize(spacing: Spacing): Spacing | undefined {
	return spacing.top || spacing.right || spacing.bottom || spacing.left ? spacing : undefined;
}

/**
 * §4.3's padding and margin, per side, on the toolbar itself.
 *
 * They were behind the block's Settings popover, as a single uniform number for
 * padding and a vertical-only one for margin — so "move this one block 8px left"
 * wasn't expressible at all, and adjusting anything meant opening a popover that
 * covers the block being adjusted. Reported as: these should be on the main bar,
 * so you do not have to press settings.
 *
 * Acts on the selected block whatever its type, including a block nested in a
 * column or inside smart content (`locateBlock` resolves those already). Follows
 * §2's "disable rather than hide" convention: with nothing selected the inputs
 * stay in place, greyed, so the toolbar never reflows as selection changes.
 *
 * Every side is its own field rather than one linked control with a chain toggle:
 * the linked variant is a mode, and a mode you can't see the state of at a glance
 * is worse than four boxes you can read directly.
 */
export function BlockSpacingControls() {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const selection = useEditorStore((s) => s.selection);
	const pages = useEditorStore((s) => s.body?.pages);

	const blockId = selection?.blockId ?? null;
	const block = blockId && pages ? findBlockById(pages, blockId) : undefined;
	// A locked block (§4.3) refuses edits everywhere else; spacing is no different.
	const disabled = !block || !selection || block.locked;

	function update(which: 'padding' | 'margin', side: keyof Spacing, px: number) {
		if (!block || !selection) return;
		const current = block.style[which] ?? ZERO;
		const next = normalize({ ...current, [side]: Math.max(0, px) });
		const patch: BlockStyle = { ...block.style };
		if (next) patch[which] = next;
		else delete patch[which];
		// Keyed per *side*, not per property: with one key for all of "padding",
		// typing a top and then a right without blurring in between would merge into
		// a single undo step, and one Undo would drop both.
		runCommand(setBlockStyle(selection.pageId, block.id, patch), { coalesceKey: `style-${which}-${side}-${block.id}` });
	}

	return (
		<>
			{(['padding', 'margin'] as const).map((which) => (
				<span className="toolbar-spacing-group" key={which}>
					<span className="toolbar-spacing-label">{which === 'padding' ? 'Padding' : 'Margin'}</span>
					{SIDES.map((side) => (
						<input
							key={side.key}
							type="number"
							min={0}
							className="toolbar-spacing-input"
							// Read by a screen reader and by `getByLabel`; the visible `T/R/B/L`
							// hint is a placeholder so an empty box still says which side it is.
							aria-label={`${which === 'padding' ? 'Padding' : 'Margin'} ${side.label.toLowerCase()}`}
							placeholder={side.short}
							title={`${which === 'padding' ? 'Padding' : 'Margin'} ${side.label.toLowerCase()} (px)`}
							disabled={disabled}
							value={block?.style[which]?.[side.key] ?? ''}
							onChange={(e) => {
								const px = Number(e.target.value);
								update(which, side.key, Number.isFinite(px) ? px : 0);
							}}
							onBlur={endCoalescing}
						/>
					))}
				</span>
			))}
		</>
	);
}

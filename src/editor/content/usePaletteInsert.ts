import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { clampPlacement, defaultPageSettings, insertBlock, setBlockPlacement } from '../commands';
import { measurePinnedLandingSpot } from '../canvas/measureBlockOnPage';
import { pageDimensions } from '../pagination/pageDimensions';
import { useEditorStore } from '../store/editorStore';
import type { Block } from '../types';
import { resolvePaletteInsert, type InsertTarget, type PaletteDragData } from './palette';

/**
 * The one place a palette tile actually becomes a block on the page.
 *
 * Shared by the Content panel (§4.1 path 2, a click), `EditorDndProvider`
 * (path 1, a drop) and the canvas's own "+ Add block" menu (via `PageFrame`) so
 * the paths can't drift — the same nesting rules, the same "Image and Video need
 * input first" detour, the same selection afterwards, and the same
 * pinned-on-arrival behaviour.
 */
export function usePaletteInsert() {
	const body = useEditorStore((s) => s.body);
	const runCommand = useEditorStore((s) => s.runCommand);
	const select = useEditorStore((s) => s.select);
	const setPalettePlacement = useEditorStore((s) => s.setPalettePlacement);

	/**
	 * Inserts an already-built block — the tail end of an Image/Video placement,
	 * once the picker or URL has produced one.
	 *
	 * **A new top-level block arrives pinned** (Grayson, 2026-09-02: "Items in the
	 * template editor should be 'pinned' by default with the movable position. I
	 * always want to move them like that."), captured at the spot it landed so
	 * pinning never teleports it — the same rule the toolbar's Pin toggle follows.
	 * Insert and pin share one coalesce key, so a single undo removes the block
	 * rather than stranding an unpinned copy.
	 *
	 * `flushSync`, and it is load-bearing, not an optimization. Measuring needs
	 * the block in the DOM, and the first version waited a `requestAnimationFrame`
	 * for that — which opened a real race: the block paints in the flow, then
	 * remounts as a placed block a frame later, so a click landing between the
	 * two (typing into a fresh text block, a fast Cmd+S taking its save snapshot)
	 * hit a component that was about to be torn down. Keystrokes vanished and a
	 * save was re-dirtied mid-flight. Committing the insert synchronously and
	 * pinning in the same task means the block never paints unpinned and there is
	 * no gap to race.
	 *
	 * Two deliberate exceptions. A block inside a column or smart-content
	 * container stays in the flow — placement is a page-level concept, and §4.4's
	 * containers lay their children out themselves. And a `page_break` exists
	 * purely to split the flow, so pinning it would erase its meaning.
	 */
	const insertBlockAt = useCallback(
		(block: Block, target: InsertTarget) => {
			const coalesceKey = `insert-${block.id}`;
			flushSync(() => {
				runCommand(insertBlock(target.container, target.index, block), { coalesceKey });
			});
			if (!target.container.parent && block.type !== 'page_break') {
				const body = useEditorStore.getState().body;
				const settings = body?.settings ?? defaultPageSettings();
				const { width, height } = pageDimensions(settings.pageSize, settings.orientation);
				const landing = measurePinnedLandingSpot(block.id, width, body?.settings.theme?.baseSpacing ?? 16);
				if (landing) {
					runCommand(setBlockPlacement(target.container.pageId, block.id, clampPlacement(landing, width, height)), { coalesceKey });
				}
			}
			// Selected on arrival: the new block's toolbar is the likely next action,
			// and — now that it arrives pinned — selection is also what shows the move
			// handle, so "drag it where you want it" works immediately.
			select({ pageId: target.container.pageId, blockId: block.id });
		},
		[runCommand, select]
	);

	const insertPaletteItem = useCallback(
		(drag: PaletteDragData, target: InsertTarget) => {
			if (!body) return;
			const resolution = resolvePaletteInsert(drag, body);
			if (resolution.status === 'unavailable') {
				setPalettePlacement({ status: 'error', message: resolution.reason });
				return;
			}
			if (resolution.status === 'needsInput') {
				setPalettePlacement({ status: 'needsInput', blockType: resolution.blockType, target });
				return;
			}
			setPalettePlacement(null);
			insertBlockAt(resolution.block, target);
		},
		[body, insertBlockAt, setPalettePlacement]
	);

	return { insertPaletteItem, insertBlockAt };
}

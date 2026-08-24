import { useCallback } from 'react';
import { insertBlock } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { Block } from '../types';
import { resolvePaletteInsert, type InsertTarget, type PaletteDragData } from './palette';

/**
 * The one place a palette tile actually becomes a block on the page.
 *
 * Shared by the Content panel (§4.1 path 2, a click) and `EditorDndProvider`
 * (path 1, a drop) so the two paths can't drift — the same nesting rules, the
 * same "Image and Video need input first" detour, the same selection afterwards.
 */
export function usePaletteInsert() {
	const body = useEditorStore((s) => s.body);
	const runCommand = useEditorStore((s) => s.runCommand);
	const select = useEditorStore((s) => s.select);
	const setPalettePlacement = useEditorStore((s) => s.setPalettePlacement);

	/** Inserts an already-built block — the tail end of an Image/Video placement, once the picker or URL has produced one. */
	const insertBlockAt = useCallback(
		(block: Block, target: InsertTarget) => {
			runCommand(insertBlock(target.container, target.index, block));
			// Selected on arrival: the new block's toolbar is the likely next action,
			// and it's confirmation of where it landed — which matters most for a
			// drop, where "where" was the whole point of the gesture.
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

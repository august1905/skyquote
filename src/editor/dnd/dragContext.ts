import { createContext, useContext } from 'react';
import type { BlockType } from '../types';
import type { PaletteDragData } from '../content/palette';

/**
 * What the canvas needs to know about a drag in progress, published by
 * `EditorDndProvider`.
 *
 * Split into two contexts on purpose. The active drag changes exactly twice per
 * drag (start, end) and is read by every drop region to decide whether it's a
 * candidate at all; the drop hint changes as the pointer crosses block
 * midpoints and is read by every block. One combined context would re-render
 * every drop region on every midpoint crossing — with a Tiptap editor inside
 * each text block, that's not free.
 */
export const ActivePaletteDragContext = createContext<PaletteDragData | null>(null);

/** §4.1's "horizontal insertion indicator between blocks" — which block it sits against, and which side. */
export interface PaletteDropHint {
	blockId: string;
	insertBefore: boolean;
}

export const PaletteDropHintContext = createContext<PaletteDropHint | null>(null);

/** Null unless a palette tile is being dragged right now. */
export function useActivePaletteDrag(): PaletteDragData | null {
	return useContext(ActivePaletteDragContext);
}

export function usePaletteDropHint(): PaletteDropHint | null {
	return useContext(PaletteDropHintContext);
}

/**
 * The `BlockType` a palette drag would produce — a field tile always produces a
 * `FieldBlock`, whatever its field type. Used for §4.4's nesting check, which
 * cares about the block, not the field inside it.
 */
export function paletteDragBlockType(drag: PaletteDragData): BlockType {
	return drag.kind === 'paletteBlock' ? drag.blockType : 'field';
}

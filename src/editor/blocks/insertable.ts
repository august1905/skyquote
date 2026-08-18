import type { Block, BlockType } from '../types';
import { createBlankTextBlock, createColumnsBlock, createImageBlock, createPageBreakBlock, createTableBlock } from '../commands';
import { isContainerBlockType } from '../commands/blockTree';
import { assetFileRelativePath, uploadImageAsset } from '../../api/assets';

// Page content is 816px wide minus 48px padding on each side (canvas.css) —
// an upload at its full natural pixel size could badly overflow that, so
// inserted images are scaled down (never up) to fit within it.
const MAX_INSERTED_IMAGE_WIDTH = 320;

function scaleToFit(width: number, height: number, maxWidth: number): { width: number; height: number } {
	if (width <= maxWidth) return { width, height };
	const scale = maxWidth / width;
	return { width: maxWidth, height: Math.round(height * scale) };
}

async function createImageBlockFromFile(file: File): Promise<Block> {
	const asset = await uploadImageAsset(file);
	const naturalWidth = asset.width ?? MAX_INSERTED_IMAGE_WIDTH;
	const naturalHeight = asset.height ?? MAX_INSERTED_IMAGE_WIDTH;
	const { width, height } = scaleToFit(naturalWidth, naturalHeight, MAX_INSERTED_IMAGE_WIDTH);
	return createImageBlock({ assetId: asset.id, url: assetFileRelativePath(asset.id), alt: '', width, height });
}

export interface InsertableBlockKind {
	type: BlockType;
	label: string;
	/** Exactly one of `create`/`createFromFile` is set, matched by whether the block type can be synthesized blank or needs a source file first — see `ImageBlock`'s entry below. */
	create?: () => Block;
	/** File-picker-driven creation (currently just Image) — `AddBlockMenu` renders these as a hidden file input instead of a plain button, and awaits the upload before inserting. */
	createFromFile?: (file: File) => Promise<Block>;
	/** Passed through to the file input's `accept` attribute; only meaningful alongside `createFromFile`. */
	fileAccept?: string;
}

/**
 * Block types offered by the canvas's own "+ Add block" menu — deliberately
 * a separate, explicit list from the block registry. Every `Block` type is
 * registered (even the unsupported ones, so existing data still renders),
 * but only types with a sensible "create one blank" factory belong here.
 * Add an entry as each block type's real editing support lands (§15's phase
 * order), not just its view.
 */
export const INSERTABLE_BLOCK_KINDS: InsertableBlockKind[] = [
	{ type: 'text', label: 'Text', create: createBlankTextBlock },
	{ type: 'page_break', label: 'Page break', create: createPageBreakBlock },
	{ type: 'columns', label: 'Columns (2)', create: () => createColumnsBlock(2) },
	{ type: 'table', label: 'Table (2×2)', create: () => createTableBlock(2, 2) },
	{ type: 'image', label: 'Image', createFromFile: createImageBlockFromFile, fileAccept: 'image/png,image/jpeg,image/gif,image/webp' },
];

/**
 * Same list, minus anything that would nest a container inside a container —
 * for the "+ Add block" menu rendered *inside* a column. `insertBlock`
 * already throws on this (§4.4 caps nesting at depth 2), so this is a UX
 * nicety on top of a real enforced boundary, not the boundary itself.
 */
export const COLUMN_INSERTABLE_BLOCK_KINDS: InsertableBlockKind[] = INSERTABLE_BLOCK_KINDS.filter(
	(kind) => !isContainerBlockType(kind.type)
);

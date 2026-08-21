import type { Block, BlockType, FieldType, FillableField, RoleId } from '../types';
import {
	createBlankTextBlock,
	createColumnsBlock,
	createField,
	createFieldBlock,
	createImageBlock,
	createPageBreakBlock,
	createPricingTableBlock,
	createQuoteBuilderBlock,
	createTableBlock,
	createTocBlock,
	createVideoBlock,
} from '../commands';
import { isContainerBlockType } from '../commands/blockTree';
import { assetFileRelativePath, uploadImageAsset } from '../../api/assets';
import { fetchOEmbed } from './videoEmbed';
import { FIELD_TYPES, FIELD_TYPE_LABELS } from '../fields/fieldTypes';

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

async function createVideoBlockFromUrl(url: string): Promise<Block> {
	const { provider, thumbnailUrl } = await fetchOEmbed(url);
	return createVideoBlock({ provider, url, thumbnailUrl });
}

export interface InsertableBlockKind {
	type: BlockType;
	label: string;
	/** Exactly one of `create`/`createFromFile`/`createFromUrl` is set, matched by whether the block type can be synthesized blank, needs a source file first, or needs a pasted URL resolved first — see the Image/Video entries below. */
	create?: () => Block;
	/** File-picker-driven creation (currently just Image) — `AddBlockMenu` renders these as a hidden file input instead of a plain button, and awaits the upload before inserting. */
	createFromFile?: (file: File) => Promise<Block>;
	/** Passed through to the file input's `accept` attribute; only meaningful alongside `createFromFile`. */
	fileAccept?: string;
	/** URL-driven creation (currently just Video) — `AddBlockMenu` renders these as an inline text input + submit button instead of a plain button. */
	createFromUrl?: (url: string) => Promise<Block>;
	/** Placeholder text for the URL input; only meaningful alongside `createFromUrl`. */
	urlPlaceholder?: string;
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
	{ type: 'toc', label: 'Table of contents', create: createTocBlock },
	{ type: 'columns', label: 'Columns (2)', create: () => createColumnsBlock(2) },
	{ type: 'table', label: 'Table (2×2)', create: () => createTableBlock(2, 2) },
	{ type: 'pricing_table', label: 'Pricing table', create: createPricingTableBlock },
	{ type: 'quote_builder', label: 'Quote builder', create: createQuoteBuilderBlock },
	{ type: 'image', label: 'Image', createFromFile: createImageBlockFromFile, fileAccept: 'image/png,image/jpeg,image/gif,image/webp' },
	{
		type: 'video',
		label: 'Video',
		createFromUrl: createVideoBlockFromUrl,
		urlPlaceholder: 'Paste a YouTube or Vimeo URL',
	},
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

/**
 * §3's "FILLABLE FIELDS FOR" palette — standalone placement (§6.2), a
 * `FieldBlock` per §6.3's ten types. A separate list/interface from
 * `InsertableBlockKind` rather than folding fields into it: every field kind
 * needs a target `roleId` at creation time (never optional, §6.1 rule 1),
 * which no other insertable kind does — `AddBlockMenu` renders these under
 * their own role-selector, not the plain block list.
 */
export interface InsertableFieldKind {
	fieldType: FieldType;
	label: string;
}

export const INSERTABLE_FIELD_KINDS: InsertableFieldKind[] = FIELD_TYPES.map((fieldType) => ({ fieldType, label: FIELD_TYPE_LABELS[fieldType] }));

export function createFieldBlockOfType(fieldType: FieldType, roleId: RoleId, existingFields: FillableField[]): Block {
	return createFieldBlock(createField(fieldType, roleId, existingFields));
}

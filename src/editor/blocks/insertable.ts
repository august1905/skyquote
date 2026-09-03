import type { Block, BlockType, FieldType, FillableField, RoleId } from '../types';
import {
	createBlankTextBlock,
	createColumnsBlock,
	createField,
	createFieldBlock,
	createImageBlock,
	createPageBreakBlock,
	createSpacerBlock,
	createPricingTableBlock,
	createQuoteBuilderBlock,
	createSmartContentBlock,
	createTableBlock,
	createTocBlock,
	createVideoBlock,
} from '../commands';
import { isContainerBlockType } from '../commands/blockTree';
import { assetFileRelativePath, type UploadedAsset } from '../../api/assets';
import { MAX_INSERTED_IMAGE_WIDTH, scaleToFit } from '../../images/imageLibrary';
import { fetchOEmbed } from './videoEmbed';
import { FIELD_TYPES, FIELD_TYPE_LABELS } from '../fields/fieldTypes';

/**
 * An `ImageBlock` for a library image.
 *
 * Sizing is scale-down-only (`scaleToFit`) — page content is 816px wide minus
 * 48px of padding each side, so a photo at its natural pixel size would badly
 * overflow it, while a 40px logo blown up to 320 would look broken.
 *
 * The `?? MAX_INSERTED_IMAGE_WIDTH` fallback covers an asset whose dimensions
 * are null. That shouldn't happen for an image (the upload route reads them
 * before inserting the row), but a square default beats `NaN` in a width
 * attribute.
 */
export function createImageBlockFromAsset(asset: UploadedAsset): Block {
	const naturalWidth = asset.width ?? MAX_INSERTED_IMAGE_WIDTH;
	const naturalHeight = asset.height ?? MAX_INSERTED_IMAGE_WIDTH;
	const { width, height } = scaleToFit(naturalWidth, naturalHeight);
	return createImageBlock({ assetId: asset.id, url: assetFileRelativePath(asset.id), alt: '', width, height });
}

async function createVideoBlockFromUrl(url: string): Promise<Block> {
	const { provider, thumbnailUrl } = await fetchOEmbed(url);
	return createVideoBlock({ provider, url, thumbnailUrl });
}

export interface InsertableBlockKind {
	type: BlockType;
	label: string;
	/** Exactly one of `create`/`picksFromLibrary`/`createFromUrl` is set, matched by whether the block type can be synthesized blank, needs something chosen first, or needs a pasted URL resolved first — see the Image/Video entries below. */
	create?: () => Block;
	/**
	 * Needs something picked before a block exists (currently just Image).
	 * `AddBlockMenu` renders these as a plain button that opens the library picker.
	 *
	 * This replaced a `createFromFile` file-input flow on 2026-08-22: inserting an
	 * image *was* an upload, so the same logo got re-uploaded once per template and
	 * nothing was reusable. See `images/ImageLibraryPicker`.
	 */
	picksFromLibrary?: boolean;
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
	{ type: 'spacer', label: 'Spacer', create: () => createSpacerBlock() },
	{ type: 'toc', label: 'Table of contents', create: createTocBlock },
	{ type: 'smart_content', label: 'Smart content', create: () => createSmartContentBlock() },
	{ type: 'columns', label: 'Columns (2)', create: () => createColumnsBlock(2) },
	{ type: 'table', label: 'Table (2×2)', create: () => createTableBlock(2, 2) },
	{ type: 'pricing_table', label: 'Package selection', create: createPricingTableBlock },
	{ type: 'quote_builder', label: 'Quote builder', create: createQuoteBuilderBlock },
	{ type: 'image', label: 'Image', picksFromLibrary: true },
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

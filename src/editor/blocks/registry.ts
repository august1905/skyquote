import type { ComponentType } from 'react';
import type { Block, BlockType } from '../types';
import type { BlockRegistryEntry, BlockViewProps } from './types';
import { TextBlockView } from './TextBlockView';
import { PageBreakBlockView } from './PageBreakBlockView';
import { SpacerBlockView } from './SpacerBlockView';
import { ColumnsBlockView } from './ColumnsBlockView';
import { TableBlockView } from './TableBlockView';
import { ImageBlockView } from './ImageBlockView';
import { VideoBlockView } from './VideoBlockView';
import { FieldBlockView } from './FieldBlockView';
import { PricingTableBlockView } from './PricingTableBlockView';
import { QuoteBuilderBlockView } from './QuoteBuilderBlockView';
import { TableOfContentsBlockView } from './TableOfContentsBlockView';
import { SmartContentBlockView } from './SmartContentBlockView';
import { UnsupportedBlockView } from './UnsupportedBlockView';

// UnsupportedBlockView only ever reads `block.type`, which every Block union
// member has via BlockBase — structurally sound for any B. TS's strict
// function-prop variance can't see that through the generic, hence the cast.
function unsupported<B extends Block>(label: string): BlockRegistryEntry<B> {
	return { label, View: UnsupportedBlockView as ComponentType<BlockViewProps<B>> };
}

/**
 * One entry per member of the `Block` union, typed so a missing key is a
 * compile error against `BlockType` rather than a runtime gap discovered when
 * someone forgets a `case` in a `switch (block.type)` somewhere in the canvas,
 * toolbar, or library panel. Block types not yet built register the shared
 * unsupported stub per §15's phase gating — each phase upgrades a few.
 */
const registry: { [K in BlockType]: BlockRegistryEntry<Extract<Block, { type: K }>> } = {
	text: { label: 'Text', View: TextBlockView },
	image: { label: 'Image', View: ImageBlockView },
	video: { label: 'Video', View: VideoBlockView },
	table: { label: 'Table', View: TableBlockView },
	pricing_table: { label: 'Pricing table', View: PricingTableBlockView },
	quote_builder: { label: 'Quote builder', View: QuoteBuilderBlockView },
	toc: { label: 'Table of contents', View: TableOfContentsBlockView },
	page_break: { label: 'Page break', View: PageBreakBlockView },
	spacer: { label: 'Spacer', View: SpacerBlockView },
	smart_content: { label: 'Smart content', View: SmartContentBlockView },
	columns: { label: 'Columns', View: ColumnsBlockView },
	field: { label: 'Field', View: FieldBlockView },
};

/**
 * Blocks are read back out of Stratus JSON — a serialization boundary, unlike
 * the command system's ids which never come from outside the app. A block
 * type an older deployed frontend doesn't recognize (added by a newer
 * version, or corrupted data) is a real scenario here, not a programming
 * error, so this degrades to the unsupported view instead of throwing.
 */
export function getBlockRegistryEntry(type: string): BlockRegistryEntry {
	const entry = (registry as Record<string, BlockRegistryEntry>)[type];
	return entry ?? unsupported(type);
}

export function blockTypeLabel(type: BlockType): string {
	return registry[type].label;
}

export function allBlockTypes(): BlockType[] {
	return Object.keys(registry) as BlockType[];
}

import type { ComponentType } from 'react';
import type { Block, BlockType } from '../types';
import type { BlockRegistryEntry, BlockViewProps } from './types';
import { TextBlockView } from './TextBlockView';
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
 * toolbar, or library panel. Only `text` has a real view for phase 1 — the
 * rest register a stub per §15's phase gating.
 */
const registry: { [K in BlockType]: BlockRegistryEntry<Extract<Block, { type: K }>> } = {
	text: { label: 'Text', View: TextBlockView },
	image: unsupported('Image'),
	video: unsupported('Video'),
	table: unsupported('Table'),
	pricing_table: unsupported('Pricing table'),
	quote_builder: unsupported('Quote builder'),
	toc: unsupported('Table of contents'),
	page_break: unsupported('Page break'),
	smart_content: unsupported('Smart content'),
	columns: unsupported('Columns'),
	field: unsupported('Field'),
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

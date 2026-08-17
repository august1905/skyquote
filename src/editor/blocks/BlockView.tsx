import type { BlockViewProps } from './types';
import { getBlockRegistryEntry } from './registry';

export function BlockView({ pageId, block, selected }: BlockViewProps) {
	const { View } = getBlockRegistryEntry(block.type);
	return <View pageId={pageId} block={block} selected={selected} />;
}

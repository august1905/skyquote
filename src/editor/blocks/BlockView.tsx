import type { BlockViewProps } from './types';
import { getBlockRegistryEntry } from './registry';

export function BlockView({ block, selected }: BlockViewProps) {
	const { View } = getBlockRegistryEntry(block.type);
	return <View block={block} selected={selected} />;
}

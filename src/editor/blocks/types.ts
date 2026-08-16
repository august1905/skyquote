import type { ComponentType } from 'react';
import type { Block } from '../types';

export interface BlockViewProps<B extends Block = Block> {
	block: B;
	selected: boolean;
}

export interface BlockRegistryEntry<B extends Block = Block> {
	label: string;
	View: ComponentType<BlockViewProps<B>>;
}

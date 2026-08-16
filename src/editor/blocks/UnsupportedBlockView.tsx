import type { BlockViewProps } from './types';

export function UnsupportedBlockView({ block }: BlockViewProps) {
	return (
		<div className="block-unsupported" data-block-type={block.type}>
			{`"${block.type}" blocks aren't supported yet.`}
		</div>
	);
}

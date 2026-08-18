import type { PageBreakBlock } from '../types';
import type { BlockViewProps } from './types';

// §4.5: "Zero-height marker forcing the next block onto a new physical page."
// Phase 1/2 don't paginate yet (§15 gates real pagination to phase 5), so
// there's no physical page to force a break onto — this just renders the
// marker so the block is placeable, selectable, and reorderable now, ahead
// of pagination actually consuming it later.
export function PageBreakBlockView({ block }: BlockViewProps<PageBreakBlock>) {
	return (
		<div className="block-page-break" data-block-id={block.id}>
			<span>Page break</span>
		</div>
	);
}

import type { PageBreakBlock } from '../types';
import type { BlockViewProps } from './types';

// §4.5: "Zero-height marker forcing the next block onto a new physical page."
// Real pagination (phase 5, §10) now exists — see
// `pagination/distributePages.ts` for where this marker actually forces the
// break. This view itself only ever renders the marker; it carries no
// height/break logic of its own.
export function PageBreakBlockView({ block }: BlockViewProps<PageBreakBlock>) {
	return (
		<div className="block-page-break" data-block-id={block.id}>
			<span>Page break</span>
		</div>
	);
}

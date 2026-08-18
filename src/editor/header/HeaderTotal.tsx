import { computeTotals } from '../../pricing/computeTotals';
import { formatMoney } from '../../pricing/formatMoney';
import { useEditorStore } from '../store/editorStore';

/**
 * §7.4: "The header $375.00 in the reference is the sum across all pricing/
 * quote blocks in the template, using default quantities and default
 * optional-item selections." Hidden entirely rather than showing "$0.00"
 * when the template has no pricing/quote block at all — same "nothing to
 * show" convention `ValidationIndicator` follows for zero issues.
 */
export function HeaderTotal() {
	const body = useEditorStore((s) => s.body);
	if (!body) return null;

	const totals = computeTotals(body);
	if (totals.blocks.length === 0) return null;

	return (
		<span className="template-editor-header-total" title="Sum of every pricing/quote block, at default quantities and selections">
			{formatMoney(totals.total, totals.currency)}
		</span>
	);
}

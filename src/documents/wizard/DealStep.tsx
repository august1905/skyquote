import { useEffect, useState } from 'react';
import { listCrmDeals, type CrmDealSummary } from '../../api/zohoCrm';
import { formatMoney } from '../../pricing/formatMoney';
import { money } from '../../editor/types';

interface DealStepProps {
	/** The deal already chosen, so coming back to this step shows which one. */
	selectedId: string | null;
	/** Choosing advances the wizard — the caller reads the full deal, which is why it also reports `loading`. */
	onChoose: (deal: CrmDealSummary) => void;
	/** Leaves every variable to be typed by hand, exactly as document creation worked before the CRM existed. */
	onSkip: () => void;
	/** The document's currency, for deals in a CRM org that doesn't have multi-currency turned on. */
	currency: string;
	loading: boolean;
	error: string | null;
}

/** Zoho's `word` search rejects a single character, and one letter would match most of a CRM anyway. Mirrors `crmDeals.js`'s own `MIN_SEARCH_LENGTH`. */
const MIN_SEARCH_LENGTH = 2;

/**
 * Which Zoho CRM deal this document is for.
 *
 * The second of the two questions `Create document` asks, and the one that fills
 * the merge fields: the chosen deal's contact, account, amount, stage, close
 * date and owner all land in the Variables step prefilled (see
 * `dealVariableValues`), and its primary contact becomes the first recipient.
 *
 * **Always skippable, including when the CRM is unreachable.** The deal is an
 * accelerator, not a dependency — a broken connection, a revoked token or a
 * customer who simply isn't in the CRM yet must never be a reason a quote can't
 * be written. Skipping lands on exactly the flow that existed before this step
 * did: type the values in.
 */
export function DealStep({ selectedId, onChoose, onSkip, currency, loading, error }: DealStepProps) {
	const [deals, setDeals] = useState<CrmDealSummary[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [query, setQuery] = useState('');
	const [searching, setSearching] = useState(false);

	// Debounced: this reaches a third-party API over the network, so a request per
	// keystroke would be both slow and rude to Zoho's rate limit. A query under
	// the minimum length falls back to the recent list rather than searching for
	// something Zoho would reject.
	useEffect(() => {
		const term = query.trim();
		const effective = term.length >= MIN_SEARCH_LENGTH ? term : '';
		let cancelled = false;
		setSearching(true);
		const timer = window.setTimeout(() => {
			listCrmDeals(effective)
				.then((result) => {
					if (cancelled) return;
					setDeals(result.deals);
					setLoadError(null);
				})
				.catch((err: unknown) => {
					if (cancelled) return;
					setDeals([]);
					setLoadError(err instanceof Error ? err.message : 'Could not reach Zoho CRM.');
				})
				.finally(() => {
					if (!cancelled) setSearching(false);
				});
		}, 300);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [query]);

	return (
		<div className="wizard-step">
			<label className="wizard-field">
				Search deals
				<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Deal, company or contact name" autoFocus />
			</label>

			{loadError && (
				<div className="wizard-error" role="alert">
					<p>{loadError}</p>
					<p className="wizard-hint">You can still create this document — continue without a deal and fill the values in yourself.</p>
				</div>
			)}
			{error && (
				<p className="wizard-error" role="alert">
					{error}
				</p>
			)}
			{!deals && !loadError && <p className="wizard-hint">Loading deals from Zoho CRM…</p>}
			{deals && deals.length === 0 && !loadError && !searching && (
				<p className="wizard-hint">{query.trim().length >= MIN_SEARCH_LENGTH ? 'No deal matches that.' : 'No deals in the CRM yet.'}</p>
			)}

			<ul className="wizard-picker-list">
				{(deals ?? []).map((deal) => (
					<li key={deal.id}>
						<button
							type="button"
							className={`wizard-picker-row${deal.id === selectedId ? ' wizard-picker-row-selected' : ''}`}
							onClick={() => onChoose(deal)}
							disabled={loading}
						>
							<span className="wizard-picker-title">{deal.name || 'Untitled deal'}</span>
							<span className="wizard-picker-meta">{describeDeal(deal, currency)}</span>
						</button>
					</li>
				))}
			</ul>

			{loading && <p className="wizard-hint">Reading the deal…</p>}
			<button type="button" className="wizard-skip-button" onClick={onSkip} disabled={loading}>
				Continue without a deal
			</button>
		</div>
	);
}

/** The one line under a deal's name in the picker: who it's for, what it's worth, where it is. Assembled from whatever the CRM actually has rather than printing empty labels. */
function describeDeal(deal: CrmDealSummary, currency: string): string {
	const parts: string[] = [];
	if (deal.accountName) parts.push(deal.accountName);
	else if (deal.contactName) parts.push(deal.contactName);
	if (deal.amount !== null && Number.isFinite(deal.amount)) parts.push(formatMoney(money(Math.round(deal.amount * 100)), deal.currency || currency));
	if (deal.stage) parts.push(deal.stage);
	return parts.join(' · ');
}

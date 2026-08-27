import { money } from '../../editor/types';
import { formatMoney } from '../../pricing/formatMoney';
import type { CrmDeal } from '../../api/zohoCrm';

/**
 * A chosen Zoho CRM deal, mapped onto this app's variable keys.
 *
 * The result is fed straight into the wizard's existing `variableValues` state
 * rather than through a parallel "CRM data" channel, which is what makes the
 * rest of document creation need no changes at all: `computeResolvedVariableValues`
 * already prefers a wizard value over a default, `resolveTitle` already
 * substitutes into the document's name, and `resolveVariablesInBody` already
 * freezes every chip into literal text. A deal is just a very fast way of
 * filling that form in.
 *
 * Which also means **nothing here is authoritative**. Every value lands in an
 * editable field on the Variables step, so a deal with a stale contact name is a
 * correction, not a dead end.
 *
 * A key is *omitted* rather than set to `''` when the CRM has no value for it —
 * an empty string would read as "the user cleared this on purpose", and the
 * variable would render blank instead of falling back to its default or its
 * visible `[not provided]` placeholder.
 */
export function dealVariableValues(deal: CrmDeal, fallbackCurrency: string): Record<string, string> {
	const values: Record<string, string> = {};
	const set = (key: string, value: string | null | undefined) => {
		const trimmed = (value ?? '').trim();
		if (trimmed) values[key] = trimmed;
	};

	// `Client.*` comes from the deal's related records, not the deal itself: the
	// client is the contact and the company is the account. `contact.name` is
	// preferred over the lookup's own `contactName` because they can disagree —
	// the lookup carries the display name cached on the deal, the contact record
	// carries the current one.
	set('Client.Name', deal.contact?.name || deal.contactName);
	set('Client.Company', deal.accountName);
	set('Client.Email', deal.contact?.email);

	set('Deal.Name', deal.name);
	set('Deal.Amount', formatDealAmount(deal, fallbackCurrency));
	set('Deal.Stage', deal.stage);
	set('Deal.CloseDate', formatDealDate(deal.closingDate));
	set('Deal.Owner', deal.ownerName);

	return values;
}

/**
 * The CRM stores an amount in major units as a float; this app's `formatMoney`
 * wants integer minor units. Rounded at this single boundary rather than
 * carried as a float, so the displayed figure can't drift by a cent from the one
 * the CRM shows.
 *
 * `deal.currency` is only populated when the CRM org has multi-currency turned
 * on, so the document's own currency is the fallback — a quote that says `$` in
 * its pricing table and `€` in a merge field would be worse than one that
 * assumes the org has a single currency, which it does.
 */
function formatDealAmount(deal: CrmDeal, fallbackCurrency: string): string | null {
	if (deal.amount === null || !Number.isFinite(deal.amount)) return null;
	return formatMoney(money(Math.round(deal.amount * 100)), deal.currency || fallbackCurrency);
}

/**
 * `Closing_Date` arrives as a bare `YYYY-MM-DD` with no time and no zone.
 * Rendered through UTC for the same reason `Document.Date` is: parsed in local
 * time, a date west of Greenwich renders as the day before the CRM shows.
 */
function formatDealDate(isoDate: string | null): string | null {
	if (!isoDate) return null;
	const parsed = new Date(`${isoDate}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

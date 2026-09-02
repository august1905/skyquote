import apiFetch from './client';

/**
 * Zoho CRM, read-only. The CRM is the source of truth for deals and this app
 * never writes back to it — there is no create/update call here because there is
 * no route behind one.
 *
 * Shapes come from `utils/crmDeals.js`'s normalizers, not from Zoho: a raw Deal
 * carries dozens of CRM-named columns, and keeping `Closing_Date`/`Account_Name`
 * out of the frontend means a renamed CRM field changes one backend file.
 */

/** What the picker's list shows. Deliberately too thin to create a document from — that needs `getCrmDeal`, which also resolves the contact's email. */
export interface CrmDealSummary {
	id: string;
	name: string;
	/** **Major units** (4500.5 dollars), unlike this app's own `Money`, which is integer cents. Converted at the point of formatting. */
	amount: number | null;
	/** Only set when the CRM org has multi-currency enabled; otherwise the caller falls back to the template's currency. */
	currency: string | null;
	stage: string | null;
	/** `YYYY-MM-DD`, as the CRM stores it — no time, no zone. */
	closingDate: string | null;
	accountName: string | null;
	contactName: string | null;
	modifiedAt: string | null;
}

export interface CrmContact {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
}

export interface CrmDeal extends CrmDealSummary {
	accountId: string | null;
	contactId: string | null;
	ownerName: string | null;
	/** `null` when the deal has no primary contact, or when reading it failed — either way the wizard asks for the recipient's email by hand. */
	contact: CrmContact | null;
}

/** Recently modified deals, or Zoho's own search when `search` is given. A search under two characters is ignored by the backend and returns the recent list instead. */
export function listCrmDeals(search?: string): Promise<{ deals: CrmDealSummary[] }> {
	const query = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
	return apiFetch<{ deals: CrmDealSummary[] }>(`/zoho-crm/deals${query}`);
}

export function getCrmDeal(id: string): Promise<{ deal: CrmDeal }> {
	return apiFetch<{ deal: CrmDeal }>(`/zoho-crm/deals/${encodeURIComponent(id)}`);
}

/** One line of an accepted CRM quote. `price` is **integer cents** — unlike a deal's `amount`, these become `PricingItem.price` directly. */
export interface CrmQuoteItem {
	name: string;
	description: string;
	qty: number;
	price: number;
}

export interface CrmDealQuote {
	id: string;
	number: string | null;
	subject: string | null;
	/** Quote-level discount in cents; 0 when the quote has none. */
	discount: number;
	items: CrmQuoteItem[];
}

/** The deal's accepted quote, or `{ quote: null }` when it has none — a normal state, not an error. Needs `quotes.READ` on the `zohocrm` connection; without it the backend answers 502. */
export function getCrmDealQuote(dealId: string): Promise<{ quote: CrmDealQuote | null }> {
	return apiFetch<{ quote: CrmDealQuote | null }>(`/zoho-crm/deals/${encodeURIComponent(dealId)}/quote`);
}

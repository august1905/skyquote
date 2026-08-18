import { money, type Money } from '../editor/types';

/**
 * Display formatting only — never used by `computeTotals` itself, which
 * stays entirely in integer minor units. Assumes a 2-decimal-digit currency
 * (cents), same assumption `Money`'s own doc comment already makes ("cents
 * for USD") — a 0-decimal currency like JPY or a 3-decimal one like KWD would
 * render wrong; out of scope until multi-currency (§16 Q5, still an open
 * product question) is actually decided.
 */
export function formatMoney(amount: Money, currency: string): string {
	try {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
	} catch {
		// An invalid/unrecognized currency code (e.g. mid-edit in the block's
		// own currency input) shouldn't crash the block's live preview.
		return `${(amount / 100).toFixed(2)} ${currency}`;
	}
}

/** The inverse of `formatMoney` for a plain (unformatted) major-units input, e.g. `"12.5"` → 1250 cents. Returns `null` for input that isn't a finite number, so callers can decide whether to ignore the keystroke or show an error rather than silently writing `NaN`/`0`. */
export function parseMoneyInput(value: string): Money | null {
	const majorUnits = Number(value);
	if (!Number.isFinite(majorUnits)) return null;
	return money(Math.round(majorUnits * 100));
}

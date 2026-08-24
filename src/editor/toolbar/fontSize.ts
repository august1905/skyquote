/**
 * §2's font size, as numbers — kept out of the component so the parsing and
 * clamping are unit-testable without a live ProseMirror instance (the same
 * reason `paragraphStyle.ts` exists beside `EditorToolbar`).
 */

/** 8px is about the smallest legible print on a Letter page; 100px was the ask, and a 100px line still fits a 816px-wide page. */
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 100;

/** What the controls display when the selection has no explicit size — the browser default the theme's own CSS starts from. Not applied to the document; just where the slider sits before it's dragged. */
export const THEME_FONT_SIZE_FALLBACK = 16;

/** Slider ticks, not a fixed list: the sizes people reach for most, findable by feel while every integer in between is still selectable. */
export const FONT_SIZE_TICKS = [8, 12, 14, 16, 18, 24, 32, 48, 64, 80, 100];

export function clampFontSize(px: number): number {
	if (!Number.isFinite(px)) return THEME_FONT_SIZE_FALLBACK;
	return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(px)));
}

/**
 * The stored `fontSize` mark (`"24px"`) as a number, or `null` for "nothing set,
 * inherit the theme".
 *
 * `null` and `16` are genuinely different states — one follows the Theme panel
 * and one pins the size — so this deliberately doesn't fold the empty case into
 * a default. Tiptap stores whatever string was set, so a value with different
 * units or spacing (`"1.5rem"`, `" 24px "`) is possible in older data; anything
 * that isn't a plain px number reads as unset rather than as `NaN`.
 */
export function parseFontSize(value: string | undefined): number | null {
	if (!value) return null;
	const match = /^\s*(\d+(?:\.\d+)?)\s*px\s*$/i.exec(value);
	if (!match?.[1]) return null;
	const px = Number(match[1]);
	return Number.isFinite(px) ? clampFontSize(px) : null;
}

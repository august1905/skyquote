import type { Editor } from '@tiptap/core';
import { FONT_SIZE_TICKS, MAX_FONT_SIZE, MIN_FONT_SIZE, THEME_FONT_SIZE_FALLBACK, clampFontSize, parseFontSize } from './fontSize';

interface FontSizeControlProps {
	editor: Editor | null;
	/** The current `fontSize` mark value, e.g. `"24px"`. Empty means "inherit the theme". */
	value: string;
	disabled: boolean;
}

/**
 * §2's font size, as a slider with the number beside it.
 *
 * It was a six-option dropdown — 12, 14, 16, 18, 24, 32 — which meant a heading
 * at 40px or a fine-print line at 9px simply couldn't be set, and picking a size
 * was a menu round trip rather than a drag. Now: every integer from
 * {@link MIN_FONT_SIZE} to {@link MAX_FONT_SIZE}, draggable, with the exact
 * number always visible and directly typeable.
 *
 * The number box, not the slider, keeps `aria-label="Font size"`. It's the
 * control that reports and accepts an exact value, so it's the one a screen
 * reader (and `getByLabel`) should land on; the slider is the coarse gesture
 * beside it.
 *
 * The theme's size stays reachable through Reset rather than through a magic
 * slider position: `unsetFontSize` is a genuinely different state from "16px"
 * (it follows the Theme panel), and a slider has no way to express *absent*.
 */
export function FontSizeControl({ editor, value, disabled }: FontSizeControlProps) {
	const explicit = parseFontSize(value);
	// With nothing set, the controls show the theme's own size, so dragging starts
	// from what's on screen instead of jumping.
	const shown = explicit ?? THEME_FONT_SIZE_FALLBACK;

	/**
	 * Runs a size command against what the author would say they're changing.
	 *
	 * With a **collapsed caret**, `setFontSize`/`unsetFontSize` only set ProseMirror
	 * *stored marks*: the size applies to whatever is typed next and to nothing
	 * already on screen, while both commands report success. The control looks
	 * broken — a slider you can drag with no effect. Measured, not assumed: an
	 * instrumented click reported `selection.empty = true` and the mark unchanged.
	 *
	 * Same problem and same answer as this toolbar's Clear formatting button (see
	 * `EditorToolbar`): with nothing selected, a text-level control means *this
	 * block*. A real selection is left alone.
	 */
	function withTarget(run: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) {
		if (!editor) return;
		const chain = editor.chain().focus();
		if (editor.state.selection.empty) chain.selectAll();
		run(chain).run();
	}

	function apply(px: number) {
		withTarget((chain) => chain.setFontSize(`${clampFontSize(px)}px`));
	}

	return (
		<span className={`toolbar-font-size${explicit === null ? ' toolbar-font-size-inherited' : ''}`}>
			<input
				type="number"
				className="toolbar-font-size-number"
				aria-label="Font size"
				min={MIN_FONT_SIZE}
				max={MAX_FONT_SIZE}
				value={shown}
				disabled={disabled}
				onChange={(e) => {
					const px = Number(e.target.value);
					if (Number.isFinite(px)) apply(px);
				}}
			/>
			<input
				type="range"
				className="toolbar-font-size-slider"
				aria-label="Font size slider"
				min={MIN_FONT_SIZE}
				max={MAX_FONT_SIZE}
				step={1}
				list="toolbar-font-size-ticks"
				value={shown}
				disabled={disabled}
				onChange={(e) => apply(Number(e.target.value))}
			/>
			{/* Ticks at the sizes people actually reach for, so the common ones are
			    findable by feel without turning the slider back into a fixed list. */}
			<datalist id="toolbar-font-size-ticks">
				{FONT_SIZE_TICKS.map((size) => (
					<option key={size} value={size} />
				))}
			</datalist>
			<button
				type="button"
				className="toolbar-font-size-reset"
				aria-label="Reset font size to theme"
				title="Use the theme's size"
				disabled={disabled || explicit === null}
				// Keeps the editor's selection while the button takes the click — without
				// it the mousedown moves focus, and the reset then has nothing to act on.
				onMouseDown={(e) => e.preventDefault()}
				onClick={() => withTarget((chain) => chain.unsetFontSize())}
			>
				↺
			</button>
		</span>
	);
}

import { useEffect, useRef } from 'react';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { setBlockStyle } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { Block, BlockStyle, PageId } from '../types';
import './canvas.css';

interface BlockSettingsPopoverProps {
	pageId: PageId;
	block: Block;
	onClose: () => void;
}

const BORDER_STYLE_OPTIONS: Array<NonNullable<BlockStyle['border']>['style']> = ['solid', 'dashed', 'dotted'];

// `Partial<BlockStyle>` isn't quite right under `exactOptionalPropertyTypes`
// — its `?:` means "may be omitted", not "may be present and undefined",
// and this popover deliberately does the latter (e.g. `{ backgroundColor:
// undefined }` to clear a color). This type says what's actually meant.
type StylePatch = { [K in keyof BlockStyle]?: BlockStyle[K] | undefined };

// `BlockStyle` itself (unlike `StylePatch`) doesn't allow a present-but-
// undefined property under `exactOptionalPropertyTypes` — this drops any
// key a patch explicitly cleared, turning "present and undefined" into
// "absent", which is what a `BlockStyle` consumer actually expects.
function omitUndefined<T extends object>(obj: { [K in keyof T]?: T[K] | undefined }): T {
	const result = {} as T;
	for (const key of Object.keys(obj) as (keyof T)[]) {
		const value = obj[key];
		if (value !== undefined) result[key] = value;
	}
	return result;
}

/**
 * §4.3's Settings control — "padding, background, border, width/alignment,
 * plus per-type options". Per-type options (e.g. Image's alt text/shape,
 * Table's header-row toggle) already live inline in each block's own view,
 * selected-only, so this popover only covers the generic `BlockStyle` fields
 * every block shares.
 *
 * Padding and margin used to live here too, as one uniform number and a
 * vertical-only one. They're on the toolbar now, per side — see
 * `BlockSpacingControls`. Not duplicated in both places deliberately: two
 * controls writing the same field at different granularities means the coarse
 * one silently flattens whatever the fine one set.
 */
export function BlockSettingsPopover({ pageId, block, onClose }: BlockSettingsPopoverProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const containerRef = useRef<HTMLDivElement>(null);

	useCloseOnEscape(true, onClose);

	useEffect(() => {
		function handleOutsideClick(event: MouseEvent) {
			if (!containerRef.current?.contains(event.target as Node)) onClose();
		}
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [onClose]);

	const style = block.style;
	const widthPercent = style.width !== undefined ? Math.round(style.width * 100) : 100;
	const alignment = style.alignment ?? 'left';

	function update(patch: StylePatch, options?: { coalesceKey?: string }) {
		const nextStyle = omitUndefined<BlockStyle>({ ...style, ...patch });
		runCommand(setBlockStyle(pageId, block.id, nextStyle), options);
	}

	return (
		<div className="block-settings-popover" ref={containerRef} onClick={(e) => e.stopPropagation()}>
			<label className="block-settings-row">
				<span>Width</span>
				<input
					type="number"
					min={10}
					max={100}
					value={widthPercent}
					onChange={(e) => {
						const percent = Number(e.target.value);
						update({ width: Number.isFinite(percent) && percent > 0 ? percent / 100 : undefined }, { coalesceKey: `style-width-${block.id}` });
					}}
					onBlur={endCoalescing}
				/>
				<span>%</span>
			</label>
			<label className="block-settings-row">
				<span>Alignment</span>
				<select value={alignment} onChange={(e) => update({ alignment: e.target.value as NonNullable<BlockStyle['alignment']> })}>
					<option value="left">Left</option>
					<option value="center">Center</option>
					<option value="right">Right</option>
				</select>
			</label>
			<label className="block-settings-row">
				<span>Background</span>
				<input type="color" value={style.backgroundColor ?? '#ffffff'} onChange={(e) => update({ backgroundColor: e.target.value })} />
				<button type="button" onClick={() => update({ backgroundColor: undefined })}>
					Clear
				</button>
			</label>
			<label className="block-settings-row">
				<input
					type="checkbox"
					checked={Boolean(style.border)}
					onChange={(e) => update({ border: e.target.checked ? { width: 1, style: 'solid', color: '#000000' } : undefined })}
				/>
				<span>Border</span>
			</label>
			{style.border && (
				<div className="block-settings-border-fields">
					<input
						type="number"
						min={1}
						value={style.border.width}
						onChange={(e) => {
							const width = Number(e.target.value);
							if (style.border && Number.isFinite(width)) update({ border: { ...style.border, width } });
						}}
					/>
					<select
						value={style.border.style}
						onChange={(e) => {
							if (style.border) update({ border: { ...style.border, style: e.target.value as NonNullable<BlockStyle['border']>['style'] } });
						}}
					>
						{BORDER_STYLE_OPTIONS.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
					<input
						type="color"
						value={style.border.color}
						onChange={(e) => {
							if (style.border) update({ border: { ...style.border, color: e.target.value } });
						}}
					/>
				</div>
			)}
		</div>
	);
}

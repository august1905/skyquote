import type { Spacing, TemplateSettings } from '../types';

/** Portrait dimensions, px @96dpi. LETTER: 8.5×11in. A4: 210×297mm ≈ 8.27×11.69in. */
const PORTRAIT_SIZES_PX: Record<TemplateSettings['pageSize'], { width: number; height: number }> = {
	LETTER: { width: 816, height: 1056 },
	A4: { width: 794, height: 1123 },
};

export interface PageDimensions {
	width: number;
	height: number;
}

/** §10/§2: physical page size in px @96dpi, swapped for landscape. */
export function pageDimensions(pageSize: TemplateSettings['pageSize'], orientation: TemplateSettings['orientation']): PageDimensions {
	const portrait = PORTRAIT_SIZES_PX[pageSize];
	return orientation === 'landscape' ? { width: portrait.height, height: portrait.width } : { width: portrait.width, height: portrait.height };
}

/** §10 step 1: "render all blocks into an offscreen measuring container at exact page content width" — the page width minus its left/right margins. */
export function pageContentWidth(pageSize: TemplateSettings['pageSize'], orientation: TemplateSettings['orientation'], margins: Spacing): number {
	return pageDimensions(pageSize, orientation).width - margins.left - margins.right;
}

/** The vertical space available for block content on one physical page — page height minus top/bottom margins. */
export function pageContentHeight(pageSize: TemplateSettings['pageSize'], orientation: TemplateSettings['orientation'], margins: Spacing): number {
	return pageDimensions(pageSize, orientation).height - margins.top - margins.bottom;
}

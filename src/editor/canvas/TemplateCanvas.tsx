import type { CSSProperties } from 'react';
import { defaultTheme } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { Theme } from '../types';
import { PageFrame } from './PageFrame';
import './canvas.css';

/**
 * The Theme panel's values reach every page/block through these CSS custom
 * properties, set once here rather than threaded as props through every
 * block view — §3's Theme "applies template-wide", so one place setting
 * them for the whole canvas is the right shape, and canvas.css's `var(...,
 * fallback)` pattern means nothing breaks for content that doesn't
 * reference a given property.
 */
function themeCssVars(theme: Theme): CSSProperties {
	return {
		'--theme-heading-font': theme.headingFont,
		'--theme-body-font': theme.bodyFont,
		'--theme-primary-color': theme.primaryColor,
		'--theme-text-color': theme.textColor,
		'--theme-page-background': theme.pageBackgroundColor,
		'--theme-spacing': `${theme.baseSpacing}px`,
	} as CSSProperties;
}

export function TemplateCanvas() {
	const pages = useEditorStore((s) => s.body?.pages ?? []);
	const theme = useEditorStore((s) => s.body?.settings.theme ?? defaultTheme());
	const selection = useEditorStore((s) => s.selection);
	const multiSelectedBlockIds = useEditorStore((s) => s.multiSelectedBlockIds);

	return (
		<div className="canvas" style={themeCssVars(theme)}>
			{pages.map((page) => (
				<PageFrame
					key={page.id}
					page={page}
					selectedBlockId={selection?.pageId === page.id ? selection.blockId : null}
					multiSelectedBlockIds={selection?.pageId === page.id ? multiSelectedBlockIds : []}
				/>
			))}
		</div>
	);
}

import type { Draft } from 'immer';
import type { Spacing, TemplateBody, TemplateSettings } from '../types';
import type { Command } from './types';
import { snapshot } from './blockTree';

/**
 * Matches `spqbackend/functions/skyquote_function/utils/defaultTemplateBody.js`'s
 * page-settings defaults — necessarily duplicated across the two runtimes,
 * same as `themeCommands.ts`'s `defaultTheme()`.
 */
export function defaultPageSettings(): Pick<TemplateSettings, 'pageSize' | 'orientation' | 'margins' | 'showPageNumbers'> {
	return {
		pageSize: 'LETTER',
		orientation: 'portrait',
		margins: { top: 96, right: 96, bottom: 96, left: 96 },
		showPageNumbers: false,
	};
}

/**
 * §10's pagination pass needs these four fields (page size/orientation
 * determine physical page dimensions; margins determine content width) —
 * `header`/`footer` (repeating blocks) and `theme` are deliberately not part
 * of this patch, each already has (or will have) its own command.
 */
export type PageSettingsPatch = Partial<Pick<TemplateSettings, 'pageSize' | 'orientation' | 'margins' | 'showPageNumbers'>>;

export function setPageSettings(patch: PageSettingsPatch): Command {
	return {
		name: 'setPageSettings',
		apply(draft: Draft<TemplateBody>) {
			const previous: PageSettingsPatch = {
				pageSize: draft.settings.pageSize,
				orientation: draft.settings.orientation,
				margins: snapshot<Spacing>(draft.settings.margins),
				showPageNumbers: draft.settings.showPageNumbers,
			};
			Object.assign(draft.settings, patch);
			return setPageSettings(previous);
		},
	};
}

import type { Draft } from 'immer';
import type { TemplateBody, Theme } from '../types';
import type { Command } from './types';
import { snapshot } from './blockTree';

/**
 * Matches `spqbackend/functions/skyquote_function/utils/defaultTemplateBody.js`'s
 * theme defaults — necessarily duplicated across the two runtimes, the same
 * way the rest of a blank template's shape already is.
 */
export function defaultTheme(): Theme {
	return {
		primaryColor: '#1a1a1a',
		textColor: '#333333',
		pageBackgroundColor: '#ffffff',
		baseSpacing: 16,
	};
}

/**
 * Replaces the template-wide theme wholesale — one setting, not per-block,
 * so no id/lookup is needed the way block commands need. `snapshot()`
 * detaches the previous value from the draft before it's closed over by the
 * returned inverse — see blockTree.ts's comment on `snapshot()`: a captured
 * draft proxy is revoked the instant this producer returns, and the inverse
 * isn't applied until a later, separate producer call.
 */
export function setTheme(theme: Theme): Command {
	return {
		name: 'setTheme',
		apply(draft: Draft<TemplateBody>) {
			const previousTheme = snapshot<Theme>(draft.settings.theme);
			draft.settings.theme = theme;
			return setTheme(previousTheme);
		},
	};
}

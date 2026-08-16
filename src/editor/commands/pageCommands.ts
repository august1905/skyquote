import type { Draft } from 'immer';
import type { Page, PageId, TemplateBody } from '../types';
import type { Command } from './types';
import { findPageIndex, pageAt, reindexPageOrder, snapshot } from './blockTree';

export function addPage(index: number, page: Page): Command {
	return {
		name: 'addPage',
		apply(draft: Draft<TemplateBody>) {
			draft.pages.splice(index, 0, page as Draft<Page>);
			reindexPageOrder(draft);
			return deletePage(page.id);
		},
	};
}

// No "can't delete the last page" guard here — that's a UI-level rule (the
// canvas should disable the control), not something the command layer
// enforces. A command's job is to do exactly what it's told; keeping that
// invariant out of apply() keeps commands composable and keeps this file
// testable without smuggling in a business rule that has nothing to do with
// undo/redo correctness.
export function deletePage(pageId: PageId): Command {
	return {
		name: 'deletePage',
		apply(draft: Draft<TemplateBody>) {
			const index = findPageIndex(draft, pageId);
			const removed = snapshot<Page>(pageAt(draft, index));
			draft.pages.splice(index, 1);
			reindexPageOrder(draft);
			return addPage(index, removed);
		},
	};
}

export function renamePage(pageId: PageId, name: string): Command {
	return {
		name: 'renamePage',
		apply(draft: Draft<TemplateBody>) {
			const index = findPageIndex(draft, pageId);
			const page = pageAt(draft, index);
			const previousName = page.name;
			page.name = name;
			return renamePage(pageId, previousName);
		},
	};
}

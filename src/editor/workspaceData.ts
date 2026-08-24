import { listCatalogItems } from '../api/catalogItems';
import { listContentLibraryItems } from '../api/contentLibrary';
import { listMentionableUsers } from '../api/comments';
import { useEditorStore } from './store/editorStore';

/**
 * The editor's three **workspace-level** datasets — the product catalog, the
 * content library, and the @-mentionable user list — fetched the first time
 * something actually needs them rather than on every editor open.
 *
 * They used to be three unconditional `useEffect`s in `TemplateEditor`, which
 * meant opening any template cost three requests for data most sessions never
 * looked at: the catalog only matters to the Catalog panel and to a pricing
 * table's "price changed" check, the library only to its own panel and the
 * save-to-library dialog, and mentionable users only inside the comments
 * sidebar. A measured editor page load made 7 API calls; three of them were
 * these.
 *
 * None of them are template-scoped, so once loaded they're kept for the life of
 * the page — `loadTemplate` deliberately doesn't clear them, and opening a
 * second template reuses what the first one fetched.
 *
 * Each `ensure` is safe to call from any number of components' effects: the
 * status check makes the second call a no-op, and `apiFetch` collapses
 * genuinely concurrent duplicates on top of that.
 */

export async function ensureCatalogItems(): Promise<void> {
	const { catalogItemsStatus, setCatalogItems, setCatalogItemsStatus } = useEditorStore.getState();
	// 'error' is included so a failed load retries when something needs it again
	// — the alternative is a Catalog panel that stays permanently empty after one
	// bad request.
	if (catalogItemsStatus === 'loading' || catalogItemsStatus === 'ready') return;
	setCatalogItemsStatus('loading');
	try {
		setCatalogItems(await listCatalogItems());
	} catch {
		// Degrades to an empty panel and no price-changed checks, exactly as the
		// eager version did — never blocks the editor.
		setCatalogItemsStatus('error');
	}
}

export async function ensureContentLibraryItems(): Promise<void> {
	const { contentLibraryStatus, setContentLibraryItems, setContentLibraryStatus } = useEditorStore.getState();
	if (contentLibraryStatus === 'loading' || contentLibraryStatus === 'ready') return;
	setContentLibraryStatus('loading');
	try {
		setContentLibraryItems(await listContentLibraryItems());
	} catch {
		setContentLibraryStatus('error');
	}
}

/**
 * Unlike the two above, this has no status field of its own in the store — the
 * mention list has no loading or error UI, it either resolves names or doesn't.
 * A module-level flag is enough to keep it to one request per page.
 */
let mentionableUsersRequested = false;

export async function ensureMentionableUsers(): Promise<void> {
	if (mentionableUsersRequested) return;
	mentionableUsersRequested = true;
	try {
		useEditorStore.getState().setMentionableUsers(await listMentionableUsers());
	} catch {
		// Silently ignored, as before: mentions stop resolving to names, which is
		// not worth an error surface in the comment composer.
		mentionableUsersRequested = false;
	}
}

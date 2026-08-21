import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { getTemplate, saveTemplate } from '../../api/templates';
import { useEditorStore } from '../store/editorStore';

// Spec §9.2.
const AUTOSAVE_DEBOUNCE_MS = 1500;

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

export interface UseAutosaveResult {
	status: AutosaveStatus;
	/** Discards local edits and reloads the template fresh from the server — the only conflict resolution phase 1 offers (see BUILD_STATUS.md's §9.2 notes). */
	reloadFromServer: () => Promise<void>;
	/** Saves now instead of waiting out the debounce — §9.3's `Cmd+S`. A no-op when there's nothing dirty, so pressing it repeatedly is harmless. */
	flush: () => Promise<void>;
}

/**
 * Debounced autosave for the template editor. Owns none of the document
 * state itself — reads/writes only through the editor store's live
 * `getState()`, never a closed-over snapshot, since flush() is called from
 * timers and window event listeners outside React's normal render cycle.
 */
export function useAutosave(): UseAutosaveResult {
	const [status, setStatus] = useState<AutosaveStatus>('idle');
	const statusRef = useRef(status);
	statusRef.current = status;

	const isSavingRef = useRef(false);
	const reattemptPendingRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const dirty = useEditorStore((s) => s.dirty);
	const editSeq = useEditorStore((s) => s.editSeq);

	const flush = useCallback(async () => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}

		// Only one save in flight at a time. If edits land while one is
		// already running, don't fire a second overlapping PUT — remember to
		// try again once this one finishes, so those edits aren't stranded.
		if (isSavingRef.current) {
			reattemptPendingRef.current = true;
			return;
		}

		// A conflict needs the user to explicitly reload before autosave
		// resumes — retrying with the same stale version would just 409 again.
		if (statusRef.current === 'conflict') return;

		const { meta, body, dirty: isDirty, editSeq: editSeqAtSaveStart } = useEditorStore.getState();
		if (!meta || !body || !isDirty) return;

		isSavingRef.current = true;
		setStatus('saving');
		try {
			const { meta: savedMeta } = await saveTemplate(meta.id, { version: meta.version, name: meta.name, body });
			// If nothing changed since this save started, `dirty` can be
			// cleared — the body just persisted IS the current body. If newer
			// edits landed while the request was in flight, only the
			// version/timestamps get to advance; those edits were never part
			// of what this save sent, so they must stay dirty for the next
			// autosave attempt to pick up.
			if (useEditorStore.getState().editSeq === editSeqAtSaveStart) {
				useEditorStore.getState().markSaved(savedMeta);
			} else {
				useEditorStore.getState().advanceSavedMeta(savedMeta);
			}
			setStatus('saved');
		} catch (err) {
			setStatus(err instanceof ApiError && err.status === 409 ? 'conflict' : 'error');
		} finally {
			isSavingRef.current = false;
			if (reattemptPendingRef.current) {
				reattemptPendingRef.current = false;
				void flush();
			}
		}
	}, []);

	// The debounce: (re)armed on every edit. `editSeq` (not `lastCommandAt`)
	// is the dependency because undo/redo both reset `lastCommandAt` to
	// `null` — two undos in a row wouldn't register as a dependency *change*,
	// silently failing to re-arm the timer.
	useEffect(() => {
		if (!dirty || status === 'conflict') return;
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [dirty, editSeq, status, flush]);

	// Flush points beyond the idle debounce: §9.2 calls for blur/pagehide/
	// route change. `visibilitychange` covers tab-switch and app-backgrounding
	// more reliably than `blur` alone; `pagehide` covers navigating away or
	// closing the tab. None of these are guaranteed to complete if the tab is
	// actually torn down mid-request — a `fetch` isn't guaranteed to finish
	// after unload the way `navigator.sendBeacon` is, but sendBeacon can't
	// carry a JSON content-type and read a 409 response, which this needs —
	// so this is a best-effort flush, not a guarantee.
	useEffect(() => {
		function handleVisibilityChange() {
			if (document.visibilityState === 'hidden') void flush();
		}
		function handleBlurOrHide() {
			void flush();
		}
		window.addEventListener('blur', handleBlurOrHide);
		window.addEventListener('pagehide', handleBlurOrHide);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			window.removeEventListener('blur', handleBlurOrHide);
			window.removeEventListener('pagehide', handleBlurOrHide);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			// Route change (this hook's owner unmounting): fire a last best-
			// effort flush. The fetch outlives the component if it navigates.
			void flush();
		};
	}, [flush]);

	const reloadFromServer = useCallback(async () => {
		const { meta } = useEditorStore.getState();
		if (!meta) return;
		const { meta: freshMeta, body: freshBody } = await getTemplate(meta.id);
		useEditorStore.getState().loadTemplate(freshMeta, freshBody);
		setStatus('idle');
	}, []);

	return { status, reloadFromServer, flush };
}

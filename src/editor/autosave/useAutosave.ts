import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { getTemplate, saveTemplate } from '../../api/templates';
import { useEditorStore } from '../store/editorStore';
import { clearLocalDraft, writeLocalDraft } from './localDraft';

/**
 * How often the editor sends the body to the server while you're working.
 *
 * This is an **interval, not a debounce** — the distinction is the whole point.
 * A debounce restarts on every keystroke, so it saved after every pause in
 * typing: a single paragraph could be a dozen PUTs, and each one rewrites the
 * entire template body as a fresh Stratus object and bumps the row's version.
 * An interval arms once when the document first becomes dirty and then fires,
 * however much editing happens in the meantime — so a solid half hour of work is
 * 60 saves rather than several hundred.
 *
 * Raised from 1.5s to 30s on 2026-08-24 (Grayson: "should not save after every
 * single edit… save every 30 seconds to save space").
 *
 * **Nothing is risked by the longer gap**, because the local draft below is
 * still written 400ms after you stop typing, and it's the copy that survives a
 * closed tab (§13). The 30s window only governs how stale the *server's* copy
 * gets, and every way of leaving the editor — blur, tab switch, navigation,
 * Cmd+S — flushes immediately.
 */
const AUTOSAVE_INTERVAL_MS = 30_000;
/**
 * §13's local-draft write, on a much shorter debounce than the server save.
 * It costs nothing but a `localStorage` write, and the whole point is for the
 * copy on disk to exist *before* any network attempt — so a tab closed
 * between two keystrokes still has somewhere to recover from.
 */
const LOCAL_DRAFT_DEBOUNCE_MS = 400;

/** `pending` = edited but not yet sent; the 30s interval is counting down and the local draft already holds the work. */
export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'conflict' | 'error' | 'offline';

export interface UseAutosaveResult {
	status: AutosaveStatus;
	/** Discards local edits and reloads the template fresh from the server — the only conflict resolution phase 1 offers (see BUILD_STATUS.md's §9.2 notes). */
	reloadFromServer: () => Promise<void>;
	/** Saves now instead of waiting out the 30s interval — §9.3's `Cmd+S`, and every exit path. A no-op when there's nothing dirty, so pressing it repeatedly is harmless. */
	flush: () => Promise<void>;
}

/**
 * Interval autosave for the template editor. Owns none of the document
 * state itself — reads/writes only through the editor store's live
 * `getState()`, never a closed-over snapshot, since flush() is called from
 * timers and window event listeners outside React's normal render cycle.
 */
export function useAutosave(userId: string | undefined): UseAutosaveResult {
	const [status, setStatus] = useState<AutosaveStatus>('idle');
	const statusRef = useRef(status);
	statusRef.current = status;

	const isSavingRef = useRef(false);
	const reattemptPendingRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Read inside flush(), which runs from timers and event listeners outside
	// React's render cycle — a closed-over value could be a render stale.
	const userIdRef = useRef(userId);
	userIdRef.current = userId;

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

		// §13: don't burn a request when the browser already knows there's no
		// network. The local draft is written on its own (much shorter) timer,
		// so the work is already safe on disk — reported as 'offline' rather
		// than 'error' because those call for different things from the user:
		// one resolves itself, the other might not.
		if (typeof navigator !== 'undefined' && navigator.onLine === false) {
			setStatus('offline');
			return;
		}

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
				// The server now has this content, so the local safety net has
				// nothing left to protect. Only cleared on the branch where
				// `dirty` was actually cleared: if newer edits landed mid-flight
				// they're still unsent, and their draft must survive.
				if (userIdRef.current) clearLocalDraft(userIdRef.current, meta.id);
			} else {
				useEditorStore.getState().advanceSavedMeta(savedMeta);
			}
			setStatus('saved');
		} catch (err) {
			// The draft is deliberately left in place on every failure path —
			// that copy is the only one that survives the tab closing.
			setStatus(err instanceof ApiError && err.status === 409 ? 'conflict' : 'error');
		} finally {
			isSavingRef.current = false;
			if (reattemptPendingRef.current) {
				reattemptPendingRef.current = false;
				void flush();
			}
		}
	}, []);

	/**
	 * Arms the save timer the first time the document becomes dirty, and then
	 * **leaves it alone**.
	 *
	 * The early return on an already-armed timer is what makes this an interval
	 * rather than a debounce, and it's why this effect has no cleanup: React runs
	 * cleanup on every dependency change, so clearing the timer there would cancel
	 * and re-arm on every single edit — exactly the behaviour being removed.
	 * Unmount cleanup lives in its own effect below.
	 *
	 * `editSeq` (not `lastCommandAt`) is a dependency because undo/redo both reset
	 * `lastCommandAt` to `null` — two undos in a row wouldn't register as a
	 * dependency *change*, so the timer would never be armed for them at all.
	 */
	useEffect(() => {
		if (!dirty || status === 'conflict') return;
		// The status line must stop claiming everything is saved the moment it
		// isn't. Over a 1.5s debounce that was invisible; over 30s it would be a
		// lie sitting on screen while someone typed.
		if (statusRef.current === 'saved' || statusRef.current === 'idle') setStatus('pending');
		if (timerRef.current) return;
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			void flush();
		}, AUTOSAVE_INTERVAL_MS);
	}, [dirty, editSeq, status, flush]);

	// Unmount only — see above for why this can't live in the effect that arms it.
	useEffect(
		() => () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		},
		[]
	);

	/**
	 * §13's local draft. Written on its own short debounce, independent of the
	 * server save, so the on-disk copy exists long before any request is
	 * attempted — and keeps being refreshed even while saves are failing.
	 *
	 * `baseVersion` records the server version this work was built on, which
	 * is what lets the restore prompt distinguish "my unsent work" from "work
	 * based on a copy someone has since saved over".
	 */
	useEffect(() => {
		if (!dirty || !userId) return;
		if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
		draftTimerRef.current = setTimeout(() => {
			const { meta, body } = useEditorStore.getState();
			if (!meta || !body) return;
			writeLocalDraft(userId, { templateId: meta.id, baseVersion: meta.version, name: meta.name, body, savedAt: new Date().toISOString() });
		}, LOCAL_DRAFT_DEBOUNCE_MS);
		return () => {
			if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
		};
	}, [dirty, editSeq, userId]);

	// §13's "restore on reconnect" half: the moment the browser regains
	// network, push whatever is still unsent. Without this, an offline edit
	// would sit until the user happened to type again.
	useEffect(() => {
		function handleOnline() {
			void flush();
		}
		window.addEventListener('online', handleOnline);
		return () => window.removeEventListener('online', handleOnline);
	}, [flush]);

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
			// Write the draft synchronously before flushing: `pagehide` may be
			// the last code this page runs, and the pending 400ms draft timer
			// will never fire if so. A localStorage write completes inline; the
			// network flush after it is best-effort by nature.
			const { meta, body, dirty: isDirty } = useEditorStore.getState();
			if (isDirty && meta && body && userIdRef.current) {
				writeLocalDraft(userIdRef.current, { templateId: meta.id, baseVersion: meta.version, name: meta.name, body, savedAt: new Date().toISOString() });
			}
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

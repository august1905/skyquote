import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { acquireTemplateLock, releaseTemplateLock } from '../../api/templates';

/**
 * How often the held lock is refreshed. Must be comfortably shorter than the
 * backend's `STALE_AFTER_MS` (90s) — at 30s, two consecutive heartbeats can
 * fail on a flaky connection before anyone else is allowed to take over.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * In-flight acquires, keyed by template id, so StrictMode's setup → cleanup →
 * setup doesn't fire two `POST /templates/:id/lock` calls microseconds apart on
 * every editor mount in development.
 *
 * `apiFetch` deduplicates concurrent GETs but deliberately never touches
 * writes — a duplicate POST is normally a second intentional action. This one is
 * the exception worth making by hand: acquiring is idempotent (it's the same
 * call the heartbeat makes to *refresh* a lock the caller already holds), and
 * both invocations are the same mount asking the same question.
 *
 * Cleared when the request settles, so genuinely re-entering the editor later
 * still acquires for real.
 */
const inFlightAcquires = new Map<string, Promise<unknown>>();

function acquireOnce(templateId: string): Promise<unknown> {
	const existing = inFlightAcquires.get(templateId);
	if (existing) return existing;
	const pending = acquireTemplateLock(templateId).finally(() => {
		inFlightAcquires.delete(templateId);
	});
	inFlightAcquires.set(templateId, pending);
	return pending;
}

export type TemplateLockStatus = 'acquiring' | 'held' | 'blocked' | 'error';

export interface UseTemplateLockResult {
	status: TemplateLockStatus;
	/** Human-readable reason, straight from the backend ("Sam is editing this template"). Only set when `blocked`. */
	blockedReason: string | null;
	/** Re-attempts acquisition — for the blocked screen's "Try again". */
	retry: () => void;
}

/**
 * §12's exclusive edit lock, client side. Grayson's decision (2026-08-21):
 * **no real-time co-editing, and no soft locking — one editor at a time, with
 * everyone else refused entry.** That's a deliberate simplification of the
 * spec's own recommendation (presence + soft locking), chosen because it
 * removes concurrent-edit reconciliation from the problem rather than making
 * it rarer.
 *
 * Three jobs: take the lock on mount, keep it alive while the editor is open,
 * and give it back on the way out.
 *
 * **Releasing reliably is the fiddly part**, so it happens on three signals
 * rather than one: effect cleanup (route change, unmount), `pagehide`
 * (navigating away, closing the tab), and — because neither of those is
 * guaranteed to run — the backend's heartbeat staleness check as the ultimate
 * backstop. Nothing here is load-bearing for correctness; the worst case of
 * every release path failing is a colleague waiting out the 90s staleness
 * window, not a permanently unopenable template.
 *
 * `visibilitychange` is deliberately **not** a release signal, unlike in
 * `useAutosave` where it triggers a flush: switching tabs or apps mid-edit is
 * not leaving the editor, and dropping the lock there would let someone else
 * take over the template while its editor is still open and about to be
 * returned to.
 */
export function useTemplateLock(templateId: string | undefined): UseTemplateLockResult {
	const [status, setStatus] = useState<TemplateLockStatus>('acquiring');
	const [blockedReason, setBlockedReason] = useState<string | null>(null);
	// Bumping this re-runs the effect below, which is the whole retry mechanism.
	const [attempt, setAttempt] = useState(0);
	// Whether this hook still holds the lock, read by the unload handler
	// outside React's render cycle — so it never tries to release a lock it
	// already lost to a takeover.
	const heldRef = useRef(false);

	const retry = useCallback(() => {
		setStatus('acquiring');
		setBlockedReason(null);
		setAttempt((n) => n + 1);
	}, []);

	useEffect(() => {
		if (!templateId) return;

		let cancelled = false;
		heldRef.current = false;

		async function acquire() {
			try {
				await acquireOnce(templateId!);
				if (cancelled) {
					// Superseded — this effect run was torn down while its
					// acquire was in flight.
					//
					// **Deliberately does NOT release.** Ownership is per *user*,
					// not per tab or per effect run, so a release here can delete
					// a lock a newer run legitimately holds. That is not
					// hypothetical: StrictMode runs every effect setup → cleanup →
					// setup, so on every editor mount in development the first
					// run's acquire resolves after it was cancelled — and
					// releasing there silently dropped the lock the second run had
					// just taken, letting a second person straight in. Caught by
					// this feature's own e2e test, where the locked-out user
					// wasn't locked out at all.
					//
					// The cost of not releasing is that abandoning an editor
					// *during* the acquire round trip can strand the lock until
					// its heartbeat goes stale (≤90s). That's the right trade:
					// a bounded wait beats silently allowing the concurrent
					// editing this whole feature exists to prevent.
					return;
				}
				heldRef.current = true;
				setStatus('held');
				setBlockedReason(null);
			} catch (err) {
				if (cancelled) return;
				heldRef.current = false;
				if (err instanceof ApiError && err.status === 409) {
					setStatus('blocked');
					setBlockedReason(err.message);
					return;
				}
				// Anything else (network, 500) is reported as an error rather
				// than as "blocked" — the distinction matters, because blocked
				// means "wait for a person" and error means "something is
				// broken".
				setStatus('error');
			}
		}

		void acquire();

		// The heartbeat doubles as takeover detection: a 409 here means someone
		// claimed the lock after ours went stale (a long sleep, a dead
		// connection), and continuing to edit would be exactly the concurrent
		// editing this feature exists to prevent.
		const heartbeat = setInterval(() => {
			if (!heldRef.current) return;
			acquireTemplateLock(templateId)
				.catch((err: unknown) => {
					if (err instanceof ApiError && err.status === 409) {
						heldRef.current = false;
						setStatus('blocked');
						setBlockedReason(err.message);
					}
					// A transient failure is ignored on purpose — the next beat
					// will retry well inside the staleness window.
				});
		}, HEARTBEAT_INTERVAL_MS);

		function releaseIfHeld() {
			if (!heldRef.current) return;
			heldRef.current = false;
			void releaseTemplateLock(templateId!).catch(() => undefined);
		}

		window.addEventListener('pagehide', releaseIfHeld);

		return () => {
			cancelled = true;
			clearInterval(heartbeat);
			window.removeEventListener('pagehide', releaseIfHeld);
			releaseIfHeld();
		};
	}, [templateId, attempt]);

	return { status, blockedReason, retry };
}

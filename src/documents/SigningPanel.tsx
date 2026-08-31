import { useCallback, useEffect, useRef, useState } from 'react';
import { requestSigningUrl, syncSigningStatus } from '../api/documents';
import type { DocumentRecipient } from '../editor/types';
import './signing-panel.css';

interface SigningPanelProps {
	documentId: string;
	token: string;
	/** Called once the *server* confirms this recipient is finished, with the status it reported. The panel closes itself through this. */
	onSettled: (status: DocumentRecipient['status']) => void;
	onClose: () => void;
}

/**
 * How often the panel asks whether the signature landed. Only while it's open.
 *
 * 2.5s rather than the old 5s, and affordable *because* it changed what it polls:
 * `syncSigningStatus` is one Zoho Sign read and no document body, where the old
 * poll pulled the whole body out of Stratus. Twice as often, for less.
 */
const STATUS_POLL_MS = 2500;

/**
 * Zoho Sign's signing surface, opened over the document the recipient is already
 * reading.
 *
 * This is the whole point of the integration: signing happens **here**, not in
 * an inbox. Recipients are created with `is_embedded: true`, which stops Zoho
 * Sign emailing them a signing link of its own — so this panel is the only way
 * in, and it has to work.
 *
 * The URL behind it is fetched when the panel opens rather than when the page
 * loads, because Zoho Sign's embed URL is **single-use and expires after two
 * minutes**. One fetched alongside the document would be dead by the time
 * anybody scrolled to the bottom of a proposal.
 */
export function SigningPanel({ documentId, token, onSettled, onClose }: SigningPanelProps) {
	const [signUrl, setSignUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [expired, setExpired] = useState(false);
	// Set when Zoho Sign says the signer finished but the server hasn't caught up
	// yet. Worth its own state: without it the panel sits on a "you're done"
	// screen with no explanation for why it hasn't closed.
	const [finishing, setFinishing] = useState(false);
	// Bumped by Try again / Start again. A plain counter rather than a key derived
	// from `expired` so the dependency below is something the linter can check.
	const [attempt, setAttempt] = useState(0);
	const expiryTimer = useRef<number | null>(null);

	useEffect(() => {
		let cancelled = false;
		setError(null);
		setExpired(false);
		requestSigningUrl(documentId, token)
			.then((result) => {
				if (cancelled) return;
				setSignUrl(result.signUrl);
				// Counted down rather than left to fail silently: an expired Zoho Sign
				// URL renders as a blank frame with no explanation, which reads as the
				// app being broken. Saying so and offering another is the honest version.
				expiryTimer.current = window.setTimeout(() => setExpired(true), result.expiresInSeconds * 1000);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : 'Could not open the signing panel');
			});
		return () => {
			cancelled = true;
			if (expiryTimer.current) window.clearTimeout(expiryTimer.current);
		};
		// `attempt` is the retry trigger — see the buttons below.
	}, [documentId, token, attempt]);

	/**
	 * Asks the server whether this recipient is finished, and settles the panel if
	 * so.
	 *
	 * **The browser cannot answer this itself.** Zoho Sign's signing surface is a
	 * cross-origin iframe, and — measured, not assumed — it posts **no message at
	 * all** when a signer finishes. So there is nothing to listen for, and polling
	 * is not a fallback here, it's the mechanism.
	 *
	 * What changed is *who* gets asked. This now reconciles against Zoho Sign
	 * itself rather than re-reading our own database, which could only know once the
	 * webhook had arrived: 8 seconds, live, between Finish and the panel closing.
	 * Zoho Sign knew immediately.
	 */
	const checkSettled = useCallback(async () => {
		try {
			const fresh = await syncSigningStatus(documentId, token);
			const status = fresh.recipientStatus;
			if (status === 'completed' || status === 'declined') {
				onSettled(status);
				return true;
			}
		} catch {
			// A failed poll is not worth surfacing — the next one is 2.5 seconds away,
			// and the recipient can always close the panel by hand.
		}
		return false;
	}, [documentId, token, onSettled]);

	// Polls only while the panel is open, which is what closes it after signing.
	// Before this, Zoho Sign's own "document signed" screen stayed up and the
	// recipient had to dismiss the panel themselves — an extra step at exactly the
	// moment they think they're done.
	useEffect(() => {
		const timer = window.setInterval(() => void checkSettled(), STATUS_POLL_MS);
		return () => window.clearInterval(timer);
	}, [checkSettled]);

	/**
	 * An accelerator, and **on current evidence a dead one** — kept deliberately.
	 *
	 * A full signing session was driven end to end against the live account with
	 * every inbound `postMessage` logged, and Zoho Sign sent **none**. So nothing
	 * here can be relied on; the poll above is the mechanism, not the fallback. This
	 * stays because it costs one listener, it would shave a couple of seconds if
	 * Zoho Sign ever starts posting one, and it is safe either way: it only brings
	 * the next reconcile forward. It never closes the panel and never claims a
	 * signature — anything can post a message to a window, and the reconcile is what
	 * decides.
	 *
	 * Matched loosely for that reason: the cost of a false positive is one extra
	 * read, and the cost of a false negative is the two seconds this exists to save.
	 */
	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data ?? '');
			if (!/sign|complet|success|finish/i.test(data)) return;
			setFinishing(true);
			void checkSettled();
		}
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [checkSettled]);

	return (
		<div className="signing-overlay" role="dialog" aria-modal="true" aria-label="Sign this document">
			<div className="signing-panel">
				<header className="signing-panel-header">
					<h2>Sign this document</h2>
					<button type="button" className="signing-panel-close" onClick={onClose} aria-label="Close signing panel">
						×
					</button>
				</header>
				<div className="signing-panel-body">
					{error && (
						<div className="signing-panel-message" role="alert">
							<p>{error}</p>
							<button type="button" onClick={() => setAttempt((n) => n + 1)}>
								Try again
							</button>
						</div>
					)}
					{!error && expired && (
						<div className="signing-panel-message">
							<p>This signing session timed out.</p>
							<button type="button" onClick={() => setAttempt((n) => n + 1)}>
								Start again
							</button>
						</div>
					)}
					{!error && !expired && !signUrl && <p className="signing-panel-message">Opening the signing panel…</p>}
					{!error && !expired && signUrl && (
						<iframe
							className="signing-panel-frame"
							src={signUrl}
							title="Sign this document"
							// The signing surface asks for a drawn signature and may open the
							// camera for an ID check, so both are allowed; nothing else is.
							allow="camera; microphone"
						/>
					)}
				</div>
				{finishing && <p className="signing-panel-finishing">Signature received — finishing up…</p>}
				{!error && !expired && signUrl && (
					// An escape hatch, not a feature. The panel is an iframe on
					// sign.zoho.com, and a browser that already holds a Zoho session can
					// treat that differently from a clean one. A full tab is the same
					// signing session without the frame.
					<p className="signing-panel-fallback">
						Trouble signing here?{' '}
						<a href={signUrl} target="_blank" rel="noopener noreferrer">
							Open it in a new tab
						</a>
						.
					</p>
				)}
			</div>
		</div>
	);
}

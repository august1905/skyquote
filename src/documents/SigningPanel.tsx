import { useEffect, useRef, useState } from 'react';
import { requestSigningUrl } from '../api/documents';
import './signing-panel.css';

interface SigningPanelProps {
	documentId: string;
	token: string;
	/** Called once the panel reports the recipient finished, so the page can refresh its status without a reload. */
	onSigned: () => void;
	onClose: () => void;
}

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
export function SigningPanel({ documentId, token, onSigned, onClose }: SigningPanelProps) {
	const [signUrl, setSignUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [expired, setExpired] = useState(false);
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
	 * Zoho Sign posts a message to the parent window when the signer finishes.
	 *
	 * Treated as a **hint, not as truth**: anything can post a message to a
	 * window, so this only refreshes the page's own view of its status — the
	 * authoritative "this was signed" comes from Zoho Sign's webhook hitting the
	 * backend, which nothing in the browser can forge.
	 */
	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			const data = typeof event.data === 'string' ? event.data : '';
			if (/sign_success|sign_completed|signing_complete/i.test(data)) onSigned();
		}
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [onSigned]);

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
			</div>
		</div>
	);
}

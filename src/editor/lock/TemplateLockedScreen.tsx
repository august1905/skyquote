import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './templateLock.css';

interface TemplateLockedScreenProps {
	/** The backend's own message, e.g. "Sam is editing this template". */
	reason: string;
	onRetry: () => void;
}

/**
 * Shown instead of the editor when someone else holds the lock (§12, per
 * Grayson's 2026-08-21 decision: locked out entirely, not read-only and not
 * co-editing).
 *
 * Retries on its own every few seconds as well as offering a button, because
 * the realistic wait here is "until a colleague closes their tab" — which is
 * usually seconds away and which the person staring at this screen has no
 * other way to learn about. The automatic retry is what makes this recover
 * without anyone having to think about it.
 */
const AUTO_RETRY_INTERVAL_MS = 5_000;

export function TemplateLockedScreen({ reason, onRetry }: TemplateLockedScreenProps) {
	const [secondsWaiting, setSecondsWaiting] = useState(0);

	useEffect(() => {
		const retryTimer = setInterval(onRetry, AUTO_RETRY_INTERVAL_MS);
		const tick = setInterval(() => setSecondsWaiting((s) => s + 1), 1000);
		return () => {
			clearInterval(retryTimer);
			clearInterval(tick);
		};
	}, [onRetry]);

	return (
		<div className="template-locked" role="alert">
			<h1>This template is being edited</h1>
			<p className="template-locked-reason">{reason}</p>
			<p className="template-locked-explanation">
				Only one person can edit a template at a time, so nobody&apos;s changes get overwritten. This page will open automatically as soon as
				they&apos;re done.
			</p>
			<div className="template-locked-actions">
				<button type="button" onClick={onRetry}>
					Try again
				</button>
				<Link to="/templates">Back to templates</Link>
			</div>
			{/* Visible proof it's still trying, so the automatic retry doesn't
			    look like a frozen page. */}
			<p className="template-locked-waiting" aria-live="polite">
				Checking again every few seconds… ({secondsWaiting}s)
			</p>
		</div>
	);
}

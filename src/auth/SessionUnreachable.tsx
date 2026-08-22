import { useState } from 'react';
import { useAuth } from './AuthContext';
import './SessionUnreachable.css';

/**
 * Shown when the session check couldn't complete — as opposed to completing and
 * saying "not signed in", which redirects to the login page.
 *
 * The distinction is the point. Sending someone to /login because the backend
 * hiccuped tells them something false ("you've been signed out"), asks them to
 * do something pointless (re-enter a password that was never the problem), and
 * loses the URL they were on. This says what actually happened and offers the
 * one action that can help.
 */
export function SessionUnreachable() {
	const { refresh } = useAuth();
	const [retrying, setRetrying] = useState(false);

	async function retry() {
		setRetrying(true);
		try {
			await refresh();
		} finally {
			// Only matters if the retry also fails — on success this unmounts.
			setRetrying(false);
		}
	}

	return (
		<div className="session-unreachable" role="alert">
			<h1>Can&apos;t reach SkyQuotes right now</h1>
			<p>Your sign-in is probably fine — the app couldn&apos;t check it. Nothing you were working on has been lost.</p>
			<button type="button" onClick={() => void retry()} disabled={retrying}>
				{retrying ? 'Trying again…' : 'Try again'}
			</button>
		</div>
	);
}

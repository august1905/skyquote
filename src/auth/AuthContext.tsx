import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { me, type CurrentUser } from '../api/auth';
import { ApiError } from '../api/client';

/**
 * `unreachable` is deliberately distinct from `unauthenticated`.
 *
 * Every failure of `me()` used to collapse into `unauthenticated`, which means a
 * *redirect to the login page* — so a single 500, a dropped connection or a
 * backend hiccup during page load looked exactly like being signed out, and took
 * the URL you were on with it. It was also silent: nothing said the check had
 * failed rather than come back negative. This was the root cause of an
 * intermittent e2e failure whose only symptom was a test landing on the login
 * screen while every later test in the same run stayed signed in — the session
 * was fine the whole time.
 *
 * Only the server actually saying "not authenticated" (401) means logged out.
 * Anything else means we don't know, and saying so is more useful than guessing
 * the answer that throws away the user's place.
 */
type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'unreachable';

interface AuthContextValue {
	status: AuthStatus;
	user: CurrentUser | null;
	refresh: () => Promise<CurrentUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Single shared session check for the whole app, so RequireAuth,
// RequireAdmin, and the Sidebar don't each independently call me() on mount
// and fire three /auth/me requests for one page load. refresh() lets
// Login/logout force a re-check once the session actually changes.
export function AuthProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<AuthStatus>('checking');
	const [user, setUser] = useState<CurrentUser | null>(null);

	const refresh = useCallback(() => {
		return me()
			.then((data) => {
				setUser(data);
				setStatus('authenticated');
				return data;
			})
			.catch((err: unknown) => {
				setUser(null);
				// A 401 is an answer; anything else is the absence of one. See
				// AuthStatus above for why the difference matters.
				setStatus(err instanceof ApiError && err.status === 401 ? 'unauthenticated' : 'unreachable');
				return null;
			});
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return <AuthContext.Provider value={{ status, user, refresh }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + its hook belong in one file
export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);
	if (!context) throw new Error('useAuth must be used within an AuthProvider');
	return context;
}

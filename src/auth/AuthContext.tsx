import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { me, type CurrentUser } from '../api/auth';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

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
			.catch(() => {
				setUser(null);
				setStatus('unauthenticated');
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

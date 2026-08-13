import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { me } from '../api/auth';

const AuthContext = createContext(null);

// Single shared session check for the whole app, so RequireAuth,
// RequireAdmin, and the Sidebar don't each independently call me() on mount
// and fire three /auth/me requests for one page load. refresh() lets
// Login/logout force a re-check once the session actually changes.
// eslint-disable-next-line react/prop-types -- no PropTypes elsewhere in this codebase
export function AuthProvider({ children }) {
	const [status, setStatus] = useState('checking'); // checking | authenticated | unauthenticated
	const [user, setUser] = useState(null);

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
		refresh();
	}, [refresh]);

	return <AuthContext.Provider value={{ status, user, refresh }}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + its hook belong in one file
export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) throw new Error('useAuth must be used within an AuthProvider');
	return context;
}

import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { SessionUnreachable } from './SessionUnreachable';

// Gates a route on having a valid session cookie. Renders nothing while
// checking (avoids a flash of protected content before the redirect fires).
//
// Only a 401 sends anyone to /login. A session check that *failed* gets an
// explicit "couldn't check" screen instead — see AuthContext's AuthStatus.
function RequireAuth({ children }: { children: ReactNode }) {
	const { status } = useAuth();

	if (status === 'checking') return null;
	if (status === 'unreachable') return <SessionUnreachable />;
	if (status === 'unauthenticated') return <Navigate to="/login" replace />;
	return <>{children}</>;
}

export default RequireAuth;

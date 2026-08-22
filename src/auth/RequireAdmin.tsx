import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { isAdmin } from './permissions';
import { SessionUnreachable } from './SessionUnreachable';

// Same session-check pattern as RequireAuth, plus a role check — a logged-in
// non-admin is sent to the app's default logged-in route (they're
// authenticated, just not authorized), while a logged-out visitor still goes
// to /login.
function RequireAdmin({ children }: { children: ReactNode }) {
	const { status, user } = useAuth();

	if (status === 'checking') return null;
	// Not /home: a failed check means the role is unknown too, so bouncing them
	// as a non-admin would be just as wrong as bouncing them as a stranger.
	if (status === 'unreachable') return <SessionUnreachable />;
	if (status === 'unauthenticated') return <Navigate to="/login" replace />;
	if (!isAdmin(user?.role)) return <Navigate to="/home" replace />;
	return <>{children}</>;
}

export default RequireAdmin;

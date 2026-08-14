import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

// Gates a route on having a valid session cookie. Renders nothing while
// checking (avoids a flash of protected content before the redirect fires).
function RequireAuth({ children }: { children: ReactNode }) {
	const { status } = useAuth();

	if (status === 'checking') return null;
	if (status === 'unauthenticated') return <Navigate to="/login" replace />;
	return <>{children}</>;
}

export default RequireAuth;

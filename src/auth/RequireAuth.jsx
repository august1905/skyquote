import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Gates a route on having a valid session cookie. Renders nothing while
// checking (avoids a flash of protected content before the redirect fires).
// eslint-disable-next-line react/prop-types -- no PropTypes elsewhere in this codebase
function RequireAuth({ children }) {
	const { status } = useAuth();

	if (status === 'checking') return null;
	if (status === 'unauthenticated') return <Navigate to="/login" replace />;
	return children;
}

export default RequireAuth;

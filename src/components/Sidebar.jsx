import { NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { isAdmin } from '../auth/permissions';
import Logo from './Logo';
import './Sidebar.css';

function Sidebar() {
	const { user, refresh } = useAuth();
	const navigate = useNavigate();

	async function handleLogout() {
		try {
			await logout();
		} finally {
			// Runs even if the logout call failed — the cookie may already be
			// gone/expired, and leaving the user stranded on a page they can no
			// longer load anything into is worse than a best-effort sign-out.
			await refresh();
			navigate('/login');
		}
	}

	return (
		<nav className="app-sidebar">
			<div className="app-sidebar-brand">
				<Logo height={28} />
			</div>

			<div className="app-sidebar-links">
				<NavLink to="/home" className="app-sidebar-link">
					Home
				</NavLink>
				<NavLink to="/documents" className="app-sidebar-link">
					Documents
				</NavLink>
				<NavLink to="/templates" className="app-sidebar-link">
					Templates
				</NavLink>
				<NavLink to="/contacts" className="app-sidebar-link">
					Contacts
				</NavLink>
				{isAdmin(user?.role) && (
					<NavLink to="/admin/users" className="app-sidebar-link">
						Users
					</NavLink>
				)}
			</div>

			<div className="app-sidebar-footer">
				{user && (
					<p className="app-sidebar-user">
						{user.first_name} {user.last_name}
					</p>
				)}
				<button type="button" className="app-sidebar-logout" onClick={handleLogout}>
					Log out
				</button>
			</div>
		</nav>
	);
}

export default Sidebar;

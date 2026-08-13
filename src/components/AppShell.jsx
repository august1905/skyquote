import Sidebar from './Sidebar';
import './AppShell.css';

// Sidebar + content column, shared by every logged-in page so the nav isn't
// re-declared (and re-styled) per page.
// eslint-disable-next-line react/prop-types -- no PropTypes elsewhere in this codebase
function AppShell({ children }) {
	return (
		<div className="app-shell">
			<Sidebar />
			<main className="app-shell-main">{children}</main>
		</div>
	);
}

export default AppShell;

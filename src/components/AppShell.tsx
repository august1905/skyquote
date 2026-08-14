import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import './AppShell.css';

// Sidebar + content column, shared by every logged-in page so the nav isn't
// re-declared (and re-styled) per page.
function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="app-shell">
			<Sidebar />
			<main className="app-shell-main">{children}</main>
		</div>
	);
}

export default AppShell;

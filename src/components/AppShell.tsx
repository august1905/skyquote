import type { ReactNode } from 'react';
import Sidebar from './Sidebar';
import './AppShell.css';

interface AppShellProps {
	children: ReactNode;
	/**
	 * For a page that owns its own scrolling — the template editor, whose canvas
	 * is a scroll region beside a fixed rail. Drops the content padding and the
	 * column's own `overflow`, so the page fills the viewport exactly instead of
	 * overflowing it by the padding and producing a second outer scrollbar.
	 */
	scroll?: 'column' | 'self';
}

// Sidebar + content column, shared by every logged-in page so the nav isn't
// re-declared (and re-styled) per page.
//
// The shell is a fixed-height viewport: the sidebar never scrolls, and exactly
// one thing inside it does. See AppShell.css for what that fixes.
function AppShell({ children, scroll = 'column' }: AppShellProps) {
	return (
		<div className="app-shell">
			<Sidebar />
			<main className={scroll === 'self' ? 'app-shell-main app-shell-main-flush' : 'app-shell-main'}>{children}</main>
		</div>
	);
}

export default AppShell;

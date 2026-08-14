import AppShell from '../components/AppShell';

// Placeholder — the real dashboard (graphs + analytics, per
// BASIC_ARCHITECHTURE.md) is a later phase. This exists now so the nav,
// route guards, and post-login redirect are all real and testable.
function Home() {
	return (
		<AppShell>
			<h1>Home</h1>
			<p>Dashboard analytics coming soon.</p>
		</AppShell>
	);
}

export default Home;

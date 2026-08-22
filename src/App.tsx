import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import PasswordReset from './pages/PasswordReset';
import DocumentView from './pages/DocumentView';
import Home from './pages/Home';
import Documents from './pages/Documents';
import DocumentDetail from './pages/DocumentDetail';
import Templates from './pages/Templates';
import TemplateEditor from './pages/TemplateEditor';
import Contacts from './pages/Contacts';
import AdminUsers from './pages/AdminUsers';
import RequireAuth from './auth/RequireAuth';
import RequireAdmin from './auth/RequireAdmin';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { SessionUnreachable } from './auth/SessionUnreachable';

// Bare "/" (and, via the catch-all, any unrecognized path) sends an already
// logged-in visitor to /home, and only falls back to /login once we know for
// sure there's no session — "the check failed" is not that certainty, so it gets
// the explicit screen rather than a guess in either direction.
function RootRedirect() {
	const { status } = useAuth();

	if (status === 'checking') return null;
	if (status === 'unreachable') return <SessionUnreachable />;
	return <Navigate to={status === 'authenticated' ? '/home' : '/login'} replace />;
}

function App() {
	return (
		<AuthProvider>
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<RootRedirect />} />
					<Route path="/login" element={<Login />} />
					<Route path="/password-reset" element={<PasswordReset />} />
					{/* Public, no login — a recipient's own document link (§11). Deliberately not inside AuthProvider's RequireAuth/RequireAdmin gating, same as /login. */}
					<Route path="/d/:documentId/:token" element={<DocumentView />} />
					<Route
						path="/home"
						element={
							<RequireAuth>
								<Home />
							</RequireAuth>
						}
					/>
					<Route
						path="/documents"
						element={
							<RequireAuth>
								<Documents />
							</RequireAuth>
						}
					/>
					{/* Before /documents/:documentId there was no way to *read* a
					    document internally — the list opened a modal of its status and
					    total. Note this is not `/d/:documentId/:token`, which is a
					    recipient's unauthenticated link view. */}
					<Route
						path="/documents/:documentId"
						element={
							<RequireAuth>
								<DocumentDetail />
							</RequireAuth>
						}
					/>
					<Route
						path="/templates"
						element={
							<RequireAuth>
								<Templates />
							</RequireAuth>
						}
					/>
					<Route
						path="/templates/:id/edit"
						element={
							<RequireAuth>
								<TemplateEditor />
							</RequireAuth>
						}
					/>
					<Route
						path="/contacts"
						element={
							<RequireAuth>
								<Contacts />
							</RequireAuth>
						}
					/>
					<Route
						path="/admin/users"
						element={
							<RequireAdmin>
								<AdminUsers />
							</RequireAdmin>
						}
					/>
					<Route path="*" element={<RootRedirect />} />
				</Routes>
			</BrowserRouter>
		</AuthProvider>
	);
}

export default App;

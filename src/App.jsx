import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import PasswordReset from './pages/PasswordReset';
import Home from './pages/Home';
import Documents from './pages/Documents';
import Templates from './pages/Templates';
import Contacts from './pages/Contacts';
import AdminUsers from './pages/AdminUsers';
import RequireAuth from './auth/RequireAuth';
import RequireAdmin from './auth/RequireAdmin';
import { AuthProvider, useAuth } from './auth/AuthContext';

// Bare "/" (and, via the catch-all, any unrecognized path) sends an already
// logged-in visitor to /home, and only falls back to /login once we know for
// sure there's no session.
function RootRedirect() {
	const { status } = useAuth();

	if (status === 'checking') return null;
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
					<Route
						path="/templates"
						element={
							<RequireAuth>
								<Templates />
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

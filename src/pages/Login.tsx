import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import Logo from '../components/Logo';
import './Auth.css';

function Login() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
	const [errorMessage, setErrorMessage] = useState('');
	const navigate = useNavigate();
	const { refresh } = useAuth();

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus('submitting');
		setErrorMessage('');

		try {
			await login({ email, password });
			// Updates the shared AuthContext before navigating so RequireAuth's
			// first render on /home already knows we're authenticated, instead
			// of briefly re-checking from a stale "unauthenticated" state.
			await refresh();
			void navigate('/home');
		} catch (err) {
			setStatus('error');
			setErrorMessage(err instanceof Error ? err.message : 'Login failed. Please try again.');
		}
	}

	return (
		<div className="auth-shell">
			<Logo height={36} className="auth-logo" />
			<div className="auth-card">
				<h1>Log in</h1>

				{status === 'error' && (
					<p className="auth-error" role="alert">
						{errorMessage}
					</p>
				)}

				<form onSubmit={(e) => void handleSubmit(e)}>
					<div className="auth-field">
						<label htmlFor="login-email">Email</label>
						<input
							id="login-email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
					</div>
					<div className="auth-field">
						<label htmlFor="login-password">Password</label>
						<input
							id="login-password"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
						/>
					</div>

					<button type="submit" className="auth-submit" disabled={status === 'submitting'}>
						{status === 'submitting' ? 'Logging in…' : 'Log in'}
					</button>
				</form>

				<p className="auth-secondary-link">
					<Link to="/password-reset">Forgot password?</Link>
				</p>
			</div>
		</div>
	);
}

export default Login;

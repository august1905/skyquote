import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, requestPasswordReset } from '../api/auth';
import Logo from '../components/Logo';
import './Auth.css';

const MIN_PASSWORD_LENGTH = 8;

// Step one: ask for a link. Deliberately shows the same confirmation whether
// or not the address has an account — the backend won't say (see
// POST /auth/password-reset/request), so neither does this.
function RequestForm() {
	const [email, setEmail] = useState('');
	const [status, setStatus] = useState('idle'); // idle | submitting | sent | error
	const [errorMessage, setErrorMessage] = useState('');

	async function handleSubmit(event) {
		event.preventDefault();
		setStatus('submitting');
		setErrorMessage('');

		try {
			await requestPasswordReset({ email });
			setStatus('sent');
		} catch (err) {
			setStatus('error');
			setErrorMessage(err?.message || 'Could not send the reset email. Please try again.');
		}
	}

	if (status === 'sent') {
		return (
			<div className="auth-card">
				<h1>Check your email</h1>
				<p className="auth-done">
					If an account exists for that address, a reset link is on its way. The link expires in one hour.
				</p>
				<p className="auth-secondary-link">
					<Link to="/login">Back to log in</Link>
				</p>
			</div>
		);
	}

	return (
		<div className="auth-card">
			<h1>Reset password</h1>
			<p className="auth-intro">Enter your email and we&apos;ll send you a link to set a new password.</p>

			{status === 'error' && (
				<p className="auth-error" role="alert">
					{errorMessage}
				</p>
			)}

			<form onSubmit={handleSubmit}>
				<div className="auth-field">
					<label htmlFor="reset-email">Email</label>
					<input
						id="reset-email"
						type="email"
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
				</div>

				<button type="submit" className="auth-submit" disabled={status === 'submitting'}>
					{status === 'submitting' ? 'Sending…' : 'Send reset link'}
				</button>
			</form>

			<p className="auth-secondary-link">
				<Link to="/login">Back to log in</Link>
			</p>
		</div>
	);
}

// Step two: the emailed link lands here with ?token=. The token is never
// validated up front — doing so would turn this page into an oracle for
// whether a guessed token is real, and the confirm call has to re-check it
// anyway.
// eslint-disable-next-line react/prop-types -- no PropTypes elsewhere in this codebase
function ConfirmForm({ token }) {
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [status, setStatus] = useState('idle'); // idle | submitting | error
	const [errorMessage, setErrorMessage] = useState('');
	const navigate = useNavigate();

	async function handleSubmit(event) {
		event.preventDefault();

		if (password !== confirmPassword) {
			setStatus('error');
			setErrorMessage('The two passwords don’t match');
			return;
		}

		setStatus('submitting');
		setErrorMessage('');

		try {
			await confirmPasswordReset({ token, password });
			// The reset dropped every session this account had, so there's
			// nothing to be logged into — send them to log in with the new
			// password rather than into the app.
			navigate('/login');
		} catch (err) {
			setStatus('error');
			setErrorMessage(err?.message || 'Could not reset your password. Please try again.');
		}
	}

	return (
		<div className="auth-card">
			<h1>Set a new password</h1>

			{status === 'error' && (
				<p className="auth-error" role="alert">
					{errorMessage}
				</p>
			)}

			<form onSubmit={handleSubmit}>
				<div className="auth-field">
					<label htmlFor="reset-password">New password</label>
					<input
						id="reset-password"
						type="password"
						autoComplete="new-password"
						minLength={MIN_PASSWORD_LENGTH}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
				</div>
				<div className="auth-field">
					{/* Not "Confirm new password" — that string contains the other
					    field's whole label, which makes an accessible-name lookup
					    for "New password" ambiguous. */}
					<label htmlFor="reset-password-confirm">Confirm password</label>
					<input
						id="reset-password-confirm"
						type="password"
						autoComplete="new-password"
						minLength={MIN_PASSWORD_LENGTH}
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						required
					/>
				</div>

				<button type="submit" className="auth-submit" disabled={status === 'submitting'}>
					{status === 'submitting' ? 'Saving…' : 'Set new password'}
				</button>
			</form>

			<p className="auth-secondary-link">
				<Link to="/password-reset">Request a new link</Link>
			</p>
		</div>
	);
}

function PasswordReset() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get('token');

	return (
		<div className="auth-shell">
			<Logo height={36} className="auth-logo" />
			{token ? <ConfirmForm token={token} /> : <RequestForm />}
		</div>
	);
}

export default PasswordReset;

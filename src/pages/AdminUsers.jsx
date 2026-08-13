import { useEffect, useState } from 'react';
import { listUsers, createUser, deactivateUser } from '../api/adminUsers';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../auth/permissions';
import AppShell from '../components/AppShell';
import LoadingSpinner from '../components/LoadingSpinner';
import './AdminUsers.css';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', password: '', role: 'member' };

function AdminUsers() {
	const { user } = useAuth();
	const currentUserId = user?.id;
	const [users, setUsers] = useState([]);
	const [status, setStatus] = useState('loading'); // loading | ready | error
	const [formOpen, setFormOpen] = useState(false);
	const [form, setForm] = useState(EMPTY_FORM);
	const [creating, setCreating] = useState(false);
	const [formError, setFormError] = useState('');
	// ROWID of the row currently showing its inline "deactivate?" confirm, or null.
	const [confirmingId, setConfirmingId] = useState(null);
	const [deactivatingId, setDeactivatingId] = useState(null);
	const [actionError, setActionError] = useState('');

	function loadUsers() {
		setStatus('loading');
		return listUsers()
			.then((data) => {
				setUsers(data);
				setStatus('ready');
			})
			.catch(() => setStatus('error'));
	}

	useEffect(() => {
		loadUsers();
	}, []);

	function updateField(field, value) {
		setForm((current) => ({ ...current, [field]: value }));
	}

	async function handleCreateSubmit(event) {
		event.preventDefault();
		setFormError('');
		setCreating(true);
		try {
			await createUser(form);
			setForm(EMPTY_FORM);
			setFormOpen(false);
			await loadUsers();
		} catch (err) {
			setFormError(err?.message || 'Could not create user. Please try again.');
		} finally {
			setCreating(false);
		}
	}

	async function handleConfirmDeactivate(id) {
		setActionError('');
		setDeactivatingId(id);
		try {
			await deactivateUser(id);
			setConfirmingId(null);
			await loadUsers();
		} catch (err) {
			setActionError(err?.message || 'Could not deactivate user. Please try again.');
		} finally {
			setDeactivatingId(null);
		}
	}

	return (
		<AppShell>
			<div className="admin-users-header">
				<h1>Users</h1>
				<button
					type="button"
					className="admin-users-new-button"
					onClick={() => {
						setFormError('');
						setFormOpen((open) => !open);
					}}
				>
					New user
				</button>
			</div>

			{formOpen && (
				<form className="admin-users-form" onSubmit={handleCreateSubmit}>
					{formError && (
						<p className="admin-users-form-error" role="alert">
							{formError}
						</p>
					)}
					<div className="admin-users-form-grid">
						<div className="admin-users-field">
							<label htmlFor="new-user-first-name">First name</label>
							<input
								id="new-user-first-name"
								value={form.firstName}
								onChange={(e) => updateField('firstName', e.target.value)}
								required
							/>
						</div>
						<div className="admin-users-field">
							<label htmlFor="new-user-last-name">Last name</label>
							<input
								id="new-user-last-name"
								value={form.lastName}
								onChange={(e) => updateField('lastName', e.target.value)}
								required
							/>
						</div>
						<div className="admin-users-field">
							<label htmlFor="new-user-email">Email</label>
							<input
								id="new-user-email"
								type="email"
								autoComplete="off"
								value={form.email}
								onChange={(e) => updateField('email', e.target.value)}
								required
							/>
						</div>
						<div className="admin-users-field">
							<label htmlFor="new-user-password">Initial password</label>
							<input
								id="new-user-password"
								type="password"
								autoComplete="new-password"
								minLength={8}
								value={form.password}
								onChange={(e) => updateField('password', e.target.value)}
								required
							/>
						</div>
						<div className="admin-users-field">
							<label htmlFor="new-user-role">Role</label>
							<select id="new-user-role" value={form.role} onChange={(e) => updateField('role', e.target.value)}>
								<option value="member">Member</option>
								<option value="admin">Admin</option>
							</select>
						</div>
					</div>

					<div className="admin-users-form-actions">
						<button type="submit" className="admin-users-primary-button" disabled={creating}>
							{creating ? 'Creating…' : 'Create user'}
						</button>
						<button
							type="button"
							className="admin-users-cancel-button"
							onClick={() => {
								setFormOpen(false);
								setForm(EMPTY_FORM);
								setFormError('');
							}}
							disabled={creating}
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{actionError && (
				<p className="admin-users-form-error" role="alert">
					{actionError}
				</p>
			)}

			{status === 'loading' && <LoadingSpinner fullPage />}
			{status === 'error' && <p className="admin-users-error">Could not load users.</p>}

			{status === 'ready' && (
				<div className="admin-users-table-wrap">
					<table className="admin-users-table">
						<thead>
							<tr>
								<th>Name</th>
								<th>Email</th>
								<th>Role</th>
								<th>Status</th>
								<th aria-label="Actions" />
							</tr>
						</thead>
						<tbody>
							{users.map((row) => (
								<tr key={row.id} className={row.is_active ? '' : 'admin-users-row-inactive'}>
									<td>
										{row.first_name} {row.last_name}
									</td>
									<td>{row.email}</td>
									<td className="admin-users-role-cell">{ROLE_LABELS[row.role] || row.role}</td>
									<td>
										<span className={row.is_active ? 'admin-users-status-active' : 'admin-users-status-inactive'}>
											{row.is_active ? 'Active' : 'Deactivated'}
										</span>
									</td>
									<td className="admin-users-actions-cell">
										{!row.is_active ? null : row.id === currentUserId ? (
											<span className="admin-users-self-note">This is you</span>
										) : confirmingId === row.id ? (
											<span className="admin-users-confirm">
												Deactivate?
												<button
													type="button"
													className="admin-users-confirm-yes"
													onClick={() => handleConfirmDeactivate(row.id)}
													disabled={deactivatingId === row.id}
												>
													{deactivatingId === row.id ? 'Deactivating…' : 'Yes'}
												</button>
												<button
													type="button"
													className="admin-users-confirm-cancel"
													onClick={() => setConfirmingId(null)}
													disabled={deactivatingId === row.id}
												>
													Cancel
												</button>
											</span>
										) : (
											<button
												type="button"
												className="admin-users-deactivate-button"
												onClick={() => setConfirmingId(row.id)}
											>
												Deactivate
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</AppShell>
	);
}

export default AdminUsers;

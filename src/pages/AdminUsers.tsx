import { useEffect, useState, type FormEvent } from 'react';
import { listUsers, createUser, deactivateUser, type AdminUser, type CreateUserInput } from '../api/adminUsers';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, type Role } from '../auth/permissions';
import AppShell from '../components/AppShell';
import LoadingSpinner from '../components/LoadingSpinner';
import './AdminUsers.css';

const EMPTY_FORM: CreateUserInput = { firstName: '', lastName: '', email: '', password: '', role: 'member' };

function AdminUsers() {
	const { user } = useAuth();
	const currentUserId = user?.id;
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [formOpen, setFormOpen] = useState(false);
	const [form, setForm] = useState<CreateUserInput>(EMPTY_FORM);
	const [creating, setCreating] = useState(false);
	const [formError, setFormError] = useState('');
	// ROWID of the row currently showing its inline "deactivate?" confirm, or null.
	const [confirmingId, setConfirmingId] = useState<string | null>(null);
	const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
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
		void loadUsers();
	}, []);

	function updateField<K extends keyof CreateUserInput>(field: K, value: CreateUserInput[K]) {
		setForm((current) => ({ ...current, [field]: value }));
	}

	async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError('');
		setCreating(true);
		try {
			await createUser(form);
			setForm(EMPTY_FORM);
			setFormOpen(false);
			await loadUsers();
		} catch (err) {
			setFormError(err instanceof Error ? err.message : 'Could not create user. Please try again.');
		} finally {
			setCreating(false);
		}
	}

	async function handleConfirmDeactivate(id: string) {
		setActionError('');
		setDeactivatingId(id);
		try {
			await deactivateUser(id);
			setConfirmingId(null);
			await loadUsers();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : 'Could not deactivate user. Please try again.');
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
				<form className="admin-users-form" onSubmit={(e) => void handleCreateSubmit(e)}>
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
							<select
								id="new-user-role"
								value={form.role}
								onChange={(e) => updateField('role', e.target.value as Role)}
							>
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
													onClick={() => void handleConfirmDeactivate(row.id)}
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

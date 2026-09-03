import { useState } from 'react';
import { addRole, createRole, defaultRoleColor, deleteFieldsForRole, nextRoleName, reassignFieldsRole, recolorRole, removeRole, renameRole, setIsSender, setSigningOrder } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { collectAllFields } from '../fields/collectFields';
import type { Role, RoleId } from '../types';
import './rightrail.css';

interface RolesPanelProps {
	onClose: () => void;
}

interface RemovalPrompt {
	role: Role;
	fieldCount: number;
	reassignTo: RoleId;
}

/**
 * §3's Recipients/Roles panel: "Role list, add role, color, signing order."
 * §6.1 rule 4: "Deleting a role prompts: reassign its fields to another
 * role, or delete them." — checked here (via `collectAllFields`, the one
 * place that can see every field regardless of where it's placed) before
 * `removeRole` ever runs; `removeRole` itself stays a plain, unguarded
 * delete (same convention as `deletePage`) since by the time it's called,
 * the field question has already been resolved one way or the other.
 */
export function RolesPanel({ onClose }: RolesPanelProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const roles = useEditorStore((s) => s.body?.roles ?? []);
	const [removalPrompt, setRemovalPrompt] = useState<RemovalPrompt | null>(null);

	function handleAddRole() {
		const role = createRole({ name: nextRoleName(roles), color: defaultRoleColor(roles) });
		runCommand(addRole(role));
	}

	function handleRemoveClick(role: Role) {
		const body = useEditorStore.getState().body;
		const fieldCount = body ? collectAllFields(body).filter((f) => f.roleId === role.id).length : 0;
		if (fieldCount === 0) {
			runCommand(removeRole(role.id));
			return;
		}
		const fallbackRole = roles.find((r) => r.id !== role.id);
		setRemovalPrompt({ role, fieldCount, reassignTo: fallbackRole?.id ?? '' });
	}

	function confirmReassignAndRemove() {
		if (!removalPrompt || !removalPrompt.reassignTo) return;
		runCommand(reassignFieldsRole(removalPrompt.role.id, removalPrompt.reassignTo));
		runCommand(removeRole(removalPrompt.role.id));
		setRemovalPrompt(null);
	}

	function confirmDeleteFieldsAndRemove() {
		if (!removalPrompt) return;
		runCommand(deleteFieldsForRole(removalPrompt.role.id));
		runCommand(removeRole(removalPrompt.role.id));
		setRemovalPrompt(null);
	}

	const otherRoles = removalPrompt ? roles.filter((r) => r.id !== removalPrompt.role.id) : [];

	return (
		<div className="roles-panel">
			<div className="roles-panel-header">
				<h2>Recipients / Roles</h2>
				<button type="button" aria-label="Close roles panel" onClick={onClose}>
					×
				</button>
			</div>
			{roles.length === 0 && <p className="roles-panel-empty">No roles yet. Add one to start assigning fillable fields.</p>}
			{removalPrompt && (
				<div className="roles-panel-removal-prompt" role="alertdialog">
					<p>
						{removalPrompt.fieldCount} field{removalPrompt.fieldCount === 1 ? '' : 's'} use{removalPrompt.fieldCount === 1 ? 's' : ''} “{removalPrompt.role.name}”.
						Reassign them to another role, or delete them along with the role.
					</p>
					{otherRoles.length > 0 && (
						<label className="roles-panel-removal-reassign">
							<span>Reassign to</span>
							<select value={removalPrompt.reassignTo} onChange={(e) => setRemovalPrompt({ ...removalPrompt, reassignTo: e.target.value })}>
								{otherRoles.map((r) => (
									<option key={r.id} value={r.id}>
										{r.name}
									</option>
								))}
							</select>
						</label>
					)}
					<div className="roles-panel-removal-actions">
						{otherRoles.length > 0 && (
							<button type="button" onClick={confirmReassignAndRemove}>
								Reassign fields & remove role
							</button>
						)}
						<button type="button" onClick={confirmDeleteFieldsAndRemove}>
							Delete fields & remove role
						</button>
						<button type="button" onClick={() => setRemovalPrompt(null)}>
							Cancel
						</button>
					</div>
				</div>
			)}
			<ul className="roles-panel-list">
				{roles.map((role) => (
					<RoleRow
						key={role.id}
						role={role}
						onRename={(name) => runCommand(renameRole(role.id, name), { coalesceKey: `role-name-${role.id}` })}
						onRecolor={(color) => runCommand(recolorRole(role.id, color))}
						onToggleSender={(isSender) => runCommand(setIsSender(role.id, isSender))}
						onSigningOrderChange={(signingOrder) => runCommand(setSigningOrder(role.id, signingOrder), { coalesceKey: `role-signing-order-${role.id}` })}
						onRemove={() => handleRemoveClick(role)}
						onBlur={endCoalescing}
					/>
				))}
			</ul>
			<button type="button" className="roles-panel-add" onClick={handleAddRole}>
				+ Add role
			</button>
		</div>
	);
}

interface RoleRowProps {
	role: Role;
	onRename: (name: string) => void;
	onRecolor: (color: string) => void;
	onToggleSender: (isSender: boolean) => void;
	onSigningOrderChange: (signingOrder: number | undefined) => void;
	onRemove: () => void;
	onBlur: () => void;
}

/**
 * The name is the row — everything else is a secondary control beneath it.
 *
 * It used to share one line with a colour swatch, a two-button ↑/↓ pair and a
 * full-width "Remove", which left the field itself about 45px wide: "Contact
 * (Signer)" rendered as "Conta". Grayson, 2026-09-03: "the styling in
 * recipients/roles is almost unusable. Remove the little arrows and just make
 * this reasonable."
 *
 * The arrows are gone rather than restyled. They reordered `body.roles`, which
 * is not the order anything downstream reads — `signingOrder` on the row below
 * is what actually sequences the signers, and every template is seeded with its
 * two roles already in the order they're signed in.
 */
function RoleRow({ role, onRename, onRecolor, onToggleSender, onSigningOrderChange, onRemove, onBlur }: RoleRowProps) {
	return (
		<li className="roles-panel-row">
			<div className="roles-panel-row-main">
				<input
					type="color"
					aria-label={`${role.name} color`}
					value={role.color}
					onChange={(e) => onRecolor(e.target.value)}
				/>
				<input type="text" aria-label="Role name" value={role.name} onChange={(e) => onRename(e.target.value)} onBlur={onBlur} />
				{/* Still `Remove {name}` to a screen reader — only the visible label
				    shrank to a glyph, and the name is what tells two rows apart. */}
				<button type="button" className="roles-panel-row-remove" aria-label={`Remove ${role.name}`} onClick={onRemove} title={`Remove ${role.name}`}>
					×
				</button>
			</div>
			<div className="roles-panel-row-details">
				<label className="roles-panel-row-check">
					<input type="checkbox" checked={role.isSender} onChange={(e) => onToggleSender(e.target.checked)} />
					Sender
				</label>
				<label className="roles-panel-row-order">
					<span>Signing order</span>
					<input
						type="number"
						min={1}
						aria-label="Signing order"
						// Placeholder rather than a defaulted value: blank genuinely
						// means "no explicit order", which is a different state from 1.
						placeholder="–"
						value={role.signingOrder ?? ''}
						onChange={(e) => {
							const raw = e.target.value;
							onSigningOrderChange(raw === '' ? undefined : Number(raw));
						}}
						onBlur={onBlur}
					/>
				</label>
			</div>
		</li>
	);
}

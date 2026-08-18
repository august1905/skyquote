import { useState } from 'react';
import { addRole, createRole, defaultRoleColor, deleteFieldsForRole, moveRole, nextRoleName, reassignFieldsRole, recolorRole, removeRole, renameRole, setIsSender, setSigningOrder } from '../commands';
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
				{roles.map((role, index) => (
					<RoleRow
						key={role.id}
						role={role}
						canMoveUp={index > 0}
						canMoveDown={index < roles.length - 1}
						onRename={(name) => runCommand(renameRole(role.id, name), { coalesceKey: `role-name-${role.id}` })}
						onRecolor={(color) => runCommand(recolorRole(role.id, color))}
						onToggleSender={(isSender) => runCommand(setIsSender(role.id, isSender))}
						onSigningOrderChange={(signingOrder) => runCommand(setSigningOrder(role.id, signingOrder), { coalesceKey: `role-signing-order-${role.id}` })}
						onMoveUp={() => runCommand(moveRole(role.id, index - 1))}
						onMoveDown={() => runCommand(moveRole(role.id, index + 1))}
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
	canMoveUp: boolean;
	canMoveDown: boolean;
	onRename: (name: string) => void;
	onRecolor: (color: string) => void;
	onToggleSender: (isSender: boolean) => void;
	onSigningOrderChange: (signingOrder: number | undefined) => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onRemove: () => void;
	onBlur: () => void;
}

function RoleRow({ role, canMoveUp, canMoveDown, onRename, onRecolor, onToggleSender, onSigningOrderChange, onMoveUp, onMoveDown, onRemove, onBlur }: RoleRowProps) {
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
				<div className="roles-panel-row-move">
					<button type="button" aria-label="Move role up" onClick={onMoveUp} disabled={!canMoveUp}>
						↑
					</button>
					<button type="button" aria-label="Move role down" onClick={onMoveDown} disabled={!canMoveDown}>
						↓
					</button>
				</div>
				<button type="button" aria-label={`Remove ${role.name}`} onClick={onRemove}>
					Remove
				</button>
			</div>
			<div className="roles-panel-row-details">
				<label>
					<input type="checkbox" checked={role.isSender} onChange={(e) => onToggleSender(e.target.checked)} />
					Sender
				</label>
				<label>
					Signing order
					<input
						type="number"
						min={1}
						aria-label="Signing order"
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

import { addRole, createRole, defaultRoleColor, moveRole, nextRoleName, recolorRole, removeRole, renameRole, setIsSender, setSigningOrder } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { Role } from '../types';
import './rightrail.css';

interface RolesPanelProps {
	onClose: () => void;
}

/**
 * §3's Recipients/Roles panel: "Role list, add role, color, signing order."
 * Every field a `Role` has is editable here (§2.2); deleting a role that
 * fields still reference is handled where fields exist to reference it (see
 * BUILD_STATUS.md) — with zero fields built yet, `removeRole` here is a
 * plain, unguarded delete, same as `deletePage`'s convention.
 */
export function RolesPanel({ onClose }: RolesPanelProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const roles = useEditorStore((s) => s.body?.roles ?? []);

	function handleAddRole() {
		const role = createRole({ name: nextRoleName(roles), color: defaultRoleColor(roles) });
		runCommand(addRole(role));
	}

	return (
		<div className="roles-panel">
			<div className="roles-panel-header">
				<h2>Recipients / Roles</h2>
				<button type="button" aria-label="Close roles panel" onClick={onClose}>
					×
				</button>
			</div>
			{roles.length === 0 && <p className="roles-panel-empty">No roles yet. Add one to start assigning fillable fields.</p>}
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
						onRemove={() => runCommand(removeRole(role.id))}
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

import { useEditorStore } from '../store/editorStore';
import type { Role } from '../types';
import { roleInitials } from './roleInitials';
import './header.css';

/**
 * §3 ①'s "Role avatar stack — one chip per role, colored per `Role.color`,
 * initials only (`CL`, `SE`)", plus the **Manage** button beside it, which §3
 * defines as opening the role-management panel.
 *
 * Manage opens the *same* rail panel the 👥 icon does rather than a second
 * dialog of its own — hence the panel's open state living in the store (see
 * `editorStore.ts`'s `openRailPanel`). Two ways in, one panel.
 *
 * Renders nothing at all when a template has no roles yet: an empty stack is
 * visual noise, and the Roles panel is already reachable from the rail. The
 * `Manage` button appears with the first role.
 */
export function RoleAvatarStack() {
	const roles = useEditorStore((s) => s.body?.roles ?? []);
	const setOpenRailPanel = useEditorStore((s) => s.setOpenRailPanel);

	if (roles.length === 0) return null;

	// Signing order is the order the stack should read in — §6.1's own ordering,
	// not whatever order the roles happen to sit in the array.
	const ordered = [...roles].sort((a, b) => a.order - b.order);

	return (
		<div className="role-avatar-stack">
			<div className="role-avatar-chips" role="list" aria-label="Recipient roles">
				{ordered.map((role: Role) => (
					<span
						key={role.id}
						role="listitem"
						className="role-avatar-chip"
						style={{ backgroundColor: role.color }}
						// The initials alone aren't enough for anyone not reading by
						// sight, and the colour carries meaning elsewhere in the editor.
						title={role.name}
						aria-label={role.name}
					>
						{roleInitials(role.name)}
					</span>
				))}
			</div>
			<button type="button" className="header-text-button" onClick={() => setOpenRailPanel('roles')}>
				Manage
			</button>
		</div>
	);
}

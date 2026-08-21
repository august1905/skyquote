import { useEditorStore } from '../store/editorStore';

/**
 * §6.1 rule 3's "Preview as {role}" toggle. §9.3's `Cmd+P` now toggles
 * previewing on and off (see `keyboard/useEditorShortcuts.ts`) — choosing
 * *which* role stays this dropdown's job, since one keystroke can't express
 * that unambiguously once there's more than one role.
 */
export function PreviewRoleToggle() {
	const roles = useEditorStore((s) => s.body?.roles ?? []);
	const previewRoleId = useEditorStore((s) => s.previewRoleId);
	const setPreviewRoleId = useEditorStore((s) => s.setPreviewRoleId);

	if (roles.length === 0) return null;

	return (
		<label className={`preview-role-toggle${previewRoleId ? ' preview-role-toggle-active' : ''}`}>
			Preview as
			<select value={previewRoleId ?? ''} onChange={(e) => setPreviewRoleId(e.target.value || null)}>
				<option value="">Not previewing</option>
				{roles.map((role) => (
					<option key={role.id} value={role.id}>
						{role.name}
					</option>
				))}
			</select>
		</label>
	);
}

import { useEditorStore } from '../store/editorStore';

/**
 * §6.1 rule 3's "Preview as {role}" toggle — a plain header control, not
 * bound to §9.3's `Cmd+P` shortcut. That whole keyboard-shortcut layer isn't
 * built anywhere yet (Undo/Redo are plain buttons too, not `Cmd+Z`-bound),
 * so adding just this one binding in isolation would be inconsistent rather
 * than completing something real — see BUILD_STATUS.md.
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

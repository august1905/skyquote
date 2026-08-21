import { useState } from 'react';
import './contentLibrary.css';

interface SaveToLibraryDialogProps {
	/** What's being saved, for the heading — "this block", "3 blocks", "this page". */
	subject: string;
	defaultName: string;
	onCancel: () => void;
	onSave: (name: string, tags: string[]) => Promise<void>;
}

/**
 * §8's library items carry a name and tags, neither of which can be inferred
 * from the content being saved — so all three save entry points open this
 * rather than silently inventing a name.
 *
 * A real dialog rather than a `window.prompt` (which the link control in §2's
 * toolbar does use): this needs two fields, and a prompt can only collect one.
 */
export function SaveToLibraryDialog({ subject, defaultName, onCancel, onSave }: SaveToLibraryDialogProps) {
	const [name, setName] = useState(defaultName);
	const [tagsText, setTagsText] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const trimmedName = name.trim();

	async function handleSave() {
		if (!trimmedName) return;
		setSaving(true);
		setError(null);
		try {
			// Split on commas, since that's how they're stored — the backend
			// strips any comma inside an individual tag for the same reason.
			await onSave(
				trimmedName,
				tagsText
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean)
			);
		} catch {
			setError('Could not save to the content library.');
			setSaving(false);
		}
	}

	return (
		<div className="save-to-library-overlay" role="dialog" aria-label="Save to Content Library">
			<div className="save-to-library-card">
				<h2>Save {subject} to the Content Library</h2>
				<label className="save-to-library-field">
					Name
					<input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} maxLength={255} />
				</label>
				<label className="save-to-library-field">
					Tags
					<input type="text" value={tagsText} placeholder="terms, cover, legal" onChange={(e) => setTagsText(e.target.value)} />
				</label>
				<p className="save-to-library-hint">Comma-separated. Tags are searchable alongside the name.</p>
				{error && (
					<p className="save-to-library-error" role="alert">
						{error}
					</p>
				)}
				<div className="save-to-library-actions">
					<button type="button" onClick={onCancel} disabled={saving}>
						Cancel
					</button>
					<button type="button" onClick={() => void handleSave()} disabled={saving || !trimmedName}>
						{saving ? 'Saving…' : 'Save'}
					</button>
				</div>
			</div>
		</div>
	);
}

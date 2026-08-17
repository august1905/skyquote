import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTemplate } from '../api/templates';
import AppShell from '../components/AppShell';

// Placeholder — the real list view (folders + search, no tabs) is a later
// phase. "+ New template" is real, permanent, and not part of that later
// work: it's the only way to reach the editor until the list exists.
function Templates() {
	const navigate = useNavigate();
	const [creating, setCreating] = useState(false);

	async function handleCreate() {
		setCreating(true);
		try {
			const { meta } = await createTemplate();
			void navigate(`/templates/${meta.id}/edit`);
		} finally {
			setCreating(false);
		}
	}

	return (
		<AppShell>
			<h1>Templates</h1>
			<p>Template list coming soon.</p>
			<button type="button" onClick={() => void handleCreate()} disabled={creating}>
				{creating ? 'Creating…' : '+ New template'}
			</button>
		</AppShell>
	);
}

export default Templates;

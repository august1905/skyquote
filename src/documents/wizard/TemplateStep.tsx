import { useEffect, useMemo, useState } from 'react';
import { listTemplates } from '../../api/templates';
import { searchTemplates } from '../../templates/templateListView';
import type { TemplateMeta } from '../../editor/types';

interface TemplateStepProps {
	/** Set once a template has been chosen, so returning to this step shows which one. */
	selectedId: string | null;
	/** Choosing advances the wizard — the caller loads the body, which is why it also reports `loading`. */
	onChoose: (meta: TemplateMeta) => void;
	loading: boolean;
	error: string | null;
}

/**
 * Which template this document starts from.
 *
 * The first of the two questions the Documents screen's `Create document` asks.
 * It doesn't exist on the editor's own entry point, where the answer is already
 * known — see `wizardStepsFor`.
 *
 * Metadata only: `listTemplates` deliberately returns no bodies, so opening this
 * costs one request no matter how many templates exist. The chosen template's
 * body is fetched once, on selection.
 */
export function TemplateStep({ selectedId, onChoose, loading, error }: TemplateStepProps) {
	const [templates, setTemplates] = useState<TemplateMeta[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [query, setQuery] = useState('');

	useEffect(() => {
		let cancelled = false;
		listTemplates()
			.then((result) => {
				if (!cancelled) setTemplates(result.templates);
			})
			.catch(() => {
				if (!cancelled) setLoadError('Could not load your templates.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Newest activity first: the template someone is building documents from is
	// almost always one they were recently editing.
	const visible = useMemo(() => {
		if (!templates) return [];
		const matched = query.trim() ? searchTemplates(templates, query) : templates;
		return [...matched].sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
	}, [templates, query]);

	return (
		<div className="wizard-step">
			<label className="wizard-field">
				Search templates
				<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Template name" autoFocus />
			</label>

			{loadError && (
				<p className="wizard-error" role="alert">
					{loadError}
				</p>
			)}
			{error && (
				<p className="wizard-error" role="alert">
					{error}
				</p>
			)}
			{!templates && !loadError && <p className="wizard-hint">Loading templates…</p>}
			{templates && visible.length === 0 && <p className="wizard-hint">{query.trim() ? 'No template matches that.' : 'No templates yet — create one from the Templates screen first.'}</p>}

			<ul className="wizard-picker-list">
				{visible.map((template) => (
					<li key={template.id}>
						<button
							type="button"
							className={`wizard-picker-row${template.id === selectedId ? ' wizard-picker-row-selected' : ''}`}
							onClick={() => onChoose(template)}
							disabled={loading}
						>
							<span className="wizard-picker-title">{template.name || 'Untitled template'}</span>
							<span className="wizard-picker-meta">Edited {new Date(template.updatedAt || template.createdAt).toLocaleDateString()}</span>
						</button>
					</li>
				))}
			</ul>

			{loading && <p className="wizard-hint">Opening template…</p>}
		</div>
	);
}

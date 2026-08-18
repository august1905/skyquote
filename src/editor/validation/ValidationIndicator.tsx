import { useState } from 'react';
import { computeValidationIssues } from './computeValidationIssues';
import { useEditorStore } from '../store/editorStore';
import './validationIndicator.css';

/**
 * §9.4: "A persistent, dismissible issues indicator." Persistent — the
 * badge itself is always there while any issue exists, recomputed live off
 * the current template; dismissible — clicking it opens the list, and
 * closing that list (not the badge) is the "dismissible" part. There's
 * nothing yet to wire `Create document`'s "warns on any error-level issue"
 * into (no such button exists before phase 4), so that half of §9.4 is
 * deferred until it does.
 */
export function ValidationIndicator() {
	const [open, setOpen] = useState(false);
	const body = useEditorStore((s) => s.body);
	const meta = useEditorStore((s) => s.meta);

	if (!body || !meta) return null;
	const issues = computeValidationIssues(body, meta.name);
	if (issues.length === 0) return null;

	const errorCount = issues.filter((issue) => issue.severity === 'error').length;

	return (
		<div className="validation-indicator">
			<button
				type="button"
				className={`validation-indicator-badge${errorCount > 0 ? ' validation-indicator-badge-error' : ''}`}
				onClick={() => setOpen((o) => !o)}
			>
				⚠ {issues.length} issue{issues.length === 1 ? '' : 's'}
			</button>
			{open && (
				<div className="validation-indicator-panel">
					<div className="validation-indicator-panel-header">
						<h2>Issues</h2>
						<button type="button" aria-label="Close issues" onClick={() => setOpen(false)}>
							×
						</button>
					</div>
					<ul>
						{issues.map((issue) => (
							<li key={issue.id} className={`validation-issue validation-issue-${issue.severity}`}>
								{issue.message}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

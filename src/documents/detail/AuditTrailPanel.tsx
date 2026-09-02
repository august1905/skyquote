import { useState } from 'react';
import { auditTrailCsv, formatRelativeTime, type AuditEntry } from './auditTrail';

interface AuditTrailPanelProps {
	entries: AuditEntry[];
	documentTitle: string;
	onClose: () => void;
	/** Re-reads the document so webhook-delivered events (someone signed five minutes ago) show up without a full page reload. */
	onRefresh: () => Promise<void>;
}

/**
 * The document's step-by-step history — `DocumentEvents` rendered as a
 * timeline, newest first. The rows come down with the document itself
 * (`GET /documents/:id` has always returned them; this panel is the first
 * thing to actually show them).
 */
export function AuditTrailPanel({ entries, documentTitle, onClose, onRefresh }: AuditTrailPanelProps) {
	const [refreshing, setRefreshing] = useState(false);

	async function handleRefresh() {
		setRefreshing(true);
		try {
			await onRefresh();
		} finally {
			setRefreshing(false);
		}
	}

	function handleExport() {
		const blob = new Blob([auditTrailCsv(entries)], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${documentTitle || 'document'} — audit trail.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	return (
		<div className="document-rail-panel audit-rail-panel" aria-label="Audit trail">
			<div className="document-rail-panel-header">
				<h2>Audit trail</h2>
				<button type="button" aria-label="Close audit trail panel" onClick={onClose}>
					×
				</button>
			</div>
			<p className="document-rail-panel-hint">A step-by-step history of this document&apos;s changes.</p>
			<div className="audit-panel-actions">
				<button type="button" className="audit-panel-export" onClick={handleExport} disabled={entries.length === 0}>
					Export as CSV
				</button>
				<button type="button" className="audit-panel-refresh" onClick={() => void handleRefresh()} disabled={refreshing}>
					{refreshing ? 'Refreshing…' : 'Refresh'}
				</button>
			</div>
			{entries.length === 0 ? (
				<p className="audit-panel-empty">Nothing recorded yet.</p>
			) : (
				<ol className="audit-panel-list">
					{entries.map((entry) => (
						<li key={entry.id} className={`audit-entry audit-entry-${entry.tone}`}>
							<span className="audit-entry-label">
								<span className="audit-entry-dot" aria-hidden="true" />
								{entry.label}
							</span>
							<div className="audit-entry-body">
								<p className="audit-entry-description">{entry.description}</p>
								<time className="audit-entry-time" dateTime={entry.occurredAt ?? undefined} title={entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : undefined}>
									{formatRelativeTime(entry.occurredAt)}
								</time>
							</div>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

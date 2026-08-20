import { useEffect, useState } from 'react';
import { listDocuments } from '../api/documents';
import type { DocumentMeta, DocumentStatus } from '../editor/types';
import { formatMoney } from '../pricing/formatMoney';
import { DocumentDetailModal } from '../documents/DocumentDetailModal';
import AppShell from '../components/AppShell';
import './Documents.css';

const STATUS_LABEL: Record<DocumentStatus, string> = {
	draft: 'Draft',
	sent: 'Sent',
	viewed: 'Viewed',
	completed: 'Completed',
	declined: 'Declined',
};

/**
 * The real list view — no folders/tabs/search yet (same "later phase" scope
 * note `Templates.tsx`'s own placeholder carries; this is the first of the
 * two to actually get built, since it closes a real gap: before this,
 * there was no way to ever find a document again, or recover a recipient's
 * link, once the Create Document wizard's own success screen was closed.
 */
function Documents() {
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [documents, setDocuments] = useState<DocumentMeta[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		listDocuments()
			.then((result) => {
				if (cancelled) return;
				setDocuments(result.documents);
				setStatus('ready');
			})
			.catch(() => {
				if (!cancelled) setStatus('error');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<AppShell>
			<div className="documents-page">
				<h1>Documents</h1>
				{status === 'loading' && <p>Loading…</p>}
				{status === 'error' && <p role="alert">Couldn&apos;t load documents.</p>}
				{status === 'ready' && documents.length === 0 && <p>No documents yet — create one from a template&apos;s editor.</p>}
				{status === 'ready' && documents.length > 0 && (
					<table className="documents-table">
						<thead>
							<tr>
								<th>Title</th>
								<th>Status</th>
								<th>Total</th>
								<th>Created</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{documents.map((doc) => (
								<tr key={doc.id}>
									<td>{doc.title}</td>
									<td>
										<span className={`documents-status-pill documents-status-${doc.status}`}>{STATUS_LABEL[doc.status]}</span>
									</td>
									<td>{formatMoney(doc.computedTotal, doc.currency)}</td>
									<td>{new Date(doc.createdAt).toLocaleDateString()}</td>
									<td>
										<button type="button" onClick={() => setSelectedId(doc.id)}>
											View
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
			{selectedId && <DocumentDetailModal documentId={selectedId} onClose={() => setSelectedId(null)} />}
		</AppShell>
	);
}

export default Documents;

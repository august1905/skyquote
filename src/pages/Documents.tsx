import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listDocuments } from '../api/documents';
import type { DocumentMeta, DocumentStatus } from '../editor/types';
import { formatMoney } from '../pricing/formatMoney';
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
 * The Documents list. Exists to close a real gap: before it, there was no way to
 * find a document again — or recover a recipient's link — once the Create
 * Document wizard's success screen was closed.
 *
 * Clicking a row **opens the document** at `/documents/:id`. It used to open a
 * modal listing status, total and recipients; Grayson, 2026-08-22: "When I click
 * on a document off of the document list, or anywhere, I want it to actually
 * open, in that tab. Right now it just shows a few pieces of info." Everything
 * that modal did (recipients, regenerate a link) lives on that page now, next to
 * the document itself.
 *
 * Still short of `BASIC_ARCHITECHTURE.md` for this screen: no folders, no tabs
 * (All / Created by me / Recent), no search, no `New folder`. The Templates list
 * has all of that, and `templates/templateListView.ts` is the shape this one
 * would reuse.
 */
function Documents() {
	const navigate = useNavigate();
	const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
	const [documents, setDocuments] = useState<DocumentMeta[]>([]);

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

	function open(id: string) {
		void navigate(`/documents/${id}`);
	}

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
								<tr key={doc.id} className="documents-row">
									<td>
										{/* A button rather than a whole clickable row: the row has
										    other controls in it, and a nested interactive element
										    inside a clickable row is a keyboard trap. */}
										<button type="button" className="documents-title-button" onClick={() => open(doc.id)}>
											{doc.title}
										</button>
									</td>
									<td>
										<span className={`documents-status-pill documents-status-${doc.status}`}>{STATUS_LABEL[doc.status]}</span>
									</td>
									<td>{formatMoney(doc.computedTotal, doc.currency)}</td>
									<td>{new Date(doc.createdAt).toLocaleDateString()}</td>
									<td>
										<button type="button" onClick={() => open(doc.id)}>
											Open
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</AppShell>
	);
}

export default Documents;

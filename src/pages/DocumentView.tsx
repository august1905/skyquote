import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getPublicDocument, type PublicDocumentView } from '../api/documents';
import { DocumentBlockView } from '../documents/DocumentBlockView';
import './DocumentView.css';

/**
 * A recipient's own web-link view (§11) — deliberately outside `AppShell`
 * and every `RequireAuth`/`RequireAdmin` guard in App.tsx: a recipient never
 * logs in, they open a per-recipient secret link (`routes/publicDocumentView.js`
 * verifies the token, not a session). This is the primary way a document is
 * ever seen — per product direction, PDF export is secondary, most people
 * only ever open this page.
 *
 * Scope, stated plainly rather than left implicit: this renders the frozen
 * document read-only, with the viewer's OWN fields live/fillable (§6.1 rule
 * 3's exception). There's no "submit"/"complete" flow yet — nothing typed
 * into a field here is sent anywhere or persisted; that's the next slice on
 * top of this one (see BUILD_STATUS.md). Recipient-side pricing interactivity
 * (picking/unpicking optional items, choosing a quote-builder option) is the
 * same story — not built yet.
 */
function DocumentView() {
	const { documentId, token } = useParams<{ documentId: string; token: string }>();
	const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
	const [data, setData] = useState<PublicDocumentView | null>(null);

	useEffect(() => {
		if (!documentId || !token) {
			setStatus('not-found');
			return;
		}
		let cancelled = false;
		setStatus('loading');
		getPublicDocument(documentId, token)
			.then((result) => {
				if (cancelled) return;
				setData(result);
				setStatus('ready');
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setStatus(err instanceof ApiError && err.status === 404 ? 'not-found' : 'error');
			});
		return () => {
			cancelled = true;
		};
	}, [documentId, token]);

	if (status === 'loading') {
		return (
			<div className="doc-view-shell">
				<p className="doc-view-status">Loading…</p>
			</div>
		);
	}

	if (status === 'not-found') {
		return (
			<div className="doc-view-shell">
				<p className="doc-view-status" role="alert">
					This link is invalid or has expired.
				</p>
			</div>
		);
	}

	if (status === 'error' || !data || !documentId || !token) {
		return (
			<div className="doc-view-shell">
				<p className="doc-view-status" role="alert">
					Something went wrong loading this document. Try reloading the page.
				</p>
			</div>
		);
	}

	return (
		<div className="doc-view-shell">
			<header className="doc-view-header">
				<h1>{data.document.title}</h1>
				<span className="doc-view-recipient-badge">Viewing as {data.recipient.name} ({data.recipient.roleName})</span>
			</header>
			<div className="doc-view-pages">
				{data.body.pages.map((page) => (
					<div key={page.id} className="doc-view-page">
						{page.blocks.map((block) => (
							<DocumentBlockView key={block.id} block={block} documentId={documentId} token={token} viewerRoleId={data.recipient.roleId} />
						))}
					</div>
				))}
			</div>
		</div>
	);
}

export default DocumentView;

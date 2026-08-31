import type { CreateDocumentResult } from '../../api/documents';
import { RecipientLinkRow } from '../RecipientLinkRow';

interface SuccessScreenProps {
	result: CreateDocumentResult;
	onClose: () => void;
}

/**
 * Email delivery isn't wired up (Catalyst Email is blocked — see
 * BUILD_STATUS.md's "Blocked/parked" section), so copying and sending each
 * recipient's link manually is the real workflow for now, not a placeholder
 * for one. A link lost after closing this screen is recoverable from the
 * Documents list's detail view (regenerate — see `RecipientLinkRow`'s own
 * doc comment for why it's shown only once).
 */
export function SuccessScreen({ result, onClose }: SuccessScreenProps) {
	return (
		<div className="wizard-step">
			<p className="wizard-success-heading">&ldquo;{result.document.title}&rdquo; was created.</p>
			<p className="wizard-hint">Copy each recipient&apos;s link below and send it yourself.</p>
			{result.recipients.map((recipient) => (
				<RecipientLinkRow key={recipient.id} documentId={result.document.id} name={recipient.name} roleName={recipient.roleName} token={recipient.token} />
			))}
			<div className="wizard-nav-buttons">
				<button type="button" onClick={onClose}>
					Done
				</button>
			</div>
		</div>
	);
}

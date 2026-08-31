import type { CreateDocumentResult } from '../../api/documents';
import { RecipientLinkRow } from '../RecipientLinkRow';
import type { SigningSetupState } from './types';

interface SuccessScreenProps {
	result: CreateDocumentResult;
	/** How the automatic hand-off to Zoho Sign went. The document is already created either way — see `CreateDocumentWizard`'s `finishSigningSetup`. */
	signing: SigningSetupState;
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
export function SuccessScreen({ result, signing, onClose }: SuccessScreenProps) {
	return (
		<div className="wizard-step">
			<p className="wizard-success-heading">&ldquo;{result.document.title}&rdquo; was created.</p>
			<p className="wizard-hint">Copy each recipient&apos;s link below and send it yourself.</p>
			{result.recipients.map((recipient) => (
				<RecipientLinkRow key={recipient.id} documentId={result.document.id} name={recipient.name} roleName={recipient.roleName} token={recipient.token} />
			))}
			<SigningStatus signing={signing} />
			{/* Always "Done", never a different word while the send is in flight.
			    Closing early does abort the hand-off — the render and measurement live
			    in this component's tree — but the status line above says so, and the
			    document is created, honest about being unsent, and retryable from its
			    own page either way. Renaming this button instead would move a control
			    every other create-document spec clicks by name. */}
			<div className="wizard-nav-buttons">
				<button type="button" onClick={onClose}>
					Done
				</button>
			</div>
		</div>
	);
}

/**
 * Says out loud what happened to signing, including nothing at all.
 *
 * A document with no signature field renders none of this — silence is correct
 * there, and a reassuring "signing not needed" line on every quote would be
 * noise. Every other outcome is stated, because the one thing this whole change
 * exists to prevent is a document that looks finished and can't be signed.
 */
function SigningStatus({ signing }: { signing: SigningSetupState }) {
	if (signing.phase === 'idle' || signing.phase === 'skipped') return null;

	if (signing.phase === 'sending') {
		return (
			<p className="wizard-signing-status wizard-signing-sending" role="status">
				Setting up signing with Zoho Sign… this takes a few seconds. Keep this open until it finishes.
			</p>
		);
	}

	if (signing.phase === 'failed') {
		return (
			<div className="wizard-signing-status wizard-signing-failed" role="alert">
				<p>
					The document is saved, but signing isn&apos;t set up: {signing.error}
				</p>
				{/* Named rather than left as a dead end — the retry is a real button on a
				    page they can reach, and without this nobody would know to look. */}
				<p className="wizard-hint">
					Open the document and use <strong>Send for signature</strong> to try again. Until then its signature fields aren&apos;t signable.
				</p>
			</div>
		);
	}

	const skipped = signing.result.skipped;
	return (
		<div className="wizard-signing-status wizard-signing-sent" role="status">
			<p>✓ Ready to sign — recipients sign inside their own link, and Zoho Sign never emails them separately.</p>
			{skipped.length > 0 && (
				// A role with nothing to sign is almost always a template that forgot a
				// field, and the author is the only person who can still fix it.
				<p className="wizard-hint">No field to sign for: {skipped.map((s) => s.roleName).join(', ')}. They can still read the document.</p>
			)}
		</div>
	);
}

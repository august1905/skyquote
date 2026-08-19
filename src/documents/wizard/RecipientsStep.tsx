import type { RecipientDraft } from './types';

interface RecipientsStepProps {
	recipients: RecipientDraft[];
	onChange: (recipients: RecipientDraft[]) => void;
}

/**
 * §11 step 2: "Bind roles to people". Every role gets a name + email here,
 * not just roles with fields — the spec's own narrower "email required for
 * any role with fields" is widened deliberately: per Grayson's direction,
 * the document's own web link (not a PDF, not an account) is the primary
 * way *anyone* views it, so every role needs a working link regardless of
 * whether it owns any fillable fields.
 */
export function RecipientsStep({ recipients, onChange }: RecipientsStepProps) {
	function update(index: number, patch: Partial<RecipientDraft>) {
		onChange(recipients.map((r, i) => (i === index ? { ...r, ...patch } : r)));
	}

	if (recipients.length === 0) {
		return <p className="wizard-hint">This template has no roles yet — add one from the Recipients / Roles panel before creating a document.</p>;
	}

	return (
		<div className="wizard-step">
			{recipients.map((recipient, index) => (
				<div key={recipient.roleId} className="wizard-recipient-row">
					<span className="wizard-recipient-role">{recipient.roleName}</span>
					<input
						type="text"
						aria-label={`${recipient.roleName} name`}
						placeholder="Name"
						value={recipient.name}
						onChange={(e) => update(index, { name: e.target.value })}
					/>
					<input
						type="email"
						aria-label={`${recipient.roleName} email`}
						placeholder="Email"
						value={recipient.email}
						onChange={(e) => update(index, { email: e.target.value })}
					/>
					<input
						type="number"
						aria-label={`${recipient.roleName} signing order`}
						placeholder="Signing order"
						value={recipient.signingOrder}
						onChange={(e) => update(index, { signingOrder: e.target.value })}
					/>
				</div>
			))}
			<p className="wizard-hint">Signing order is optional — leave it blank unless sequential signing matters here.</p>
		</div>
	);
}

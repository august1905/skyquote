import type { DocumentTotals } from '../../pricing/computeTotals';
import { formatMoney } from '../../pricing/formatMoney';
import type { RecipientDraft } from './types';

interface ReviewStepProps {
	title: string;
	recipients: RecipientDraft[];
	totals: DocumentTotals;
	/** The Zoho CRM deal the merge fields came from, if one was chosen. */
	dealName?: string | null;
	error: string | null;
}

export function ReviewStep({ title, recipients, totals, dealName, error }: ReviewStepProps) {
	return (
		<div className="wizard-step">
			<p>
				<strong>Title:</strong> {title || 'Untitled document'}
			</p>
			{dealName && (
				<p>
					<strong>Deal:</strong> {dealName}
				</p>
			)}
			<p>
				<strong>Recipients</strong>
			</p>
			<ul className="wizard-review-recipients">
				{recipients.map((recipient) => (
					<li key={recipient.roleId}>
						{recipient.roleName}: {recipient.name} ({recipient.email})
					</li>
				))}
			</ul>
			<p>
				<strong>Total:</strong> {formatMoney(totals.total, totals.currency)}
			</p>
			<p className="wizard-hint">
				Creating freezes this template into an independent document — editing the template afterward never changes it (§11.1).
				Each recipient gets their own link on the next screen; there&apos;s no automatic email yet, so plan to send them
				yourself.
			</p>
			{error && (
				<p className="wizard-error" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}

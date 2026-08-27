import { useState } from 'react';
import { ApiError } from '../../api/client';
import { createDocument, type CreateDocumentResult } from '../../api/documents';
import { getTemplate, type TemplateEnvelope } from '../../api/templates';
import { getCrmDeal, type CrmDeal, type CrmDealSummary } from '../../api/zohoCrm';
import { collectVariableKeys } from '../../editor/variables/collectVariableKeys';
import { allVariables } from '../../editor/variables/systemVariables';
import { computeTotals } from '../../pricing/computeTotals';
import type { TemplateBody, TemplateMeta } from '../../editor/types';
import { computeResolvedVariableValues, resolveTitle, resolveVariablesInBody } from '../resolveVariables';
import { dealVariableValues } from './dealVariableValues';
import { TemplateStep } from './TemplateStep';
import { DealStep } from './DealStep';
import { NameStep } from './NameStep';
import { RecipientsStep } from './RecipientsStep';
import { VariablesStep } from './VariablesStep';
import { PricingStep } from './PricingStep';
import { ReviewStep } from './ReviewStep';
import { SuccessScreen } from './SuccessScreen';
import { wizardStepsFor, type RecipientDraft, type WizardStep } from './types';
import './wizard.css';

interface CreateDocumentWizardProps {
	/**
	 * The template to start from, when it's already known. The editor passes the
	 * template it has open, so nothing is re-fetched and nothing is asked twice.
	 * Omitted from the Documents screen, where choosing one is the first step.
	 *
	 * Read once, at open: later edits in the editor don't leak into a wizard
	 * that's already running, which matches what creating a document does anyway
	 * (§11.1 — a document is a snapshot).
	 */
	template?: TemplateEnvelope;
	onClose: () => void;
	/** Fired only when a document was actually created, so a list behind the wizard can refresh without paying for a fetch every time the wizard is dismissed. */
	onCreated?: () => void;
}

function canProceedFrom(step: WizardStep, template: TemplateEnvelope | null, title: string, recipients: RecipientDraft[]): boolean {
	if (step === 'template') return template !== null;
	if (step === 'name') return title.trim().length > 0;
	if (step === 'recipients') {
		return recipients.length > 0 && recipients.every((r) => r.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
	}
	// The deal step is always passable — see DealStep for why a CRM that's down
	// must never be able to stop a quote being written.
	return true;
}

function recipientDraftsFor(body: TemplateBody | undefined): RecipientDraft[] {
	return (body?.roles ?? []).map((role) => ({
		roleId: role.id,
		roleName: role.name,
		name: '',
		email: '',
		signingOrder: role.signingOrder != null ? String(role.signingOrder) : '',
	}));
}

/**
 * A deal names exactly one primary contact, so it can only speak for **one**
 * role — the first. Spreading that same person across every role of a
 * two-signer template would be a guess dressed up as data, and a wrong email is
 * worse than an empty one: the empty box is visibly incomplete, the wrong
 * address quietly sends someone else's quote.
 *
 * Never overwrites something already typed.
 */
function prefillFirstRecipient(drafts: RecipientDraft[], deal: CrmDeal): RecipientDraft[] {
	const name = deal.contact?.name || deal.contactName || '';
	const email = deal.contact?.email || '';
	if (!name && !email) return drafts;
	return drafts.map((draft, index) => (index === 0 ? { ...draft, name: draft.name || name, email: draft.email || email } : draft));
}

/**
 * §11's Create Document wizard: pick a template → pick the CRM deal it's for →
 * name it → bind roles to people → fill variables → configure pricing → create.
 *
 * Opens from two places and behaves the same in both. From the Documents screen
 * it asks all seven questions; from a template's own editor the first is already
 * answered and drops out (`wizardStepsFor`). One component rather than two entry
 * flows, because the only real difference between them is that one step.
 *
 * The deal step is what fills the merge fields: everything it knows lands in the
 * ordinary variable form two steps later, prefilled and editable, rather than in
 * a channel of its own — so the freeze at creation, the title substitution and
 * the smart-content evaluation all keep working untouched. See
 * `dealVariableValues`.
 */
export function CreateDocumentWizard({ template: initialTemplate, onClose, onCreated }: CreateDocumentWizardProps) {
	const steps = wizardStepsFor(Boolean(initialTemplate));

	// Named rather than read off `steps[0]`: which step comes first is exactly the
	// difference between the two entry points, and saying it here beats an index
	// that has to be reasoned about.
	const [step, setStep] = useState<WizardStep>(initialTemplate ? 'deal' : 'template');
	const [template, setTemplate] = useState<TemplateEnvelope | null>(initialTemplate ?? null);
	const [deal, setDeal] = useState<CrmDeal | null>(null);
	const [title, setTitle] = useState(initialTemplate?.meta.name ?? '');
	const [recipients, setRecipients] = useState<RecipientDraft[]>(recipientDraftsFor(initialTemplate?.body));
	const [variableValues, setVariableValues] = useState<Record<string, string>>({});
	const [workingBody, setWorkingBody] = useState<TemplateBody | null>(initialTemplate?.body ?? null);
	// Whichever picker step is currently fetching. Both of them advance the wizard
	// on click, so the row has to be able to say it's working.
	const [stepBusy, setStepBusy] = useState(false);
	const [stepError, setStepError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [result, setResult] = useState<CreateDocumentResult | null>(null);

	const totals = workingBody ? computeTotals(workingBody) : null;
	const currency = totals?.currency ?? template?.meta.currency ?? 'USD';
	const variableKeys = workingBody
		? collectVariableKeys(workingBody, title).filter((key) => {
				const def = allVariables(workingBody.variables).find((v) => v.key === key);
				return def?.source !== 'computed';
			})
		: [];

	const stepIndex = steps.findIndex((s) => s.key === step);
	const canProceed = canProceedFrom(step, template, title, recipients);

	function goNext() {
		const next = steps[stepIndex + 1];
		if (next) setStep(next.key);
	}
	function goBack() {
		const previous = steps[stepIndex - 1];
		if (previous) setStep(previous.key);
	}

	async function chooseTemplate(meta: TemplateMeta) {
		setStepBusy(true);
		setStepError(null);
		try {
			const envelope = await getTemplate(meta.id);
			setTemplate(envelope);
			setTitle(envelope.meta.name);
			setWorkingBody(envelope.body);
			setRecipients(recipientDraftsFor(envelope.body));
			// A different template has different roles and different variables, so a
			// previously chosen deal's values are re-derived against the new one
			// rather than carried across half-applied.
			setVariableValues(deal ? dealVariableValues(deal, envelope.meta.currency) : {});
			goNext();
		} catch {
			setStepError('Could not open that template.');
		} finally {
			setStepBusy(false);
		}
	}

	async function chooseDeal(summary: CrmDealSummary) {
		setStepBusy(true);
		setStepError(null);
		try {
			// The list row is deliberately too thin to build a document from — the
			// contact's email only exists on the deal's *detail*, which is one more
			// CRM call. Paid once, on selection, rather than for every row shown.
			const { deal: full } = await getCrmDeal(summary.id);
			setDeal(full);
			setVariableValues(dealVariableValues(full, currency));
			setRecipients((current) => prefillFirstRecipient(current, full));
			goNext();
		} catch {
			setStepError('Could not read that deal from Zoho CRM.');
		} finally {
			setStepBusy(false);
		}
	}

	/** Drops what the deal contributed and nothing else — a value typed by hand on the Variables step survives changing your mind about the deal. */
	function skipDeal() {
		if (deal) {
			const contributed = new Set(Object.keys(dealVariableValues(deal, currency)));
			setVariableValues((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !contributed.has(key))));
			setDeal(null);
		}
		goNext();
	}

	async function handleCreate() {
		// Re-checked inside the closure rather than relying on a guard above:
		// TypeScript's narrowing doesn't reach in here, and neither does anything
		// else that would keep these in sync.
		if (!template || !workingBody || !totals) return;
		setSubmitting(true);
		setSubmitError(null);
		const now = new Date();
		const resolvedValues = computeResolvedVariableValues({ body: workingBody, templateName: title, wizardValues: variableValues, totals, now });
		try {
			const created = await createDocument({
				title: resolveTitle(title, resolvedValues),
				sourceTemplateId: template.meta.id,
				sourceTemplateVersion: template.meta.version,
				currency: totals.currency,
				computedTotal: totals.total,
				body: { ...resolveVariablesInBody(workingBody, resolvedValues), resolvedVariableValues: resolvedValues },
				recipients: recipients.map((r) => ({
					roleId: r.roleId,
					roleName: r.roleName,
					name: r.name.trim(),
					email: r.email.trim(),
					signingOrder: r.signingOrder.trim() ? Number(r.signingOrder) : null,
				})),
			});
			setResult(created);
			onCreated?.();
		} catch (err) {
			setSubmitError(err instanceof ApiError ? err.message : 'Could not create the document.');
		} finally {
			setSubmitting(false);
		}
	}

	if (result) {
		return (
			<div className="wizard-overlay">
				<div className="wizard-card">
					<SuccessScreen result={result} onClose={onClose} />
				</div>
			</div>
		);
	}

	return (
		<div className="wizard-overlay" onClick={onClose}>
			<div className="wizard-card" onClick={(e) => e.stopPropagation()}>
				<div className="wizard-header">
					<h2>Create document</h2>
					<button type="button" aria-label="Close create-document wizard" onClick={onClose}>
						×
					</button>
				</div>
				<ol className="wizard-steps-nav">
					{steps.map((s, index) => (
						<li key={s.key} className={index === stepIndex ? 'wizard-step-nav-current' : index < stepIndex ? 'wizard-step-nav-done' : undefined}>
							{s.label}
						</li>
					))}
				</ol>
				<div className="wizard-step-body">
					{step === 'template' && <TemplateStep selectedId={template?.meta.id ?? null} onChoose={(meta) => void chooseTemplate(meta)} loading={stepBusy} error={stepError} />}
					{step === 'deal' && (
						<DealStep selectedId={deal?.id ?? null} onChoose={(summary) => void chooseDeal(summary)} onSkip={skipDeal} currency={currency} loading={stepBusy} error={stepError} />
					)}
					{step === 'name' && <NameStep title={title} onChange={setTitle} />}
					{step === 'recipients' && <RecipientsStep recipients={recipients} onChange={setRecipients} />}
					{step === 'variables' && workingBody && <VariablesStep keys={variableKeys} body={workingBody} values={variableValues} onChange={setVariableValues} dealName={deal?.name ?? null} />}
					{step === 'pricing' && workingBody && <PricingStep body={workingBody} onChange={setWorkingBody} />}
					{step === 'review' && totals && <ReviewStep title={title} recipients={recipients} totals={totals} dealName={deal?.name ?? null} error={submitError} />}
				</div>
				<div className="wizard-nav-buttons">
					{stepIndex > 0 && (
						<button type="button" onClick={goBack} disabled={submitting || stepBusy}>
							Back
						</button>
					)}
					{step !== 'review' && (
						<button type="button" onClick={goNext} disabled={!canProceed || stepBusy}>
							Next
						</button>
					)}
					{step === 'review' && (
						<button type="button" onClick={() => void handleCreate()} disabled={submitting || !canProceed}>
							{submitting ? 'Creating…' : 'Create document'}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

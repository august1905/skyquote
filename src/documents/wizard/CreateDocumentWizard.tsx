import { useState } from 'react';
import { ApiError } from '../../api/client';
import { createDocument, type CreateDocumentResult } from '../../api/documents';
import { useEditorStore } from '../../editor/store/editorStore';
import { collectVariableKeys } from '../../editor/variables/collectVariableKeys';
import { allVariables } from '../../editor/variables/systemVariables';
import { computeTotals } from '../../pricing/computeTotals';
import { computeResolvedVariableValues, resolveTitle, resolveVariablesInBody } from '../resolveVariables';
import { NameStep } from './NameStep';
import { RecipientsStep } from './RecipientsStep';
import { VariablesStep } from './VariablesStep';
import { PricingStep } from './PricingStep';
import { ReviewStep } from './ReviewStep';
import { SuccessScreen } from './SuccessScreen';
import { WIZARD_STEPS, type RecipientDraft, type WizardStep } from './types';
import './wizard.css';

interface CreateDocumentWizardProps {
	onClose: () => void;
}

function canProceedFrom(step: WizardStep, title: string, recipients: RecipientDraft[]): boolean {
	if (step === 'name') return title.trim().length > 0;
	if (step === 'recipients') {
		return recipients.length > 0 && recipients.every((r) => r.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
	}
	return true;
}

/**
 * §11's Create Document wizard: name → bind roles to people → fill
 * variables → configure pricing → create. Reads the *currently open*
 * template straight from `editorStore` rather than taking it as a prop —
 * same "read what's already loaded" convention `ValidationIndicator`/
 * `HeaderTotal` follow, and this only ever opens from within
 * `TemplateEditor`.
 */
export function CreateDocumentWizard({ onClose }: CreateDocumentWizardProps) {
	const meta = useEditorStore((s) => s.meta);
	const body = useEditorStore((s) => s.body);

	const [step, setStep] = useState<WizardStep>('name');
	const [title, setTitle] = useState(meta?.name ?? '');
	const [recipients, setRecipients] = useState<RecipientDraft[]>(
		(body?.roles ?? []).map((role) => ({
			roleId: role.id,
			roleName: role.name,
			name: '',
			email: '',
			signingOrder: role.signingOrder != null ? String(role.signingOrder) : '',
		}))
	);
	const [variableValues, setVariableValues] = useState<Record<string, string>>({});
	const [workingBody, setWorkingBody] = useState(body);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [result, setResult] = useState<CreateDocumentResult | null>(null);

	// The wizard only ever opens from a button that's itself only rendered
	// once a template is loaded (see the header button in TemplateEditor.tsx)
	// — these are always non-null in practice; typed as possibly-null because
	// editorStore's own state is, not because there's a real empty case here.
	// Rebound to their own consts (rather than just narrowing `meta`/`body`/
	// `workingBody` in place) because TypeScript's control-flow narrowing from
	// this guard doesn't extend into `handleCreate`'s nested closure below.
	if (!meta || !body || !workingBody) return null;
	const templateMeta = meta;
	const currentWorkingBody = workingBody;

	const totals = computeTotals(currentWorkingBody);
	const variableKeys = collectVariableKeys(currentWorkingBody, title).filter((key) => {
		const def = allVariables(currentWorkingBody.variables).find((v) => v.key === key);
		return def?.source !== 'computed';
	});

	const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === step);
	const canProceed = canProceedFrom(step, title, recipients);

	function goNext() {
		const next = WIZARD_STEPS[stepIndex + 1];
		if (next) setStep(next.key);
	}
	function goBack() {
		const previous = WIZARD_STEPS[stepIndex - 1];
		if (previous) setStep(previous.key);
	}

	async function handleCreate() {
		setSubmitting(true);
		setSubmitError(null);
		const now = new Date();
		const resolvedValues = computeResolvedVariableValues({ body: currentWorkingBody, templateName: title, wizardValues: variableValues, totals, now });
		try {
			const created = await createDocument({
				title: resolveTitle(title, resolvedValues),
				sourceTemplateId: templateMeta.id,
				sourceTemplateVersion: templateMeta.version,
				currency: totals.currency,
				computedTotal: totals.total,
				body: resolveVariablesInBody(currentWorkingBody, resolvedValues),
				recipients: recipients.map((r) => ({
					roleId: r.roleId,
					roleName: r.roleName,
					name: r.name.trim(),
					email: r.email.trim(),
					signingOrder: r.signingOrder.trim() ? Number(r.signingOrder) : null,
				})),
			});
			setResult(created);
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
					{WIZARD_STEPS.map((s, index) => (
						<li key={s.key} className={index === stepIndex ? 'wizard-step-nav-current' : index < stepIndex ? 'wizard-step-nav-done' : undefined}>
							{s.label}
						</li>
					))}
				</ol>
				<div className="wizard-step-body">
					{step === 'name' && <NameStep title={title} onChange={setTitle} />}
					{step === 'recipients' && <RecipientsStep recipients={recipients} onChange={setRecipients} />}
					{step === 'variables' && <VariablesStep keys={variableKeys} body={currentWorkingBody} values={variableValues} onChange={setVariableValues} />}
					{step === 'pricing' && <PricingStep body={currentWorkingBody} onChange={setWorkingBody} />}
					{step === 'review' && <ReviewStep title={title} recipients={recipients} totals={totals} error={submitError} />}
				</div>
				<div className="wizard-nav-buttons">
					{stepIndex > 0 && (
						<button type="button" onClick={goBack} disabled={submitting}>
							Back
						</button>
					)}
					{step !== 'review' && (
						<button type="button" onClick={goNext} disabled={!canProceed}>
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

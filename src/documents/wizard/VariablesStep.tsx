import type { TemplateBody } from '../../editor/types';
import { allVariables } from '../../editor/variables/systemVariables';

interface VariablesStepProps {
	/** Already excludes `source: 'computed'` keys (Document.Total/Document.Date) — those are resolved programmatically, never asked here. See CreateDocumentWizard.tsx. */
	keys: string[];
	body: TemplateBody;
	values: Record<string, string>;
	onChange: (values: Record<string, string>) => void;
	/** The Zoho CRM deal these values were prefilled from, if one was chosen. Named rather than just flagged, so it's obvious *which* record the numbers on screen came from. */
	dealName?: string | null;
}

/** §11 step 3: "form of every variable used in the template... prefilled from the selected contact/CRM record" — which the deal step now does. Anything the deal didn't supply falls back to the variable's own `defaultValue`, and every box here is freely typed over. */
export function VariablesStep({ keys, body, values, onChange, dealName }: VariablesStepProps) {
	const known = new Map(allVariables(body.variables).map((v) => [v.key, v] as const));

	if (keys.length === 0) {
		return <p className="wizard-hint">This template doesn&apos;t use any variables.</p>;
	}

	return (
		<div className="wizard-step">
			{dealName && <p className="wizard-hint">Prefilled from the Zoho CRM deal &ldquo;{dealName}&rdquo;. Change anything that&apos;s out of date here — the document freezes these values, not the CRM&apos;s.</p>}
			{keys.map((key) => {
				const def = known.get(key);
				const placeholder = def?.defaultValue || `[${def?.label ?? key} not provided]`;
				return (
					<label key={key} className="wizard-field">
						{def?.label ?? key}
						<input type="text" placeholder={placeholder} value={values[key] ?? ''} onChange={(e) => onChange({ ...values, [key]: e.target.value })} />
					</label>
				);
			})}
			<p className="wizard-hint">Left blank, a variable renders as its default value, or a visible placeholder if it has none — never silently blank.</p>
		</div>
	);
}

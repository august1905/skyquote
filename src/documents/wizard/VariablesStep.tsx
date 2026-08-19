import type { TemplateBody } from '../../editor/types';
import { allVariables } from '../../editor/variables/systemVariables';

interface VariablesStepProps {
	/** Already excludes `source: 'computed'` keys (Document.Total/Document.Date) — those are resolved programmatically, never asked here. See CreateDocumentWizard.tsx. */
	keys: string[];
	body: TemplateBody;
	values: Record<string, string>;
	onChange: (values: Record<string, string>) => void;
}

/** §11 step 3: "form of every variable used in the template... prefilled from the selected contact/CRM record". There's no Contacts/CRM binding yet (see BUILD_STATUS.md) — prefilled from each variable's own `defaultValue` instead, typed over freely. */
export function VariablesStep({ keys, body, values, onChange }: VariablesStepProps) {
	const known = new Map(allVariables(body.variables).map((v) => [v.key, v] as const));

	if (keys.length === 0) {
		return <p className="wizard-hint">This template doesn&apos;t use any variables.</p>;
	}

	return (
		<div className="wizard-step">
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

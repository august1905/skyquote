import type { VariableDef } from '../types';

/**
 * §2.2's `OPEN` question resolved per its own "default assumption": system
 * variables (`Client.*`, `Sender.*`, `Document.*`) are global — the same set
 * for every template, never stored in `TemplateBody.variables` (that array
 * is for *custom*, template-scoped variables only, per its own doc comment
 * in types.ts). Hardcoded here rather than a Catalyst resource: there's
 * nothing per-workspace about them yet (no contact/company binding exists —
 * that's a document-generation concern, phase 4), and adding a table for a
 * fixed, code-level list would be exactly the kind of new account resource
 * that needs asking about first.
 */
export const SYSTEM_VARIABLES: VariableDef[] = [
	{ key: 'Client.Name', label: 'Client name', source: 'contact', format: 'text' },
	{ key: 'Client.Company', label: 'Client company', source: 'company', format: 'text' },
	{ key: 'Client.Email', label: 'Client email', source: 'contact', format: 'text' },
	// The `deal` source §2.2 always listed, now that there is something behind it:
	// the Create Document wizard's deal step fills every one of these from the
	// chosen Zoho CRM deal (see `documents/wizard/dealVariableValues.ts`). Filled
	// exactly like the `contact`/`company` ones — prefilled into the wizard's own
	// variable form, editable there, frozen into the document at creation — so a
	// template that uses them still works when no deal is chosen.
	{ key: 'Deal.Name', label: 'Deal name', source: 'deal', format: 'text' },
	{ key: 'Deal.Amount', label: 'Deal amount', source: 'deal', format: 'currency' },
	{ key: 'Deal.Stage', label: 'Deal stage', source: 'deal', format: 'text' },
	{ key: 'Deal.CloseDate', label: 'Deal close date', source: 'deal', format: 'date' },
	{ key: 'Deal.Owner', label: 'Deal owner', source: 'deal', format: 'text' },
	{ key: 'Sender.Name', label: 'Sender name', source: 'sender', format: 'text' },
	{ key: 'Sender.Company', label: 'Sender company', source: 'sender', format: 'text' },
	{ key: 'Sender.Email', label: 'Sender email', source: 'sender', format: 'text' },
	{ key: 'Document.Date', label: 'Document date', source: 'computed', format: 'date' },
	{ key: 'Document.Total', label: 'Document total', source: 'computed', format: 'currency' },
];

/** All variables available to a template: the fixed system list plus its own custom ones. */
export function allVariables(customVariables: VariableDef[]): VariableDef[] {
	return [...SYSTEM_VARIABLES, ...customVariables];
}

export function findVariable(key: string, customVariables: VariableDef[]): VariableDef | undefined {
	return allVariables(customVariables).find((v) => v.key === key);
}

import type { RoleId } from '../../editor/types';

/** One role's recipient info as the wizard collects it — `signingOrder` stays a raw string while editing (so a mid-typing "-" or empty box doesn't need to be a valid number yet); parsed to `number | null` only at submit time. */
export interface RecipientDraft {
	roleId: RoleId;
	roleName: string;
	name: string;
	email: string;
	signingOrder: string;
}

export type WizardStep = 'template' | 'deal' | 'name' | 'recipients' | 'variables' | 'pricing' | 'review';

export const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
	{ key: 'template', label: 'Template' },
	{ key: 'deal', label: 'Deal' },
	{ key: 'name', label: 'Name' },
	{ key: 'recipients', label: 'Recipients' },
	{ key: 'variables', label: 'Variables' },
	{ key: 'pricing', label: 'Pricing' },
	{ key: 'review', label: 'Review' },
];

/**
 * The steps this run of the wizard actually shows.
 *
 * Opened from a template's own editor, the template is already chosen and asking
 * again would be nonsense — so that one step drops out and the rest are
 * identical. One step list with a hole in it rather than two wizards: the
 * difference between the two entry points is genuinely just this.
 */
export function wizardStepsFor(templateAlreadyChosen: boolean): { key: WizardStep; label: string }[] {
	return templateAlreadyChosen ? WIZARD_STEPS.filter((step) => step.key !== 'template') : WIZARD_STEPS;
}

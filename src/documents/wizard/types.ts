import type { RoleId } from '../../editor/types';

/** One role's recipient info as the wizard collects it — `signingOrder` stays a raw string while editing (so a mid-typing "-" or empty box doesn't need to be a valid number yet); parsed to `number | null` only at submit time. */
export interface RecipientDraft {
	roleId: RoleId;
	roleName: string;
	name: string;
	email: string;
	signingOrder: string;
}

export type WizardStep = 'name' | 'recipients' | 'variables' | 'pricing' | 'review';

export const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
	{ key: 'name', label: 'Name' },
	{ key: 'recipients', label: 'Recipients' },
	{ key: 'variables', label: 'Variables' },
	{ key: 'pricing', label: 'Pricing' },
	{ key: 'review', label: 'Review' },
];

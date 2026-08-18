import type { Draft } from 'immer';
import type { TemplateBody, VariableDef } from '../types';
import type { Command } from './types';
import { snapshot } from './blockTree';

/**
 * `TemplateBody.variables` holds only *custom*, template-scoped variables
 * (§2.2) — system variables (`Client.*`/`Sender.*`/`Document.*`) are a fixed,
 * hardcoded list (`systemVariables.ts`), never stored here. Keyed by `key`
 * (unique per template, enforced at the call site the same way field `name`
 * uniqueness is — see BUILD_STATUS.md), not by an id, since `VariableDef` has
 * no id field of its own.
 */

/**
 * "Custom.<Label>" — collision-checked against existing custom variables
 * only. Custom keys are always `Custom.`-prefixed, so they can never collide
 * with a system variable's key (`Client.*`/`Sender.*`/`Document.*`) by
 * construction, the same way `nextRoleName` only needs to check other roles.
 */
export function customVariableKey(label: string, existingCustomVariables: VariableDef[]): string {
	const slug = label.trim().replace(/[^a-zA-Z0-9]+/g, '') || 'Field';
	const base = `Custom.${slug}`;
	const used = new Set(existingCustomVariables.map((v) => v.key));
	if (!used.has(base)) return base;
	let n = 2;
	while (used.has(`${base}${n}`)) n++;
	return `${base}${n}`;
}

function findVariableIndex(body: Draft<TemplateBody>, key: string): number {
	const index = body.variables.findIndex((v) => v.key === key);
	if (index === -1) throw new Error(`findVariableIndex: no custom variable with key ${key}`);
	return index;
}

export function addVariable(variable: VariableDef, index?: number): Command {
	return {
		name: 'addVariable',
		apply(draft: Draft<TemplateBody>) {
			const insertAt = index ?? draft.variables.length;
			draft.variables.splice(insertAt, 0, variable as Draft<VariableDef>);
			return removeVariable(variable.key);
		},
	};
}

export function removeVariable(key: string): Command {
	return {
		name: 'removeVariable',
		apply(draft: Draft<TemplateBody>) {
			const index = findVariableIndex(draft, key);
			const removed = snapshot<VariableDef>(draft.variables[index]!);
			draft.variables.splice(index, 1);
			return addVariable(removed, index);
		},
	};
}

/**
 * A plain `Partial<Omit<VariableDef, 'key'>>` only allows *omitting* a field,
 * not explicitly setting it to `undefined` — `exactOptionalPropertyTypes`
 * (see PROJECT_CONTEXT.md) treats those as different. Clearing
 * `defaultValue`/`format` needs the explicit-`undefined` case, so every
 * optional field here is widened to allow it — same pattern
 * `BlockSettingsPopover.tsx`'s `StylePatch` already established.
 */
export type VariableDefPatch = { [K in keyof Omit<VariableDef, 'key'>]?: Omit<VariableDef, 'key'>[K] | undefined };

export function updateVariable(key: string, patch: VariableDefPatch): Command {
	return {
		name: 'updateVariable',
		apply(draft: Draft<TemplateBody>) {
			const variable = draft.variables[findVariableIndex(draft, key)]!;
			const previous: VariableDefPatch = {
				label: variable.label,
				source: variable.source,
				defaultValue: variable.defaultValue,
				format: variable.format,
			};
			Object.assign(variable, patch);
			return updateVariable(key, previous);
		},
	};
}

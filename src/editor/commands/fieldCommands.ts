import type { Draft } from 'immer';
import type { Block, BlockId, FieldType, FillableField, Page, PageId, RichTextDoc, RichTextNode, RoleId, TemplateBody } from '../types';
import type { Command } from './types';
import { blockAt, findPage, locateBlock, snapshot } from './blockTree';
import { FIELD_TYPE_LABELS } from '../fields/fieldTypes';

/** "Signature 1", "Text field 1", ... — first name of this field type not already in use, per §6.1 rule 2. */
export function nextFieldName(type: FieldType, existingFields: FillableField[]): string {
	const used = new Set(existingFields.map((f) => f.name));
	const base = FIELD_TYPE_LABELS[type];
	let n = 1;
	while (used.has(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}

export function createField(type: FieldType, roleId: RoleId, existingFields: FillableField[]): FillableField {
	return {
		id: crypto.randomUUID(),
		type,
		roleId,
		name: nextFieldName(type, existingFields),
		required: false,
	};
}

/**
 * `Partial<Omit<FillableField, 'id' | 'type'>>` only allows *omitting* a
 * field, not explicitly clearing one to `undefined` —
 * `exactOptionalPropertyTypes` (see PROJECT_CONTEXT.md) treats those as
 * different. Same widened-patch pattern as `BlockSettingsPopover.tsx`'s
 * `StylePatch`/`variableCommands.ts`'s `VariableDefPatch`.
 */
export type FieldConfigPatch = { [K in keyof Omit<FillableField, 'id' | 'type'>]?: Omit<FillableField, 'id' | 'type'>[K] | undefined };

function findFieldBlock(draft: Draft<TemplateBody>, pageId: PageId, blockId: BlockId): Draft<Block> & { type: 'field' } {
	const page = findPage(draft, pageId);
	const { blocks, index } = locateBlock(page, blockId);
	const block = blockAt(blocks, index);
	if (block.type !== 'field') throw new Error(`findFieldBlock: block ${blockId} is a ${block.type} block, not field`);
	return block;
}

/** Only for a standalone `FieldBlock` — an inline `fillableField` node's config changes via its own Tiptap `updateAttributes`, which already flows through `setBlockDoc`/`setCellDoc`. */
export function setFieldConfig(pageId: PageId, blockId: BlockId, patch: FieldConfigPatch): Command {
	return {
		name: 'setFieldConfig',
		apply(draft: Draft<TemplateBody>) {
			const block = findFieldBlock(draft, pageId, blockId);
			const previous: FieldConfigPatch = {
				roleId: block.field.roleId,
				name: block.field.name,
				required: block.field.required,
				placeholder: block.field.placeholder,
				defaultValue: block.field.defaultValue,
				options: block.field.options,
				validation: block.field.validation,
			};
			Object.assign(block.field, patch);
			return setFieldConfig(pageId, blockId, previous);
		},
	};
}

// ─── Whole-template field walking — role deletion's reassign-or-delete (§6.1 rule 4) ──

function eachFieldRefInDoc(doc: Draft<RichTextDoc>, visit: (field: Draft<FillableField>) => void): void {
	for (const node of doc.content) eachFieldRefInNode(node, visit);
}

function eachFieldRefInNode(node: Draft<RichTextNode>, visit: (field: Draft<FillableField>) => void): void {
	if (node.type === 'fillableField' && node.attrs?.field) {
		visit(node.attrs.field as Draft<FillableField>);
	}
	if (node.content) {
		for (const child of node.content) eachFieldRefInNode(child, visit);
	}
}

function eachFieldRefInBlock(block: Draft<Block>, visit: (field: Draft<FillableField>) => void): void {
	if (block.type === 'field') {
		visit(block.field);
	} else if (block.type === 'text') {
		eachFieldRefInDoc(block.doc, visit);
	} else if (block.type === 'table') {
		for (const row of block.rows) {
			for (const cell of row.cells) eachFieldRefInDoc(cell.doc, visit);
		}
	} else if (block.type === 'columns') {
		for (const column of block.columns) {
			for (const child of column) eachFieldRefInBlock(child, visit);
		}
	}
}

function eachFieldRef(body: Draft<TemplateBody>, visit: (field: Draft<FillableField>) => void): void {
	for (const page of body.pages) {
		for (const block of page.blocks) eachFieldRefInBlock(block, visit);
	}
}

/** Sets `roleId` on exactly the given field ids (used by both directions of `reassignFieldsRole`'s undo, since the operation is its own mirror image). */
function setRoleIdForFields(fieldIds: Set<string>, roleId: RoleId, previousRoleId: RoleId): Command {
	return {
		name: 'setRoleIdForFields',
		apply(draft: Draft<TemplateBody>) {
			eachFieldRef(draft, (field) => {
				if (fieldIds.has(field.id)) field.roleId = roleId;
			});
			return setRoleIdForFields(fieldIds, previousRoleId, roleId);
		},
	};
}

/** Every field currently on `fromRoleId` (inline or standalone, anywhere in the template) moves to `toRoleId`. */
export function reassignFieldsRole(fromRoleId: RoleId, toRoleId: RoleId): Command {
	return {
		name: 'reassignFieldsRole',
		apply(draft: Draft<TemplateBody>) {
			const touchedIds = new Set<string>();
			eachFieldRef(draft, (field) => {
				if (field.roleId === fromRoleId) touchedIds.add(field.id);
			});
			eachFieldRef(draft, (field) => {
				if (touchedIds.has(field.id)) field.roleId = toRoleId;
			});
			return setRoleIdForFields(touchedIds, fromRoleId, toRoleId);
		},
	};
}

function restorePages(pages: Page[]): Command {
	return {
		name: 'restorePages',
		apply(draft: Draft<TemplateBody>) {
			const previous = snapshot<Page[]>(draft.pages);
			draft.pages = pages;
			return restorePages(previous);
		},
	};
}

function stripFieldsForRoleFromDoc(doc: Draft<RichTextDoc>, roleId: RoleId): void {
	doc.content = doc.content.filter((node) => !(node.type === 'fillableField' && (node.attrs?.field as FillableField | undefined)?.roleId === roleId));
	for (const node of doc.content) stripFieldsForRoleFromNode(node, roleId);
}

function stripFieldsForRoleFromNode(node: Draft<RichTextNode>, roleId: RoleId): void {
	if (!node.content) return;
	node.content = node.content.filter((child) => !(child.type === 'fillableField' && (child.attrs?.field as FillableField | undefined)?.roleId === roleId));
	for (const child of node.content) stripFieldsForRoleFromNode(child, roleId);
}

function stripFieldsForRoleFromBlocks(blocks: Draft<Block>[], roleId: RoleId): Draft<Block>[] {
	const kept = blocks.filter((block) => !(block.type === 'field' && block.field.roleId === roleId));
	for (const block of kept) {
		if (block.type === 'text') {
			stripFieldsForRoleFromDoc(block.doc, roleId);
		} else if (block.type === 'table') {
			for (const row of block.rows) {
				for (const cell of row.cells) stripFieldsForRoleFromDoc(cell.doc, roleId);
			}
		} else if (block.type === 'columns') {
			block.columns = block.columns.map((column) => stripFieldsForRoleFromBlocks(column, roleId));
		}
	}
	return kept;
}

/**
 * Removes every field (inline or standalone) belonging to `roleId`,
 * anywhere in the template. Undo restores the *entire* `pages` array from a
 * snapshot taken just before — coarser-grained than every other command's
 * inverse, but this one legitimately changes structure in many places at
 * once (an inline field node disappearing from a doc, a whole `FieldBlock`
 * disappearing from a page), and it's a rare, deliberate, whole-template
 * action (triggered from the Recipients panel's role-delete prompt), not a
 * per-keystroke hot path — a full-snapshot undo entry is simpler and exactly
 * as correct as trying to track every individual removal precisely.
 */
export function deleteFieldsForRole(roleId: RoleId): Command {
	return {
		name: 'deleteFieldsForRole',
		apply(draft: Draft<TemplateBody>) {
			const previousPages = snapshot<Page[]>(draft.pages);
			for (const page of draft.pages) {
				page.blocks = stripFieldsForRoleFromBlocks(page.blocks, roleId);
			}
			return restorePages(previousPages);
		},
	};
}

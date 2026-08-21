import type { Block, FillableField, RichTextDoc, RichTextNode, Role, TableCell } from '../types';
import { cloneBlockWithNewIds } from '../commands/blockTree';
import { nextFieldName } from '../commands/fieldCommands';

/**
 * §8: "Insert = deep clone with fresh IDs, setting `contentLibraryRef`."
 *
 * `cloneBlockWithNewIds` does the block-id half. This module handles the two
 * things it deliberately doesn't, both of which only bite once content moves
 * *between* templates — which is exactly what a library is for:
 *
 * 1. **Field ids and names.** `reassignIds` re-ids blocks and recurses into
 *    containers, but never touches `FieldBlock.field.id` or an inline
 *    `fillableField` node's `attrs.field`. Two fields sharing an id is not
 *    cosmetic: a document's submitted `fieldValues` is keyed by field id (see
 *    `api/documents.ts`), so both would read and write one value. Two sharing
 *    a *name* violates §6.1 rule 2, since the name is the merge key.
 * 2. **Dangling role references.** §6.1 rule 1 is that every field belongs to
 *    exactly one role, and roles live per-template. A field saved from a
 *    template with a "Client" role, inserted into one without it, would point
 *    at a role id that doesn't exist here.
 *
 * Both are fixed by remapping rather than by refusing the insert: dropping the
 * fields would silently change what the user saved, and blocking the insert
 * would make the library useless for exactly the content most worth saving.
 */

interface RemapContext {
	/** Grows as fields are remapped, so two inserted fields of the same type don't collide with *each other* either — not just with what was already in the template. */
	existingFields: FillableField[];
	/** The target template's roles. Empty is a real case (a template with no recipients yet). */
	roles: Role[];
}

/**
 * The role an inserted field should belong to. Keeps its original role when
 * that role exists here (the common case: saving and re-inserting inside one
 * workspace's house style, where role names are stable), otherwise falls back
 * to the first role by `order`.
 *
 * Returns the original id unchanged when the target template has no roles at
 * all. That leaves a dangling reference, deliberately: there is no valid role
 * to point at, and `computeValidationIssues` reports a field whose role is
 * missing, so the user is told rather than having their content silently
 * altered or dropped.
 */
function resolveRoleId(originalRoleId: string, roles: Role[]): string {
	if (roles.some((role) => role.id === originalRoleId)) return originalRoleId;
	const fallback = [...roles].sort((a, b) => a.order - b.order)[0];
	return fallback ? fallback.id : originalRoleId;
}

/** Mutates the field in place — safe because everything reaching here is already a fresh clone, never the stored payload. */
function remapField(field: FillableField, context: RemapContext): void {
	field.id = crypto.randomUUID();
	field.roleId = resolveRoleId(field.roleId, context.roles);
	field.name = nextFieldName(field.type, context.existingFields);
	// Registered immediately so the next field of this type picks the number
	// after it, rather than every inserted field racing for "Signature 1".
	context.existingFields.push(field);
}

function remapFieldsInNode(node: RichTextNode, context: RemapContext): void {
	if (node.type === 'fillableField' && node.attrs?.field) {
		remapField(node.attrs.field as FillableField, context);
	}
	if (node.content) for (const child of node.content) remapFieldsInNode(child, context);
}

function remapFieldsInDoc(doc: RichTextDoc, context: RemapContext): void {
	for (const node of doc.content) remapFieldsInNode(node, context);
}

function remapFieldsInCell(cell: TableCell, context: RemapContext): void {
	remapFieldsInDoc(cell.doc, context);
}

/**
 * Walks exactly the locations `collectAllFields` walks — a field can be a
 * standalone `FieldBlock`, or an inline atom inside a text block's doc or a
 * table cell's doc, at any nesting depth reachable through `columns`/
 * `smart_content`. Kept structurally parallel to that walker on purpose: if a
 * new field location is ever added, both need the same edit, and matching
 * shapes make that obvious.
 */
function remapFieldsInBlock(block: Block, context: RemapContext): void {
	if (block.type === 'field') {
		remapField(block.field, context);
		return;
	}
	if (block.type === 'text') {
		remapFieldsInDoc(block.doc, context);
		return;
	}
	if (block.type === 'table') {
		for (const row of block.rows) {
			for (const cell of row.cells) remapFieldsInCell(cell, context);
		}
		return;
	}
	if (block.type === 'columns') {
		for (const column of block.columns) {
			for (const child of column) remapFieldsInBlock(child, context);
		}
		return;
	}
	if (block.type === 'smart_content') {
		for (const child of block.children) remapFieldsInBlock(child, context);
	}
}

/**
 * Prepares a library payload's blocks for insertion into the currently open
 * template. Pure: takes the payload's blocks and the target's existing
 * fields/roles, returns new blocks, mutates nothing the caller passed in.
 *
 * @param blocks              The payload's blocks, straight from the library item.
 * @param contentLibraryRef   The library item's id, stamped onto each top-level
 *                            inserted block. §2.1 describes this as enabling a
 *                            later "source updated — update this block?" prompt;
 *                            it has been in `BlockBase` since phase 1 with
 *                            nothing writing it until now.
 * @param existingFields      Every field already in the target template, so
 *                            names stay unique per §6.1 rule 2.
 * @param roles               The target template's roles (see resolveRoleId).
 */
export function prepareLibraryBlocksForInsert(
	blocks: Block[],
	contentLibraryRef: string,
	existingFields: FillableField[],
	roles: Role[]
): Block[] {
	// Copied, not aliased — remapField pushes onto this as it goes, and the
	// caller's array must not grow as a side effect.
	const context: RemapContext = { existingFields: [...existingFields], roles };
	return blocks.map((block) => {
		const clone = cloneBlockWithNewIds(block);
		remapFieldsInBlock(clone, context);
		clone.contentLibraryRef = contentLibraryRef;
		return clone;
	});
}

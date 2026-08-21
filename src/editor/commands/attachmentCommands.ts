import type { Draft } from 'immer';
import type { Attachment, TemplateBody } from '../types';
import type { Command } from './types';
import { snapshot } from './blockTree';

/**
 * §3's Attachments panel. These are ordinary body commands, so attaching and
 * detaching a file are undoable and autosaved exactly like editing a block —
 * which is the point of storing attachments in `TemplateBody` (see
 * `types.ts`'s `Attachment`) rather than in a table of their own.
 *
 * Nothing here deletes the uploaded `Assets` row or its Stratus object.
 * Detaching a file is undoable, and an undo whose asset had been deleted would
 * restore a broken reference — so orphaned assets are accepted for the same
 * reason `imageCommands.ts` accepts them when an image block is deleted.
 */

/** Reads the list defensively: `attachments` is optional on bodies written before it existed, and `normalizeBody` only backfills at load. */
function attachmentsOf(draft: Draft<TemplateBody>): Attachment[] {
	if (!draft.attachments) draft.attachments = [];
	return draft.attachments;
}

export function addAttachment(attachment: Attachment): Command {
	return {
		name: 'addAttachment',
		apply(draft: Draft<TemplateBody>) {
			attachmentsOf(draft).push(attachment);
			return removeAttachment(attachment.assetId);
		},
	};
}

/**
 * Removes by `assetId`, and its inverse restores the attachment **at the index
 * it came from** rather than appending. Order is what the recipient sees, so a
 * detach-then-undo that silently moved a file to the bottom of the list would
 * be a visible change dressed up as an undo.
 */
export function removeAttachment(assetId: string): Command {
	return {
		name: 'removeAttachment',
		apply(draft: Draft<TemplateBody>) {
			const attachments = attachmentsOf(draft);
			const index = attachments.findIndex((candidate) => candidate.assetId === assetId);
			const target = index === -1 ? undefined : attachments[index];
			// Nothing to remove — the inverse is a no-op rather than a fabricated
			// attachment, which is what an `addAttachment` with empty fields would
			// have restored.
			if (!target) return removeAttachment(assetId);
			const removed = snapshot<Attachment>(target);
			attachments.splice(index, 1);
			return insertAttachmentAt(index, removed);
		},
	};
}

/** Only ever produced as `removeAttachment`'s inverse — not offered in the UI, where new files always append. */
function insertAttachmentAt(index: number, attachment: Attachment): Command {
	return {
		name: 'insertAttachmentAt',
		apply(draft: Draft<TemplateBody>) {
			attachmentsOf(draft).splice(index, 0, attachment);
			return removeAttachment(attachment.assetId);
		},
	};
}

/** §3: the display name is renameable so a recipient sees "Certificate of insurance", not "scan_0012.pdf". */
export function renameAttachment(assetId: string, name: string): Command {
	return {
		name: 'renameAttachment',
		apply(draft: Draft<TemplateBody>) {
			const attachment = attachmentsOf(draft).find((candidate) => candidate.assetId === assetId);
			if (!attachment) return renameAttachment(assetId, name);
			const previousName = attachment.name;
			attachment.name = name;
			return renameAttachment(assetId, previousName);
		},
	};
}

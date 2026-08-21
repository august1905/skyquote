import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { Attachment, TemplateBody } from '../types';
import { addAttachment, removeAttachment, renameAttachment } from './attachmentCommands';
import type { Command } from './types';
import { makeBody } from './testFixtures';

function attachment(assetId: string, name = `File ${assetId}`): Attachment {
	return { assetId, name, filename: `${assetId}.pdf`, contentType: 'application/pdf', sizeBytes: 1024 };
}

/** Runs a command and hands back both the new body and the inverse it produced, mirroring what the store does. */
function run(body: TemplateBody, command: Command): { body: TemplateBody; inverse: Command } {
	let inverse!: Command;
	const next = produce(body, (draft) => {
		inverse = command.apply(draft);
	});
	return { body: next, inverse };
}

describe('attachment commands', () => {
	it('adds an attachment, and its inverse removes it again', () => {
		const added = run(makeBody(), addAttachment(attachment('a1')));
		expect(added.body.attachments).toHaveLength(1);
		expect(added.body.attachments?.[0]?.assetId).toBe('a1');

		const undone = run(added.body, added.inverse);
		expect(undone.body.attachments).toEqual([]);
	});

	it('backfills the list on a body written before attachments existed', () => {
		// Real templates predate this field, and `normalizeBody` only backfills at
		// load — a command run against a body that skipped that path must not throw.
		const legacy = { ...makeBody() };
		delete legacy.attachments;
		const added = run(legacy, addAttachment(attachment('a1')));
		expect(added.body.attachments).toHaveLength(1);
	});

	it('restores a removed attachment at its original index, not at the end', () => {
		// Order is what the recipient sees, so an undo that moved a file to the
		// bottom would be a visible change disguised as an undo.
		let body = makeBody();
		for (const id of ['a1', 'a2', 'a3']) body = run(body, addAttachment(attachment(id))).body;

		const removed = run(body, removeAttachment('a2'));
		expect(removed.body.attachments?.map((a) => a.assetId)).toEqual(['a1', 'a3']);

		const restored = run(removed.body, removed.inverse);
		expect(restored.body.attachments?.map((a) => a.assetId)).toEqual(['a1', 'a2', 'a3']);
	});

	it('removing an attachment that is not there changes nothing and its inverse is harmless', () => {
		const body = run(makeBody(), addAttachment(attachment('a1'))).body;
		const removed = run(body, removeAttachment('missing'));
		expect(removed.body.attachments?.map((a) => a.assetId)).toEqual(['a1']);

		const undone = run(removed.body, removed.inverse);
		expect(undone.body.attachments?.map((a) => a.assetId)).toEqual(['a1']);
	});

	it('renames an attachment and its inverse restores the previous name', () => {
		const body = run(makeBody(), addAttachment(attachment('a1', 'scan_0012.pdf'))).body;

		const renamed = run(body, renameAttachment('a1', 'Certificate of insurance'));
		expect(renamed.body.attachments?.[0]?.name).toBe('Certificate of insurance');

		const undone = run(renamed.body, renamed.inverse);
		expect(undone.body.attachments?.[0]?.name).toBe('scan_0012.pdf');
	});

	it('renaming an attachment that is not there leaves the list alone', () => {
		const body = run(makeBody(), addAttachment(attachment('a1', 'original'))).body;
		const renamed = run(body, renameAttachment('missing', 'nope'));
		expect(renamed.body.attachments?.[0]?.name).toBe('original');
	});
});

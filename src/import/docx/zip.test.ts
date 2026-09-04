import { describe, expect, it } from 'vitest';
import { readZip, zipText } from './zip';

/**
 * Builds a real (if minimal) zip in memory, stored — no compression.
 *
 * A hand-built archive rather than a checked-in `.docx`: the only real export
 * available is a client-facing Skyline proposal, and this repository is public.
 * The bytes below exercise the same central-directory walk a Word document goes
 * through; the deflate path is exercised by every actual import.
 */
function makeZip(entries: { name: string; content: string }[]): ArrayBuffer {
	const encoder = new TextEncoder();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = encoder.encode(entry.name);
		const data = encoder.encode(entry.content);

		const local = new Uint8Array(30 + name.length + data.length);
		const localView = new DataView(local.buffer);
		localView.setUint32(0, 0x04034b50, true);
		localView.setUint16(8, 0, true); // stored
		localView.setUint32(18, data.length, true);
		localView.setUint32(22, data.length, true);
		localView.setUint16(26, name.length, true);
		local.set(name, 30);
		local.set(data, 30 + name.length);
		locals.push(local);

		const central = new Uint8Array(46 + name.length);
		const centralView = new DataView(central.buffer);
		centralView.setUint32(0, 0x02014b50, true);
		centralView.setUint16(10, 0, true);
		centralView.setUint32(20, data.length, true);
		centralView.setUint32(24, data.length, true);
		centralView.setUint16(28, name.length, true);
		centralView.setUint32(42, offset, true);
		central.set(name, 46);
		centrals.push(central);

		offset += local.length;
	}

	const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
	const end = new Uint8Array(22);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, 0x06054b50, true);
	endView.setUint16(8, entries.length, true);
	endView.setUint16(10, entries.length, true);
	endView.setUint32(12, centralSize, true);
	endView.setUint32(16, offset, true);

	const total = [...locals, ...centrals, end];
	const bytes = new Uint8Array(total.reduce((sum, part) => sum + part.length, 0));
	let cursor = 0;
	for (const part of total) {
		bytes.set(part, cursor);
		cursor += part.length;
	}
	return bytes.buffer;
}

describe('readZip', () => {
	it('reads every entry by name', async () => {
		const files = await readZip(makeZip([
			{ name: 'word/document.xml', content: '<w:document/>' },
			{ name: 'word/media/image1.png', content: 'PNGDATA' },
		]));
		expect([...files.keys()]).toEqual(['word/document.xml', 'word/media/image1.png']);
		expect(zipText(files, 'word/document.xml')).toBe('<w:document/>');
	});

	it('returns null for a part the archive does not have, rather than throwing', async () => {
		// Optional parts — numbering.xml, a header — are genuinely absent from
		// some exports, and their absence is not an error.
		const files = await readZip(makeZip([{ name: 'word/document.xml', content: '<x/>' }]));
		expect(zipText(files, 'word/numbering.xml')).toBeNull();
	});

	it('rejects a file that is not a zip at all', async () => {
		const notAZip = new TextEncoder().encode('this is a PDF, actually').buffer;
		await expect(readZip(notAZip)).rejects.toThrow(/not a zip/i);
	});
});

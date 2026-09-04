/**
 * A minimal ZIP reader, enough for a `.docx`.
 *
 * Hand-rolled rather than a dependency because the whole job is "find the
 * central directory, inflate the handful of entries we name" and the platform
 * already ships the inflater (`DecompressionStream('deflate-raw')`, in browsers
 * and in Node 18+, so the same code runs in the app and under vitest).
 *
 * Supports the two compression methods a `.docx` actually uses — stored (0) and
 * deflate (8) — and **not** zip64 or encrypted entries. A file needing either
 * throws by name rather than returning quietly wrong bytes: an Office document
 * large enough for zip64 is not a proposal template, so failing loudly is the
 * honest response to one turning up.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const ZIP64_SENTINEL = 0xffffffff;

export interface ZipEntry {
	name: string;
	/** Raw bytes, already inflated. */
	bytes: Uint8Array;
}

interface CentralEntry {
	name: string;
	compressionMethod: number;
	compressedSize: number;
	localHeaderOffset: number;
}

/**
 * The end-of-central-directory record lives at the very end of the file, after
 * a comment of unknown length — so it's found by scanning backwards for its
 * signature. The comment is capped at 64KB by the format, which bounds the scan.
 */
function findEndOfCentralDirectory(view: DataView): number {
	const earliest = Math.max(0, view.byteLength - 0xffff - 22);
	for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
		if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) return offset;
	}
	throw new Error('Not a zip file: no end-of-central-directory record.');
}

function readCentralDirectory(view: DataView, bytes: Uint8Array): CentralEntry[] {
	const eocd = findEndOfCentralDirectory(view);
	const entryCount = view.getUint16(eocd + 10, true);
	let offset = view.getUint32(eocd + 16, true);
	if (offset === ZIP64_SENTINEL) throw new Error('zip64 archives are not supported.');

	const entries: CentralEntry[] = [];
	const decoder = new TextDecoder();
	for (let index = 0; index < entryCount; index += 1) {
		if (view.getUint32(offset, true) !== CENTRAL_FILE_HEADER) throw new Error('Corrupt zip: bad central file header.');
		const compressionMethod = view.getUint16(offset + 10, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const localHeaderOffset = view.getUint32(offset + 42, true);
		if (compressedSize === ZIP64_SENTINEL || localHeaderOffset === ZIP64_SENTINEL) throw new Error('zip64 archives are not supported.');
		entries.push({
			name: decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
			compressionMethod,
			compressedSize,
			localHeaderOffset,
		});
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

async function inflate(deflated: Uint8Array): Promise<Uint8Array> {
	// `deflate-raw`, not `deflate`: zip entries carry no zlib header.
	const stream = new Blob([deflated as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Every entry in the archive, by name.
 *
 * The whole archive at once rather than a lazy reader: a template's parts are
 * all wanted (the document, its relationships, every image), the file is a few
 * megabytes, and it arrives as an in-memory `ArrayBuffer` from a file input
 * anyway.
 */
export async function readZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
	const bytes = new Uint8Array(buffer);
	const view = new DataView(buffer);
	const files = new Map<string, Uint8Array>();

	for (const entry of readCentralDirectory(view, bytes)) {
		// The local header repeats the name and extra fields at their own
		// lengths — which are *not* always the central directory's — so the data
		// offset has to be read from the local header itself.
		const local = entry.localHeaderOffset;
		if (view.getUint32(local, true) !== LOCAL_FILE_HEADER) throw new Error(`Corrupt zip: bad local header for ${entry.name}`);
		const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		const raw = bytes.subarray(dataStart, dataStart + entry.compressedSize);

		if (entry.compressionMethod === 0) files.set(entry.name, raw);
		else if (entry.compressionMethod === 8) files.set(entry.name, await inflate(raw));
		else throw new Error(`Unsupported zip compression method ${entry.compressionMethod} for ${entry.name}`);
	}
	return files;
}

/** A part's text, or null when the archive doesn't contain it (an optional part — a header, a numbering table). */
export function zipText(files: Map<string, Uint8Array>, name: string): string | null {
	const bytes = files.get(name);
	return bytes ? new TextDecoder().decode(bytes) : null;
}

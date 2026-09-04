import { uploadImageAsset, assetFileRelativePath } from '../../api/assets';
import { createTemplate, saveTemplate } from '../../api/templates';
import { docxToTemplateBody, type DocxImportResult, type ImportedImage } from './docxToTemplate';
import { parseDocx, type ParsedDocx } from './parseDocx';

/**
 * The whole import: a picked `.docx` in, a saved template out.
 *
 * Runs entirely in the browser. Parsing a zip and walking XML needs no backend,
 * and doing it here keeps the Data Store cost of an import to what it actually
 * is — one create, one save, and one upload per *distinct* image.
 */

const CONTENT_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
};

function contentTypeOf(path: string): string {
	return CONTENT_TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png';
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Uploads every image the document actually uses, once per distinct file.
 *
 * The dedupe is by content hash, not by relationship id, because PandaDoc emits
 * a separate relationship per *placement*: this template's 25 media parts are
 * 19 distinct images, with one logo repeated four times. Without it the same
 * logo becomes four library entries and four uploads.
 *
 * An image that fails to upload is left out of the map rather than failing the
 * whole import — 24 images landing and one missing is a better outcome than
 * starting over, and `docxToTemplateBody` skips a block it has no image for.
 */
async function uploadImages(parsed: ParsedDocx, used: Set<string>, onProgress?: (done: number, total: number) => void): Promise<Map<string, ImportedImage>> {
	const uploaded = new Map<string, ImportedImage>();
	const byHash = new Map<string, ImportedImage>();
	const relationshipIds = [...used].filter((id) => parsed.mediaByRelationshipId.has(id));

	for (const [index, relationshipId] of relationshipIds.entries()) {
		const path = parsed.mediaByRelationshipId.get(relationshipId)!;
		const bytes = parsed.files.get(path);
		if (!bytes) continue;

		const hash = await sha256(bytes);
		const existing = byHash.get(hash);
		if (existing) {
			uploaded.set(relationshipId, existing);
			onProgress?.(index + 1, relationshipIds.length);
			continue;
		}

		try {
			const filename = path.split('/').pop() ?? `${relationshipId}.png`;
			const file = new File([bytes as BlobPart], filename, { type: contentTypeOf(path) });
			const asset = await uploadImageAsset(file);
			const image: ImportedImage = { assetId: asset.id, url: assetFileRelativePath(asset.id) };
			byHash.set(hash, image);
			uploaded.set(relationshipId, image);
		} catch {
			// Reported through the missing-image count in the summary.
		}
		onProgress?.(index + 1, relationshipIds.length);
	}
	return uploaded;
}

/** Every relationship the parsed document refers to — page backgrounds included, which are not blocks. */
function usedRelationshipIds(parsed: ParsedDocx): Set<string> {
	const used = new Set<string>();
	for (const page of parsed.pages) {
		if (page.backgroundRelationshipId) used.add(page.backgroundRelationshipId);
		for (const content of page.content) {
			if (content.kind === 'image') used.add(content.relationshipId);
		}
	}
	return used;
}

/**
 * `[Client.Company] House Cleaning Proposal 2025 template.docx` → the template
 * name, tokens intact.
 *
 * Template names carry variable tokens already (`resolveTitle` substitutes them
 * when a document is created), so PandaDoc's own naming convention survives
 * as-is rather than being stripped.
 */
export function templateNameFromFilename(filename: string): string {
	return filename.replace(/\.docx$/i, '').replace(/\s+template$/i, '').trim() || 'Imported template';
}

export interface DocxImportProgress {
	stage: 'parsing' | 'uploading' | 'saving';
	done?: number;
	total?: number;
}

export interface DocxImportOutcome extends DocxImportResult {
	templateId: string;
	/** Images the document referred to that didn't upload — named so a partial import is visible rather than quietly incomplete. */
	missingImages: number;
}

export async function importDocxAsTemplate(file: File, onProgress?: (progress: DocxImportProgress) => void): Promise<DocxImportOutcome> {
	onProgress?.({ stage: 'parsing' });
	const parsed = await parseDocx(await file.arrayBuffer());
	if (parsed.pages.length === 0) throw new Error('That document has no pages this importer could read.');

	const used = usedRelationshipIds(parsed);
	onProgress?.({ stage: 'uploading', done: 0, total: used.size });
	const images = await uploadImages(parsed, used, (done, total) => onProgress?.({ stage: 'uploading', done, total }));

	onProgress?.({ stage: 'saving' });
	// Created first so the import builds onto this app's own defaults — the
	// seeded signer roles and the theme, which a .docx knows nothing about.
	const { meta, body } = await createTemplate({ name: templateNameFromFilename(file.name) });
	const result = docxToTemplateBody(parsed, images, body);
	await saveTemplate(meta.id, { version: meta.version, body: result.body });

	return { ...result, templateId: meta.id, missingImages: used.size - images.size };
}

import type { RichTextDoc, RichTextNode } from '../types';

/**
 * Canonicalizes a ProseMirror doc for storage and comparison.
 *
 * **Why this exists.** Tiptap extensions that register *global attributes* —
 * `TextAlign` is the one this app uses — make ProseMirror serialize that
 * attribute on every node it applies to, even when unset: a plain paragraph
 * round-trips as `{"type":"paragraph","attrs":{"textAlign":null}}`. A doc
 * stored before that extension existed has no `attrs` at all, so the two
 * differ textually while being semantically identical.
 *
 * That difference is not cosmetic. `TextBlockView` compares the editor's doc
 * against the stored one to decide whether a change is real, and Tiptap fires
 * `onUpdate` when parsing normalizes incoming content. Without canonicalizing
 * first, **every text block pushed a spurious `setBlockDoc` the moment it
 * mounted** — which marked a freshly-opened template dirty (triggering an
 * autosave nobody asked for) and put junk entries on the undo stack, so the
 * first few Ctrl+Z presses appeared to do nothing. Caught by the Content
 * Library's e2e test, which undoes a multi-block insert and found four
 * unrelated entries sitting on top of it.
 *
 * Three kinds of noise are removed, all of which ProseMirror treats as
 * equivalent to their absence:
 * - `attrs` entries whose value is `null`/`undefined` (and the `attrs` object
 *   itself once empty),
 * - an empty `content` array (a childless node omits `content` entirely),
 * - an empty `marks` array.
 */
function normalizeNode(node: RichTextNode): RichTextNode {
	const normalized: RichTextNode = { type: node.type };

	if (node.attrs) {
		const attrs = Object.fromEntries(Object.entries(node.attrs).filter(([, value]) => value !== null && value !== undefined));
		if (Object.keys(attrs).length > 0) normalized.attrs = attrs;
	}
	if (node.marks && node.marks.length > 0) normalized.marks = node.marks;
	if (node.text !== undefined) normalized.text = node.text;
	if (node.content && node.content.length > 0) normalized.content = node.content.map(normalizeNode);

	return normalized;
}

export function normalizeDoc(doc: RichTextDoc): RichTextDoc {
	return { ...doc, type: doc.type, content: (doc.content ?? []).map(normalizeNode) };
}

/**
 * Whether two docs are the same once canonicalized. Used to tell a real edit
 * from ProseMirror's own parse-time normalization.
 *
 * `JSON.stringify` is a sound comparison here only because `normalizeDoc`
 * rebuilds every node with keys assigned in a fixed order, so two equivalent
 * docs always serialize identically regardless of the key order they arrived
 * in.
 */
export function docsEqual(a: RichTextDoc, b: RichTextDoc): boolean {
	return JSON.stringify(normalizeDoc(a)) === JSON.stringify(normalizeDoc(b));
}

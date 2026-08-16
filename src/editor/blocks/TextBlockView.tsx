import type { RichTextDoc, RichTextNode, TextBlock } from '../types';
import type { BlockViewProps } from './types';

// Placeholder read-only render — step 7 replaces this with a real Tiptap
// instance per block (§5). Kept deliberately dumb: it only needs to prove the
// registry wires a block to a component, not implement editing.
function plainTextOfNode(node: RichTextNode): string {
	if (node.text !== undefined) return node.text;
	if (!node.content) return '';
	return node.content.map(plainTextOfNode).join('');
}

function plainTextOfDoc(doc: RichTextDoc): string {
	return doc.content.map(plainTextOfNode).join('\n');
}

export function TextBlockView({ block }: BlockViewProps<TextBlock>) {
	const text = plainTextOfDoc(block.doc);
	return <div className="block-text">{text.length > 0 ? text : <em>Empty text block</em>}</div>;
}

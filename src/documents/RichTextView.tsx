import { createElement, type CSSProperties, type ReactNode } from 'react';
import type { FillableField, RichTextDoc, RichTextNode } from '../editor/types';
import { FieldPreview, type FieldValue } from '../editor/fields/FieldPreview';

/**
 * Bundles the recipient document view's field state so it doesn't have to
 * be threaded through every recursive call as three separate props.
 * Omitted entirely outside a document-viewing context (nothing is ever
 * controlled/persisted there — see `FieldPreview`'s own uncontrolled
 * fallback).
 */
export interface FieldInteraction {
	fieldValues: Record<string, FieldValue>;
	onFieldChange: (fieldId: string, value: FieldValue) => void;
	/** Freezes every live field read-only once this recipient has already submitted/declined. */
	readOnly: boolean;
	/**
	 * Set for every real document, `'not-sent'` included — omitted **only** outside
	 * a document (the template editor's "Preview as role"). That distinction is
	 * load-bearing: while this was set only for documents Zoho Sign already knew
	 * about, a document nobody had sent fell through to the editor's preview
	 * toggle, so a recipient got a box that flipped to "✓ Signature added" and
	 * wrote a boolean. Nothing was signed. They had every reason to think they were
	 * done — the worst kind of bug, because both sides then believe a document is
	 * signed when it isn't.
	 */
	signing?: RecipientSigning | undefined;
}

/** What Zoho Sign currently says about the recipient reading this document, and how to open the panel. */
export interface RecipientSigning {
	/** `not-sent` = this document never reached Zoho Sign, so there is nothing to open. */
	status: 'not-sent' | 'awaiting' | 'signed' | 'declined';
	open: () => void;
}

interface RichTextViewProps {
	doc: RichTextDoc;
	/** The viewing recipient's own role — a `fillableField` node whose `roleId` matches renders live/fillable (see `FieldPreview`); every other field stays inert. `null` outside a document-viewing context, where nothing is ever live. */
	viewerRoleId: string | null;
	fieldInteraction?: FieldInteraction | undefined;
}

/**
 * A hand-rolled, read-only renderer for `RichTextDoc` JSON — deliberately
 * NOT a mounted (even `editable: false`) Tiptap instance. Every other rich-
 * text surface (`TextBlockView`, `TableCellEditor`) is wired to the editor's
 * Zustand store for its NodeViews (`FieldChipView`'s "Preview as {role}"
 * lookup in particular) — reusing that here would mean either loading an
 * unrelated Document into the same store the Template editor uses, or
 * teaching every NodeView to accept a role from somewhere other than the
 * store. A small standalone walker sidesteps that coupling entirely; it only
 * has to handle the finite set of nodes/marks StarterKit + this app's own
 * `fillableField` node can actually produce (`variable` nodes never reach
 * here — they're resolved to plain text before a `Document` is created, see
 * resolveVariables.ts).
 */
export function RichTextView({ doc, viewerRoleId, fieldInteraction }: RichTextViewProps) {
	return (
		<>
			{doc.content.map((node, index) => (
				<RenderNode key={index} node={node} viewerRoleId={viewerRoleId} fieldInteraction={fieldInteraction} />
			))}
		</>
	);
}

function renderChildren(node: RichTextNode, viewerRoleId: string | null, fieldInteraction: FieldInteraction | undefined): ReactNode {
	return (node.content ?? []).map((child, index) => (
		<RenderNode key={index} node={child} viewerRoleId={viewerRoleId} fieldInteraction={fieldInteraction} />
	));
}

function RenderNode({
	node,
	viewerRoleId,
	fieldInteraction,
}: {
	node: RichTextNode;
	viewerRoleId: string | null;
	fieldInteraction: FieldInteraction | undefined;
}) {
	switch (node.type) {
		case 'paragraph':
			return <p style={blockNodeStyle(node)}>{renderChildren(node, viewerRoleId, fieldInteraction)}</p>;
		case 'heading': {
			const level = typeof node.attrs?.level === 'number' ? Math.min(Math.max(node.attrs.level, 1), 6) : 1;
			return createElement(`h${level}`, { style: blockNodeStyle(node) }, renderChildren(node, viewerRoleId, fieldInteraction));
		}
		case 'blockquote':
			return <blockquote>{renderChildren(node, viewerRoleId, fieldInteraction)}</blockquote>;
		case 'bulletList':
			return <ul>{renderChildren(node, viewerRoleId, fieldInteraction)}</ul>;
		case 'orderedList':
			return <ol>{renderChildren(node, viewerRoleId, fieldInteraction)}</ol>;
		case 'listItem':
			return <li>{renderChildren(node, viewerRoleId, fieldInteraction)}</li>;
		case 'codeBlock':
			return (
				<pre>
					<code>{renderChildren(node, viewerRoleId, fieldInteraction)}</code>
				</pre>
			);
		case 'horizontalRule':
			return <hr />;
		case 'hardBreak':
			return <br />;
		case 'fillableField': {
			const field = node.attrs?.field as FillableField | undefined;
			if (!field) return null;
			const live = viewerRoleId !== null && viewerRoleId === field.roleId;
			return (
				<span className="rt-view-field-chip">
					<FieldPreview
						field={field}
						live={live}
						value={fieldInteraction?.fieldValues[field.id]}
						onChange={fieldInteraction ? (value) => fieldInteraction.onFieldChange(field.id, value) : undefined}
						readOnly={fieldInteraction?.readOnly}
						signing={fieldInteraction?.signing}
					/>
				</span>
			);
		}
		case 'text':
			return <>{renderMarks(node)}</>;
		default:
			// An unrecognized node type degrades to "render its children, skip
			// the wrapper" rather than throwing — same "don't let unknown
			// content from a serialization boundary crash the app" convention
			// `getBlockRegistryEntry` already follows for block types.
			return node.content ? <>{renderChildren(node, viewerRoleId, fieldInteraction)}</> : null;
	}
}

/**
 * `TextAlign` registers `textAlign` as a global attribute on paragraphs and
 * headings — a block-node concern, unlike every mark below.
 */
function blockNodeStyle(node: RichTextNode): CSSProperties | undefined {
	const textAlign = node.attrs?.textAlign;
	return typeof textAlign === 'string' && textAlign ? ({ textAlign } as CSSProperties) : undefined;
}

/** The `textStyle` mark's attrs (`fontSize`, `color`, `lineHeight` — see `richTextExtensions.ts`) as inline CSS, or `undefined` when the mark carries nothing renderable. */
function textStyleCss(attrs: Record<string, unknown> | undefined): CSSProperties | undefined {
	const style: CSSProperties = {};
	if (typeof attrs?.fontSize === 'string') style.fontSize = attrs.fontSize;
	if (typeof attrs?.color === 'string') style.color = attrs.color;
	if (typeof attrs?.lineHeight === 'string' || typeof attrs?.lineHeight === 'number') style.lineHeight = attrs.lineHeight;
	return Object.keys(style).length > 0 ? style : undefined;
}

/**
 * Every mark the editor's schema can produce (`richTextExtensions.ts`) has a
 * branch here. The `default: break` swallows anything unknown, which is the
 * right call for genuinely future marks — but it also means a mark added to the
 * editor without a branch here **silently disappears from every document, PDF
 * and signed agreement** while looking fine in the template. That happened:
 * `textStyle` (font size, font color) had no branch, so a 48px headline in the
 * template rendered at body size the moment a document was created.
 */
function renderMarks(node: RichTextNode): ReactNode {
	let content: ReactNode = node.text ?? '';
	for (const mark of node.marks ?? []) {
		switch (mark.type) {
			case 'bold':
				content = <strong>{content}</strong>;
				break;
			case 'italic':
				content = <em>{content}</em>;
				break;
			case 'underline':
				content = <u>{content}</u>;
				break;
			case 'strike':
				content = <s>{content}</s>;
				break;
			case 'code':
				content = <code>{content}</code>;
				break;
			case 'superscript':
				content = <sup>{content}</sup>;
				break;
			case 'subscript':
				content = <sub>{content}</sub>;
				break;
			case 'highlight': {
				const color = typeof mark.attrs?.color === 'string' ? mark.attrs.color : undefined;
				content = <mark style={color ? { backgroundColor: color } : undefined}>{content}</mark>;
				break;
			}
			case 'textStyle': {
				const style = textStyleCss(mark.attrs);
				if (style) content = <span style={style}>{content}</span>;
				break;
			}
			case 'link': {
				const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : undefined;
				content = (
					<a href={href} target="_blank" rel="noreferrer">
						{content}
					</a>
				);
				break;
			}
			default:
				break;
		}
	}
	return content;
}

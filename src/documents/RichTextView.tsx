import { createElement, type ReactNode } from 'react';
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
	 * Opens the Zoho Sign panel — passed only once the document has actually been
	 * sent for signature, which is what makes a signature box mean something.
	 *
	 * Until this existed, a sent document showed the recipient a signature box
	 * that toggled to "✓ Signature added" and wrote a boolean. Nothing was signed.
	 * A customer clicking it had every reason to think they had signed and to stop
	 * there, never scrolling to the real button at the foot of the page — the worst
	 * kind of bug, because both sides believe the thing is done.
	 */
	onOpenSigning?: (() => void) | undefined;
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
			return <p>{renderChildren(node, viewerRoleId, fieldInteraction)}</p>;
		case 'heading': {
			const level = typeof node.attrs?.level === 'number' ? Math.min(Math.max(node.attrs.level, 1), 6) : 1;
			return createElement(`h${level}`, null, renderChildren(node, viewerRoleId, fieldInteraction));
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
						onOpenSigning={fieldInteraction?.onOpenSigning}
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

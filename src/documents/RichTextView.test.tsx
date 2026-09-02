// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FillableField, RichTextDoc, RichTextNode } from '../editor/types';
import { RichTextView } from './RichTextView';

afterEach(cleanup);

function doc(content: RichTextNode[]): RichTextDoc {
	return { type: 'doc', content };
}

describe('RichTextView', () => {
	it('renders a paragraph with bold/italic marks and plain text side by side', () => {
		render(
			<RichTextView
				doc={doc([
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'Hello ' },
							{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
							{ type: 'text', text: ' and ' },
							{ type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
						],
					},
				])}
				viewerRoleId={null}
			/>
		);
		const paragraph = screen.getByText(/Hello/).closest('p');
		expect(paragraph).not.toBeNull();
		expect(paragraph!.querySelector('strong')?.textContent).toBe('bold');
		expect(paragraph!.querySelector('em')?.textContent).toBe('italic');
	});

	it('renders a heading at its own level', () => {
		render(<RichTextView doc={doc([{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section' }] }])} viewerRoleId={null} />);
		expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeInTheDocument();
	});

	it('renders a bullet list as ul > li', () => {
		render(
			<RichTextView
				doc={doc([
					{
						type: 'bulletList',
						content: [
							{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
							{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] },
						],
					},
				])}
				viewerRoleId={null}
			/>
		);
		const items = screen.getAllByRole('listitem');
		expect(items.map((el) => el.textContent)).toEqual(['One', 'Two']);
	});

	it('renders a link mark with its href', () => {
		render(<RichTextView doc={doc([{ type: 'paragraph', content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] }])} viewerRoleId={null} />);
		expect(screen.getByRole('link', { name: 'click' })).toHaveAttribute('href', 'https://example.com');
	});

	it('renders a fillableField node inert when the viewer is not its role, live when it is', () => {
		const field: FillableField = { id: 'f1', type: 'text', roleId: 'role-a', name: 'Text field 1', required: false };
		const node: RichTextNode = { type: 'fillableField', attrs: { field } };

		const { rerender } = render(<RichTextView doc={doc([node])} viewerRoleId={null} />);
		expect(screen.getByRole('textbox')).toBeDisabled();

		rerender(<RichTextView doc={doc([node])} viewerRoleId="role-a" />);
		expect(screen.getByRole('textbox')).toBeEnabled();

		rerender(<RichTextView doc={doc([node])} viewerRoleId="role-b" />);
		expect(screen.getByRole('textbox')).toBeDisabled();
	});

	it('renders the textStyle mark as inline font-size, color and line-height — the template-to-document fidelity bug', () => {
		render(
			<RichTextView
				doc={doc([
					{
						type: 'paragraph',
						content: [{ type: 'text', text: 'Big red', marks: [{ type: 'textStyle', attrs: { fontSize: '48px', color: '#c0392b', lineHeight: '1.2' } }] }],
					},
				])}
				viewerRoleId={null}
			/>
		);
		const span = screen.getByText('Big red');
		expect(span.tagName).toBe('SPAN');
		expect(span.style.fontSize).toBe('48px');
		expect(span.style.color).toBe('rgb(192, 57, 43)');
		expect(span.style.lineHeight).toBe('1.2');
	});

	it('a textStyle mark with no renderable attrs adds no wrapper at all', () => {
		render(<RichTextView doc={doc([{ type: 'paragraph', content: [{ type: 'text', text: 'plain', marks: [{ type: 'textStyle', attrs: {} }] }] }])} viewerRoleId={null} />);
		expect(screen.getByText('plain').tagName).toBe('P');
	});

	it('renders highlight as <mark> with its color, and superscript/subscript as sup/sub', () => {
		render(
			<RichTextView
				doc={doc([
					{
						type: 'paragraph',
						content: [
							{ type: 'text', text: 'lit', marks: [{ type: 'highlight', attrs: { color: '#fff3a3' } }] },
							{ type: 'text', text: 'up', marks: [{ type: 'superscript' }] },
							{ type: 'text', text: 'down', marks: [{ type: 'subscript' }] },
						],
					},
				])}
				viewerRoleId={null}
			/>
		);
		const highlighted = screen.getByText('lit');
		expect(highlighted.tagName).toBe('MARK');
		expect(highlighted.style.backgroundColor).toBe('rgb(255, 243, 163)');
		expect(screen.getByText('up').tagName).toBe('SUP');
		expect(screen.getByText('down').tagName).toBe('SUB');
	});

	it('applies textAlign from paragraph and heading attrs', () => {
		render(
			<RichTextView
				doc={doc([
					{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'centered' }] },
					{ type: 'heading', attrs: { level: 2, textAlign: 'right' }, content: [{ type: 'text', text: 'flushed' }] },
				])}
				viewerRoleId={null}
			/>
		);
		expect(screen.getByText('centered').style.textAlign).toBe('center');
		expect(screen.getByRole('heading', { level: 2 }).style.textAlign).toBe('right');
	});

	it('degrades an unrecognized node type to just its children rather than throwing', () => {
		render(<RichTextView doc={doc([{ type: 'someFutureNode', content: [{ type: 'text', text: 'still here' }] }])} viewerRoleId={null} />);
		expect(screen.getByText('still here')).toBeInTheDocument();
	});

	it('a controlled fieldInteraction reads its value from fieldValues and reports edits via onFieldChange, and readOnly freezes it', () => {
		const field: FillableField = { id: 'f1', type: 'text', roleId: 'role-a', name: 'Text field 1', required: false };
		const node: RichTextNode = { type: 'fillableField', attrs: { field } };
		const onFieldChange = vi.fn();

		const { rerender } = render(
			<RichTextView
				doc={doc([node])}
				viewerRoleId="role-a"
				fieldInteraction={{ fieldValues: { f1: 'Saved answer' }, onFieldChange, readOnly: false }}
			/>
		);
		const input = screen.getByRole('textbox');
		expect(input).toHaveValue('Saved answer');
		expect(input).toBeEnabled();

		fireEvent.change(input, { target: { value: 'New answer' } });
		expect(onFieldChange).toHaveBeenCalledWith('f1', 'New answer');
		// Controlled — the DOM doesn't update on its own until the prop does (no local state fallback engaged).
		expect(input).toHaveValue('Saved answer');

		rerender(
			<RichTextView
				doc={doc([node])}
				viewerRoleId="role-a"
				fieldInteraction={{ fieldValues: { f1: 'Saved answer' }, onFieldChange, readOnly: true }}
			/>
		);
		expect(screen.getByRole('textbox')).toBeDisabled();
	});
});

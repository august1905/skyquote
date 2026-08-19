// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

	it('degrades an unrecognized node type to just its children rather than throwing', () => {
		render(<RichTextView doc={doc([{ type: 'someFutureNode', content: [{ type: 'text', text: 'still here' }] }])} viewerRoleId={null} />);
		expect(screen.getByText('still here')).toBeInTheDocument();
	});
});

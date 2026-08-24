// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Block } from '../editor/types';
import { EMPTY_SMART_CONTENT_CONTEXT } from '../smartContent/evaluateRules';
import { DocumentBlockView } from './DocumentBlockView';

afterEach(cleanup);

function renderBlock(block: Block) {
	return render(
		<DocumentBlockView block={block} resolveImageSrc={(id) => `/assets/${id}/file`} viewerRoleId={null} smartContentContext={EMPTY_SMART_CONTENT_CONTEXT} />
	);
}

const textBlock = (style: Block['style'] = {}): Block => ({
	id: 'block-1',
	type: 'text',
	locked: false,
	style,
	doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
});

/**
 * These cover what the e2e can't reach cheaply: that block styling is present in
 * the *recipient's* markup at all. It was editor-only until 2026-08-24 — an
 * author could pad and colour a block, see it on the canvas, and send a document
 * with none of it.
 */
describe('DocumentBlockView — block style', () => {
	it('carries padding, margin, background and border into the rendered document', () => {
		const { container } = renderBlock(
			textBlock({
				padding: { top: 10, right: 20, bottom: 30, left: 40 },
				margin: { top: 8, right: 0, bottom: 8, left: 24 },
				backgroundColor: 'rgb(6, 77, 129)',
			})
		);
		const wrapper = container.querySelector('.doc-view-block') as HTMLElement;
		expect(wrapper).not.toBeNull();
		expect(wrapper.style.padding).toBe('10px 20px 30px 40px');
		expect(wrapper.style.marginLeft).toBe('24px');
		expect(wrapper.style.backgroundColor).toBe('rgb(6, 77, 129)');
	});

	it('adds no wrapper at all for an unstyled block', () => {
		// Most blocks in most documents are unstyled; wrapping every one of them
		// would change the DOM (and the CSS that targets it) for no benefit.
		const { container } = renderBlock(textBlock());
		expect(container.querySelector('.doc-view-block')).toBeNull();
	});

	it('adds no wrapper for a block that renders nothing, so its padding cannot become a visible gap', () => {
		// A `toc` renders nothing in the web view. With a naive wrapper, 40px of
		// padding on it would draw 80px of empty space the author never asked for.
		const { container } = renderBlock({
			id: 'toc-1',
			type: 'toc',
			locked: false,
			style: { padding: { top: 40, right: 40, bottom: 40, left: 40 } },
			levels: 2,
		});
		expect(container.querySelector('.doc-view-block')).toBeNull();
		expect(container.innerHTML).toBe('');
	});
});

describe('DocumentBlockView — spacer', () => {
	it('renders as height and nothing else', () => {
		// No border, no background, no label: the editor's dashed outline is
		// authoring chrome, and a recipient seeing it would read a deliberate gap
		// as a rendering fault.
		const { container } = renderBlock({ id: 'spacer-1', type: 'spacer', locked: false, style: {}, height: 64 });
		const spacer = container.firstElementChild as HTMLElement;
		expect(spacer.style.height).toBe('64px');
		expect(spacer.getAttribute('aria-hidden')).toBe('true');
		expect(spacer.className).toBe('');
		expect(spacer.textContent).toBe('');
	});
});

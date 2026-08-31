// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldPreview } from './FieldPreview';
import { makeField } from '../commands/testFixtures';
import type { RecipientSigning } from '../../documents/RichTextView';

/**
 * The one thing that must never regress here: **a signature box on a real
 * document must never be a local toggle.**
 *
 * It was, and it cost a day of debugging a working integration. Zoho Sign was
 * connected, healthy and correctly wired end to end — but a document nobody had
 * sent for signature left `signing` undefined, which fell through to the template
 * editor's "Preview as role" toggle. So the recipient got a box that flipped
 * between "Click to add signature" and "✓ Signature added", wrote a boolean, and
 * signed nothing. It reads exactly like a dead button, and if it's ever believed
 * instead, both sides think a document is signed when it isn't.
 *
 * Hence the shape of these tests: they assert on what the recipient can *press*,
 * not just on what the box says.
 */

afterEach(cleanup);

const signing = (status: RecipientSigning['status'], open = vi.fn()): RecipientSigning => ({ status, open });

describe('FieldPreview: a signature field on a real document', () => {
	it('offers the Zoho Sign panel once the document has been sent', () => {
		const open = vi.fn();
		render(<FieldPreview field={makeField('f', 'role-a', { type: 'signature' })} live signing={signing('awaiting', open)} />);
		fireEvent.click(screen.getByRole('button', { name: /click to add your signature/i }));
		expect(open).toHaveBeenCalledOnce();
	});

	it('says so, and offers nothing to press, when the document never reached Zoho Sign', () => {
		render(<FieldPreview field={makeField('f', 'role-a', { type: 'signature' })} live signing={signing('not-sent')} />);
		expect(screen.getByText(/not ready for signing yet/i)).toBeInTheDocument();
		// The assertion that actually guards the bug. A box saying the wrong thing is
		// a copy problem; a *pressable* box is the one that convinces someone they
		// signed something.
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('reports a completed signature as the server told it, not as an empty box', () => {
		render(<FieldPreview field={makeField('f', 'role-a', { type: 'signature' })} live signing={signing('signed')} />);
		expect(screen.getByText(/signed/i)).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('reports a declined one', () => {
		render(<FieldPreview field={makeField('f', 'role-a', { type: 'signature' })} live signing={signing('declined')} />);
		expect(screen.getByText(/declined/i)).toBeInTheDocument();
	});

	it('never shows the local toggle for any signing state', () => {
		// Every state a real document can be in, checked against the toggle's own
		// copy — the difference is one word ("your"), which is exactly why this is a
		// test rather than something to eyeball.
		for (const status of ['not-sent', 'awaiting', 'signed', 'declined'] as const) {
			render(<FieldPreview field={makeField('f', 'role-a', { type: 'signature' })} live signing={signing(status)} />);
			expect(screen.queryByText('Click to add signature')).not.toBeInTheDocument();
			expect(screen.queryByText('✓ Signature added')).not.toBeInTheDocument();
			cleanup();
		}
	});

	it('applies the same rules to initials', () => {
		render(<FieldPreview field={makeField('f', 'role-a', { type: 'initials' })} live signing={signing('not-sent')} />);
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});
});

describe('FieldPreview: a stamp', () => {
	it('keeps its local toggle even on a sent document, because Zoho Sign has no stamp field', () => {
		// `ZOHO_SIGN_FIELD_TYPES.stamp` is null, so a stamp is never part of a
		// signature request at all. Giving it a signing state it can't have would
		// point the recipient at a panel with no stamp in it.
		render(<FieldPreview field={makeField('f', 'role-a', { type: 'stamp' })} live signing={signing('awaiting')} />);
		fireEvent.click(screen.getByRole('button', { name: /click to add stamp/i }));
		expect(screen.getByRole('button', { name: /stamp added/i })).toBeInTheDocument();
	});
});

describe("FieldPreview: the template editor's Preview as role", () => {
	it('keeps the local toggle, which is honest with no document behind it', () => {
		// `signing` omitted entirely — this is a template, there is no document and
		// nothing is being claimed as signed. The toggle demonstrates that the field
		// is fillable, which is the whole point of the preview.
		render(<FieldPreview field={makeField('f', 'role-a', { type: 'signature' })} live />);
		fireEvent.click(screen.getByRole('button', { name: /click to add signature/i }));
		expect(screen.getByRole('button', { name: /signature added/i })).toBeInTheDocument();
	});

	it('renders an inert box when not live, so clicking configures rather than fills', () => {
		render(<FieldPreview field={makeField('f', 'role-a', { type: 'signature' })} live={false} />);
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});
});

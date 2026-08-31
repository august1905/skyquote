// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What must never regress here: **the panel has to notice a signature without
 * being told by a webhook.**
 *
 * Measured against the live account: a recipient clicked Finish and this panel
 * took 8 seconds to close, because it polled our own database and our database
 * could not know until Zoho Sign's webhook arrived. Zoho Sign's API had said
 * `SIGNED` from the first moment. And driving a full signing session with every
 * inbound `postMessage` logged showed Zoho Sign sends **none** — so there is no
 * event to listen for and polling is the mechanism, not a fallback.
 *
 * Hence the two tests that matter: it polls `syncSigningStatus` (Zoho Sign),
 * never `getPublicDocument` (our database), and it settles itself when that comes
 * back terminal.
 */

const requestSigningUrl = vi.hoisted(() => vi.fn());
const syncSigningStatus = vi.hoisted(() => vi.fn());
const getPublicDocument = vi.hoisted(() => vi.fn());
vi.mock('../api/documents', () => ({ requestSigningUrl, syncSigningStatus, getPublicDocument }));

// Imported after the mock is registered.
const { SigningPanel } = await import('./SigningPanel');

beforeEach(() => {
	vi.useFakeTimers();
	requestSigningUrl.mockResolvedValue({ signUrl: 'https://sign.zoho.com/zsembedded?embed_token=x', expiresInSeconds: 120 });
	syncSigningStatus.mockResolvedValue({ registered: true, recipientStatus: 'viewed', documentStatus: 'viewed', stale: false });
	getPublicDocument.mockResolvedValue({});
});

afterEach(() => {
	vi.useRealTimers();
	cleanup();
	vi.clearAllMocks();
});

function renderPanel(overrides: { onSettled?: () => void; onClose?: () => void } = {}) {
	const onSettled = overrides.onSettled ?? vi.fn();
	const onClose = overrides.onClose ?? vi.fn();
	render(<SigningPanel documentId="doc-1" token="tok-1" onSettled={onSettled} onClose={onClose} />);
	return { onSettled, onClose };
}

describe('SigningPanel', () => {
	it('asks Zoho Sign whether the signature landed, not our own document record', async () => {
		renderPanel();
		await vi.advanceTimersByTimeAsync(3000);
		expect(syncSigningStatus).toHaveBeenCalledWith('doc-1', 'tok-1');
		// The regression this guards: re-reading the document could only ever report
		// what the webhook had already delivered, and cost a whole Stratus body read
		// per poll to do it.
		expect(getPublicDocument).not.toHaveBeenCalled();
	});

	it('settles itself as soon as Zoho Sign reports the recipient signed', async () => {
		const onSettled = vi.fn();
		renderPanel({ onSettled });
		expect(onSettled).not.toHaveBeenCalled();

		syncSigningStatus.mockResolvedValue({ registered: true, recipientStatus: 'completed', documentStatus: 'completed', stale: false });
		await vi.advanceTimersByTimeAsync(3000);
		expect(onSettled).toHaveBeenCalledWith('completed');
	});

	it('settles on a decline too', async () => {
		const onSettled = vi.fn();
		renderPanel({ onSettled });
		syncSigningStatus.mockResolvedValue({ registered: true, recipientStatus: 'declined', documentStatus: 'declined', stale: false });
		await vi.advanceTimersByTimeAsync(3000);
		expect(onSettled).toHaveBeenCalledWith('declined');
	});

	it('stays open, without erroring, while the recipient has not finished', async () => {
		const onSettled = vi.fn();
		const onClose = vi.fn();
		renderPanel({ onSettled, onClose });
		await vi.advanceTimersByTimeAsync(12_000);
		expect(onSettled).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		// Several polls in, not one — this is what closes the panel, so it has to keep going.
		expect(syncSigningStatus.mock.calls.length).toBeGreaterThan(2);
	});

	it('keeps polling when a poll fails, rather than giving up on closing itself', async () => {
		const onSettled = vi.fn();
		renderPanel({ onSettled });
		syncSigningStatus.mockRejectedValue(new Error('network'));
		await vi.advanceTimersByTimeAsync(6000);
		syncSigningStatus.mockResolvedValue({ registered: true, recipientStatus: 'completed', documentStatus: 'completed', stale: false });
		await vi.advanceTimersByTimeAsync(6000);
		expect(onSettled).toHaveBeenCalledWith('completed');
	});

	it('hands the close button straight to onClose, so X is never blocked on a network call', async () => {
		// The X has to be instant. Whoever owns this panel is responsible for
		// re-checking afterwards — see DocumentView's `onClose`, which is where the
		// "signed but still says unsigned" bug actually lived.
		const onClose = vi.fn();
		renderPanel({ onClose });
		await vi.advanceTimersByTimeAsync(500);
		fireEvent.click(screen.getByRole('button', { name: /close signing panel/i }));
		expect(onClose).toHaveBeenCalledOnce();
	});
});

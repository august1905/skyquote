import { afterEach, describe, expect, it, vi } from 'vitest';
import { embedUrlFor, extractVimeoId, extractYouTubeId, fetchOEmbed, identifyProvider } from './videoEmbed';

describe('identifyProvider', () => {
	it('recognizes youtube.com, youtu.be, and www./subdomain variants', () => {
		expect(identifyProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
		expect(identifyProvider('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
		expect(identifyProvider('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
		expect(identifyProvider('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
	});

	it('recognizes vimeo.com', () => {
		expect(identifyProvider('https://vimeo.com/76979871')).toBe('vimeo');
		expect(identifyProvider('https://player.vimeo.com/video/76979871')).toBe('vimeo');
	});

	it('returns null for an unsupported host or an unparseable URL', () => {
		expect(identifyProvider('https://example.com/video.mp4')).toBeNull();
		expect(identifyProvider('not a url at all')).toBeNull();
	});
});

describe('extractYouTubeId / extractVimeoId', () => {
	it('extracts the id from watch?v=, youtu.be/, and /embed/ forms', () => {
		expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYouTubeId('https://example.com')).toBeNull();
	});

	it('extracts the numeric id from vimeo.com/ID and vimeo.com/video/ID forms', () => {
		expect(extractVimeoId('https://vimeo.com/76979871')).toBe('76979871');
		expect(extractVimeoId('https://vimeo.com/video/76979871')).toBe('76979871');
		expect(extractVimeoId('https://example.com')).toBeNull();
	});
});

describe('embedUrlFor', () => {
	it('builds a youtube embed URL, with autoplay only when set', () => {
		const block = { provider: 'youtube' as const, url: 'https://youtu.be/dQw4w9WgXcQ', autoplay: false };
		expect(embedUrlFor(block)).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
		expect(embedUrlFor({ ...block, autoplay: true })).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1');
	});

	it('builds a vimeo embed URL', () => {
		const block = { provider: 'vimeo' as const, url: 'https://vimeo.com/76979871', autoplay: false };
		expect(embedUrlFor(block)).toBe('https://player.vimeo.com/video/76979871');
	});

	it('returns null for the upload provider or an unparseable id', () => {
		expect(embedUrlFor({ provider: 'upload', url: 'https://example.com/a.mp4', autoplay: false })).toBeNull();
		expect(embedUrlFor({ provider: 'youtube', url: 'https://youtube.com/not-a-real-path', autoplay: false })).toBeNull();
	});
});

describe('fetchOEmbed', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('throws for an unsupported provider without ever calling fetch', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		await expect(fetchOEmbed('https://example.com/video')).rejects.toThrow(/Only YouTube and Vimeo/);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('throws a clear error when the provider responds not-ok', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })
		);
		await expect(fetchOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).rejects.toThrow(/Could not find a video/);
	});

	it('throws a clear error when the response has no thumbnail_url', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ title: 'A video' }) })
		);
		await expect(fetchOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).rejects.toThrow(/did not return a thumbnail/);
	});

	it('resolves provider + thumbnailUrl on a well-formed response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' }) })
		);
		await expect(fetchOEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).resolves.toEqual({
			provider: 'youtube',
			thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
		});
	});
});

import type { VideoBlock } from '../types';

const YOUTUBE_HOST_PATTERN = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/;
const VIMEO_HOST_PATTERN = /(^|\.)vimeo\.com$/;

export function identifyProvider(url: string): 'youtube' | 'vimeo' | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (YOUTUBE_HOST_PATTERN.test(parsed.hostname)) return 'youtube';
	if (VIMEO_HOST_PATTERN.test(parsed.hostname)) return 'vimeo';
	return null;
}

// Matches watch?v=, youtu.be/, and /embed/ forms — YouTube ids are always 11
// URL-safe characters.
const YOUTUBE_ID_PATTERN = /(?:v=|youtu\.be\/|\/embed\/)([\w-]{11})/;
// Matches vimeo.com/123 and vimeo.com/video/123 — plain numeric ids.
const VIMEO_ID_PATTERN = /vimeo\.com\/(?:video\/)?(\d+)/;

export function extractYouTubeId(url: string): string | null {
	return YOUTUBE_ID_PATTERN.exec(url)?.[1] ?? null;
}

export function extractVimeoId(url: string): string | null {
	return VIMEO_ID_PATTERN.exec(url)?.[1] ?? null;
}

/**
 * The embeddable player URL for a block, derived at render time from its
 * `url`/`provider` rather than stored — one fewer piece of derived state to
 * keep in sync. Returns null for a URL this app can't parse an id out of
 * (malformed, or the `upload` provider, which has no player built) — callers
 * fall back to a plain link in that case rather than a broken iframe.
 */
export function embedUrlFor(block: Pick<VideoBlock, 'provider' | 'url' | 'autoplay'>): string | null {
	const autoplayParam = block.autoplay ? '?autoplay=1' : '';
	if (block.provider === 'youtube') {
		const id = extractYouTubeId(block.url);
		return id ? `https://www.youtube.com/embed/${id}${autoplayParam}` : null;
	}
	if (block.provider === 'vimeo') {
		const id = extractVimeoId(block.url);
		return id ? `https://player.vimeo.com/video/${id}${autoplayParam}` : null;
	}
	return null;
}

interface OEmbedResult {
	provider: 'youtube' | 'vimeo';
	thumbnailUrl: string;
}

/**
 * Fetched directly from the browser, no backend proxy — both YouTube's and
 * Vimeo's oEmbed endpoints send real CORS headers (verified against the live
 * endpoints; YouTube reflects the request's Origin, Vimeo sends `*`), so
 * there's nothing for a proxy to solve here. Revisit only if that ever
 * changes upstream.
 */
export async function fetchOEmbed(url: string): Promise<OEmbedResult> {
	const provider = identifyProvider(url);
	if (!provider) {
		throw new Error('Only YouTube and Vimeo links are supported right now');
	}

	const oembedEndpoint =
		provider === 'youtube'
			? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
			: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;

	let response: Response;
	try {
		response = await fetch(oembedEndpoint);
	} catch {
		throw new Error('Could not reach the video provider — check your connection and try again');
	}
	if (!response.ok) {
		throw new Error('Could not find a video at that URL');
	}

	const data: unknown = await response.json();
	const thumbnailUrl = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).thumbnail_url : undefined;
	if (typeof thumbnailUrl !== 'string') {
		throw new Error('The video provider did not return a thumbnail for that URL');
	}

	return { provider, thumbnailUrl };
}

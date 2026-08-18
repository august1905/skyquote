import { useState } from 'react';
import { setVideoAutoplay } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { VideoBlock } from '../types';
import type { BlockViewProps } from './types';
import { embedUrlFor } from './videoEmbed';
import './video.css';

/**
 * Built: paste a YouTube/Vimeo URL → oEmbed metadata + thumbnail (see
 * `insertable.ts`), click-to-play (swaps the thumbnail for a live embed
 * rather than loading an iframe for every video block up front), autoplay
 * toggle. `§4.5`'s "PDFs can't play video — export must degrade to
 * thumbnail + link" doesn't apply yet: there's no PDF export at all (phase
 * 4). Explicitly deferred: the `upload` provider (self-hosted video has no
 * storage or playback UI here), editing a block's URL after creation
 * (delete and re-add instead, same as Image).
 */
export function VideoBlockView({ pageId, block, selected }: BlockViewProps<VideoBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const [playing, setPlaying] = useState(false);
	const embedUrl = embedUrlFor(block);

	return (
		<div className="block-video-wrapper">
			{playing && embedUrl ? (
				<iframe
					className="block-video-embed"
					src={embedUrl}
					title="Video"
					allow="autoplay; fullscreen; picture-in-picture"
					allowFullScreen
				/>
			) : (
				<button
					type="button"
					className="block-video-thumbnail"
					// No stopPropagation here, deliberately — same convention as
					// TextBlockView's editor and TableBlockView's cells: clicking a
					// block's main content should still bubble up and select the
					// block (so its toolbar/controls appear), not just perform its
					// own action. Only the secondary controls below (autoplay
					// toggle) stop propagation, since those are only reachable once
					// already selected.
					onClick={() => {
						if (embedUrl) setPlaying(true);
					}}
					disabled={!embedUrl}
				>
					<img src={block.thumbnailUrl} alt="" />
					<span className="block-video-play-icon" aria-hidden="true">
						▶
					</span>
					{!embedUrl && <span className="block-video-fallback-label">Couldn&apos;t identify this video — open the link below</span>}
				</button>
			)}
			{selected && (
				<div className="block-video-controls" onClick={(e) => e.stopPropagation()}>
					<a href={block.url} target="_blank" rel="noreferrer" className="block-video-source-link">
						{block.url}
					</a>
					<label className="block-video-autoplay-toggle">
						<input
							type="checkbox"
							checked={block.autoplay}
							disabled={block.locked}
							onChange={(e) => runCommand(setVideoAutoplay(pageId, block.id, e.target.checked))}
						/>
						Autoplay
					</label>
				</div>
			)}
		</div>
	);
}

import type { PointerEvent as ReactPointerEvent } from 'react';
import { resolveAssetUrl } from '../../api/assets';
import { setImageAlt, setImageShape, setImageSize } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { ImageBlock } from '../types';
import type { BlockViewProps } from './types';
import './image.css';

// Page content is 816px wide minus 48px padding on each side (canvas.css) —
// 720px is the natural upper bound for an inline image.
const MIN_IMAGE_WIDTH = 40;
const MAX_IMAGE_WIDTH = 720;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/**
 * Built: upload (via `AddBlockMenu`'s file picker, see `insertable.ts`),
 * resize by a single bottom-right corner handle preserving aspect ratio,
 * `shape: circle` masking, required-feeling alt text. Explicitly deferred
 * (§4.5 lists these too, but each is its own UI lift): drag-drop upload,
 * insert-by-URL/library, `crop`, `link`, replacing an existing block's image,
 * and the 2× derivative — see BUILD_STATUS.md.
 */
export function ImageBlockView({ pageId, block, selected }: BlockViewProps<ImageBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);

	function handleResizePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
		e.stopPropagation();
		e.preventDefault();
		const handle = e.currentTarget;
		handle.setPointerCapture(e.pointerId);
		const startX = e.clientX;
		const startWidth = block.width;
		const aspectRatio = block.width / block.height;

		function handleMove(moveEvent: PointerEvent) {
			const nextWidth = clamp(startWidth + (moveEvent.clientX - startX), MIN_IMAGE_WIDTH, MAX_IMAGE_WIDTH);
			const nextHeight = Math.round(nextWidth / aspectRatio);
			runCommand(setImageSize(pageId, block.id, Math.round(nextWidth), nextHeight), { coalesceKey: `resize-${block.id}` });
		}
		function handleUp() {
			endCoalescing();
			handle.removeEventListener('pointermove', handleMove);
			handle.removeEventListener('pointerup', handleUp);
		}
		handle.addEventListener('pointermove', handleMove);
		handle.addEventListener('pointerup', handleUp);
	}

	const isCircle = block.shape === 'circle';
	// A circle mask needs a square frame to actually look circular — cropping
	// via object-fit: cover, rather than distorting a non-square image into
	// an ellipse.
	const frameWidth = isCircle ? Math.min(block.width, block.height) : block.width;
	const frameHeight = isCircle ? frameWidth : block.height;

	return (
		<div className="block-image-wrapper" style={{ width: frameWidth }}>
			<img
				src={resolveAssetUrl(block.url)}
				alt={block.alt}
				className={`block-image${isCircle ? ' block-image-circle' : ''}`}
				style={{ width: frameWidth, height: frameHeight }}
			/>
			{selected && !block.locked && (
				<button
					type="button"
					className="block-image-resize-handle"
					aria-label="Resize image"
					onPointerDown={handleResizePointerDown}
				/>
			)}
			{selected && (
				<div className="block-image-controls" onClick={(e) => e.stopPropagation()}>
					<input
						type="text"
						className="block-image-alt-input"
						placeholder="Alt text (required)"
						value={block.alt}
						disabled={block.locked}
						onChange={(e) => runCommand(setImageAlt(pageId, block.id, e.target.value), { coalesceKey: `alt-${block.id}` })}
						onBlur={endCoalescing}
					/>
					<label className="block-image-shape-toggle">
						<input
							type="checkbox"
							checked={isCircle}
							disabled={block.locked}
							onChange={(e) => runCommand(setImageShape(pageId, block.id, e.target.checked ? 'circle' : 'rect'))}
						/>
						Circle
					</label>
				</div>
			)}
		</div>
	);
}

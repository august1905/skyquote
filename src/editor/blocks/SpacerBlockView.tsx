import { useEditorStore } from '../store/editorStore';
import { clampSpacerHeight, setSpacerHeight, MAX_SPACER_HEIGHT, MIN_SPACER_HEIGHT } from '../commands';
import type { SpacerBlock } from '../types';
import type { BlockViewProps } from './types';
import './spacer.css';

/**
 * Deliberate empty space, and the one block whose editor appearance is meant to
 * differ from its output: here it shows a faint dashed outline so an author can
 * see and grab it, and in the recipient's view and the PDF it is nothing but
 * height. A spacer you can't see while authoring is a block you can't select,
 * resize or delete — and one that's visible in the sent document isn't a spacer.
 *
 * Two ways to set the height, because they answer different questions: drag the
 * bottom edge when the size is a judgement about how the page looks, type a
 * number when it has to match something. The drag coalesces into a single undo
 * step per gesture, the same way an image resize does.
 */
export function SpacerBlockView({ pageId, block, selected }: BlockViewProps<SpacerBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);

	function handleResizePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
		event.preventDefault();
		// Stops the click from also reaching the block wrapper's drag/selection
		// handling — dragging the handle is a resize, not a block move.
		event.stopPropagation();
		// A drag is its own undo step, never a continuation of whatever was open.
		// The height input closes its coalescing group on blur, and the
		// `preventDefault` above deliberately suppresses that blur — so typing 120
		// and then dragging to 180 merged into one command, and a single Undo threw
		// away both. Ending it here is what keeps the two edits separate.
		endCoalescing();
		const handle = event.currentTarget;
		handle.setPointerCapture(event.pointerId);
		const startY = event.clientY;
		const startHeight = block.height;

		function handleMove(moveEvent: PointerEvent) {
			const next = clampSpacerHeight(startHeight + (moveEvent.clientY - startY));
			runCommand(setSpacerHeight(pageId, block.id, next), { coalesceKey: `spacer-${block.id}` });
		}
		function handleUp() {
			endCoalescing();
			handle.removeEventListener('pointermove', handleMove);
			handle.removeEventListener('pointerup', handleUp);
		}
		handle.addEventListener('pointermove', handleMove);
		handle.addEventListener('pointerup', handleUp);
	}

	return (
		<div
			className={`block-spacer${selected ? ' block-spacer-selected' : ''}`}
			style={{ height: block.height }}
			data-block-id={block.id}
			// The height is the whole content of this block, so it's what a screen
			// reader is told rather than an empty region with a name and nothing in it.
			role="separator"
			aria-label={`Spacer, ${block.height}px`}
		>
			{selected && (
				<div className="block-spacer-controls" onClick={(e) => e.stopPropagation()}>
					<label className="block-spacer-height">
						<span>Height</span>
						<input
							type="number"
							min={MIN_SPACER_HEIGHT}
							max={MAX_SPACER_HEIGHT}
							value={block.height}
							aria-label="Spacer height"
							onChange={(e) => {
								const px = Number(e.target.value);
								if (Number.isFinite(px)) runCommand(setSpacerHeight(pageId, block.id, px), { coalesceKey: `spacer-${block.id}` });
							}}
							onBlur={endCoalescing}
						/>
						<span>px</span>
					</label>
				</div>
			)}
			{selected && !block.locked && (
				<button type="button" className="block-spacer-resize-handle" aria-label="Resize spacer" onPointerDown={handleResizePointerDown} />
			)}
		</div>
	);
}

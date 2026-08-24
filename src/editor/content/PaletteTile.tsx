import { useDraggable } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import type { PaletteDragData } from './palette';

interface PaletteTileProps {
	id: string;
	label: string;
	icon: string;
	/** dnd-kit payload — what `EditorDndProvider` turns into a block on drop. */
	drag: PaletteDragData;
	/** §4.1 path 2: the same tile, clicked instead of dragged. */
	onClick: () => void;
	/** Role tint for a field tile (§3 ④: "the tint of every field tile below reflects the selected role's color"). */
	tint?: string;
}

/**
 * One tile in §3 ④'s palette — a drag source (§4.1 path 1) **and** a button
 * (path 2), which is why it's a `<button>` with dnd-kit's listeners on it rather
 * than a div with a separate click affordance.
 *
 * Both gestures on one element works because the pointer sensor only activates a
 * drag after 8px of movement (see `EditorDndProvider`), so a click never
 * becomes a drag and a drag never fires the click. `touch-action: none` in the
 * CSS is what stops a touch drag from scrolling the panel instead.
 */
export function PaletteTile({ id, label, icon, drag, onClick, tint }: PaletteTileProps) {
	const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id, data: drag });

	// Tinted by the owning role rather than by field type: at a glance the
	// question a palette answers is "whose field is this", the same question
	// `FieldBlockView` answers with the same colour on the canvas.
	const style: CSSProperties = tint
		? { borderColor: tint, background: `color-mix(in srgb, ${tint} 10%, #fff)` }
		: {};

	return (
		<button
			type="button"
			ref={setNodeRef}
			className={`palette-tile${isDragging ? ' palette-tile-dragging' : ''}`}
			style={style}
			onClick={onClick}
			// Both gestures, spelled out — the tile looks like a button, and nothing
			// else on screen says it can be dragged.
			title={`${label} — click to insert, or drag onto a page`}
			{...attributes}
			{...listeners}
		>
			<span className="palette-tile-label">{label}</span>
			<span className="palette-tile-icon" aria-hidden="true">
				{icon}
			</span>
		</button>
	);
}

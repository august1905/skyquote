import { useRef, useState, type DragEvent } from 'react';
import { IMAGE_FILE_ACCEPT } from './imageLibrary';

interface ImageDropZoneProps {
	onFiles: (files: File[]) => void;
	/** Shrinks the zone for the picker modal, where the grid is the main event. */
	compact?: boolean;
	label?: string;
}

/**
 * Drag-and-drop plus click-to-browse upload target.
 *
 * The drag counter is the fiddly part and the reason this isn't inline: dragging
 * over a child element fires `dragleave` on the parent, so a naive
 * boolean flickers the highlight off and on as the pointer crosses the icon and
 * the text inside. Counting enter/leave pairs is what makes the highlight steady.
 */
export function ImageDropZone({ onFiles, compact = false, label = 'Drag images here, or browse' }: ImageDropZoneProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const dragDepth = useRef(0);
	const [dragging, setDragging] = useState(false);

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		dragDepth.current += 1;
		setDragging(true);
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		dragDepth.current -= 1;
		if (dragDepth.current <= 0) {
			dragDepth.current = 0;
			setDragging(false);
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragDepth.current = 0;
		setDragging(false);
		const files = Array.from(event.dataTransfer?.files ?? []);
		if (files.length > 0) onFiles(files);
	}

	return (
		<div
			className={`image-dropzone${compact ? ' image-dropzone-compact' : ''}${dragging ? ' image-dropzone-active' : ''}`}
			onDragEnter={handleDragEnter}
			onDragOver={(event) => event.preventDefault()}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<input
				ref={inputRef}
				type="file"
				className="image-dropzone-input"
				accept={IMAGE_FILE_ACCEPT}
				multiple
				aria-label="Upload images"
				onChange={(event) => {
					const files = Array.from(event.target.files ?? []);
					// Reset so picking the same file twice in a row still fires onChange.
					event.target.value = '';
					if (files.length > 0) onFiles(files);
				}}
			/>
			<span className="image-dropzone-icon" aria-hidden="true">
				🖼
			</span>
			<span className="image-dropzone-label">{label}</span>
			<button type="button" className="image-dropzone-browse" onClick={() => inputRef.current?.click()}>
				Choose files
			</button>
			<span className="image-dropzone-hint">PNG, JPEG, GIF or WEBP · up to 5MB each</span>
		</div>
	);
}

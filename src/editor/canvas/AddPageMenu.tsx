import { useEffect, useRef, useState } from 'react';
import { addPage, createBlankPage } from '../commands';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { useEditorStore } from '../store/editorStore';
import { ImageLibraryPicker } from '../../images/ImageLibraryPicker';
import { assetFileRelativePath } from '../../api/assets';
import './canvas.css';

interface AddPageMenuProps {
	/** Where the new page goes in `body.pages`. */
	insertAtIndex: number;
	/** Distinguishes "insert a page after this one" from the canvas's trailing "add a page at the end". */
	label: string;
	/** The trailing control is a wide bar under the last page rather than a small `+` in a page's header row. */
	variant: 'inline' | 'trailing';
}

/**
 * §3 ⑤'s page `+`.
 *
 * It used to insert a blank page immediately. It now asks what kind, because
 * the second option — a page whose background is an image from the library — is
 * how a branded cover or back page actually gets made, and there was previously
 * no way to build one at all: `Page.background.imageUrl` has been in the model
 * since phase 1 with nothing able to set it.
 *
 * The picker is deliberately the same `ImageLibraryPicker` the Image block uses.
 * A page background is a library image like any other, and a second, subtly
 * different way to choose one would be a second thing to keep in step.
 */
export function AddPageMenu({ insertAtIndex, label, variant }: AddPageMenuProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const [open, setOpen] = useState(false);
	const [pickingImage, setPickingImage] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useCloseOnEscape(open, () => setOpen(false));

	useEffect(() => {
		if (!open) return;
		function handleOutsideClick(event: MouseEvent) {
			if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
		}
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [open]);

	function addBlankPage() {
		runCommand(addPage(insertAtIndex, createBlankPage('Untitled page')));
		setOpen(false);
	}

	return (
		<div className={`add-page-menu add-page-menu-${variant}`} ref={containerRef}>
			<button
				type="button"
				className={variant === 'trailing' ? 'canvas-add-page-trailing' : 'canvas-page-insert'}
				aria-label={label}
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<span aria-hidden="true">+</span>
				{variant === 'trailing' && <span className="canvas-add-page-trailing-label">Add page</span>}
			</button>

			{open && (
				<div className="add-page-options" role="menu">
					<button type="button" role="menuitem" onClick={addBlankPage}>
						<span className="add-page-option-icon" aria-hidden="true">
							🗋
						</span>
						<span>
							<strong>Blank page</strong>
							<small>An empty page, ready to add blocks to</small>
						</span>
					</button>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							setOpen(false);
							setPickingImage(true);
						}}
					>
						<span className="add-page-option-icon" aria-hidden="true">
							🖼
						</span>
						<span>
							<strong>Image background</strong>
							<small>A page backed by a full-bleed image from your library</small>
						</span>
					</button>
				</div>
			)}

			{pickingImage && (
				<ImageLibraryPicker
					onPick={(asset) => {
						setPickingImage(false);
						const page = createBlankPage('Untitled page');
						// `assetId` alongside the URL so a recipient's view and the PDF can
						// rebuild a URL that works for them — see `Page.background`.
						page.background = { imageUrl: assetFileRelativePath(asset.id), assetId: asset.id };
						runCommand(addPage(insertAtIndex, page));
					}}
					onClose={() => setPickingImage(false)}
				/>
			)}
		</div>
	);
}

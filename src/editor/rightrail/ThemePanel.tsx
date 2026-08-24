import { useState } from 'react';
import { defaultTheme, setTheme } from '../commands';
import { ImageLibraryPicker } from '../../images/ImageLibraryPicker';
import { assetFileRelativePath, resolveAssetUrl } from '../../api/assets';
import { useEditorStore } from '../store/editorStore';
import type { Theme } from '../types';
import './rightrail.css';

interface ThemePanelProps {
	onClose: () => void;
}

/**
 * §3's Theme panel: "Fonts, color palette, heading styles, spacing, page
 * background. Applies template-wide." — the fields here are exactly that
 * subset of `Theme`, no more. Edits go through `setTheme` (undoable, same
 * as everything else) and reach the canvas via CSS custom properties set
 * once in `TemplateCanvas` — see canvas.css.
 */
export function ThemePanel({ onClose }: ThemePanelProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const [pickingImage, setPickingImage] = useState(false);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const theme = useEditorStore((s) => s.body?.settings.theme ?? defaultTheme());

	function update(patch: Partial<Theme>, options?: { coalesceKey?: string }) {
		runCommand(setTheme({ ...theme, ...patch }), options);
	}

	return (
		<div className="theme-panel">
			<div className="theme-panel-header">
				<h2>Theme</h2>
				<button type="button" aria-label="Close theme panel" onClick={onClose}>
					×
				</button>
			</div>
			<label className="theme-panel-row">
				<span>Heading font</span>
				<input
					type="text"
					value={theme.headingFont}
					onChange={(e) => update({ headingFont: e.target.value }, { coalesceKey: 'theme-heading-font' })}
					onBlur={endCoalescing}
				/>
			</label>
			<label className="theme-panel-row">
				<span>Body font</span>
				<input
					type="text"
					value={theme.bodyFont}
					onChange={(e) => update({ bodyFont: e.target.value }, { coalesceKey: 'theme-body-font' })}
					onBlur={endCoalescing}
				/>
			</label>
			<label className="theme-panel-row">
				<span>Heading color</span>
				<input type="color" value={theme.primaryColor} onChange={(e) => update({ primaryColor: e.target.value })} />
			</label>
			<label className="theme-panel-row">
				<span>Text color</span>
				<input type="color" value={theme.textColor} onChange={(e) => update({ textColor: e.target.value })} />
			</label>
			<label className="theme-panel-row">
				<span>Page background</span>
				<input type="color" value={theme.pageBackgroundColor} onChange={(e) => update({ pageBackgroundColor: e.target.value })} />
			</label>
			{/* The template-wide default image. A page that sets its own background
			    image still wins — see canvas.css's fallback chain — so this is the
			    branded sheet for the whole document, not a fourth thing to keep in
			    step per page. */}
			<div className="theme-panel-row theme-panel-row-stacked">
				<span>Default page image</span>
				<div className="theme-panel-image-actions">
					<button type="button" onClick={() => setPickingImage(true)}>
						{theme.pageBackgroundImageUrl ? 'Replace' : 'Choose image'}
					</button>
					{theme.pageBackgroundImageUrl && (
						<button
							type="button"
							onClick={() => {
								// Both keys deleted rather than set to undefined: this object is
								// serialised into the template body, and an id pointing at an
								// image nothing renders is just a stale reference to carry around.
								const next = { ...theme };
								delete next.pageBackgroundImageUrl;
								delete next.pageBackgroundAssetId;
								runCommand(setTheme(next));
							}}
						>
							Remove
						</button>
					)}
				</div>
			</div>
			{theme.pageBackgroundImageUrl && (
				<div
					className="theme-panel-image-preview"
					// Resolved, not the stored path: `/assets/:id/file` is relative to the
					// backend, and dropped into `url(...)` it would be fetched from the
					// frontend origin instead — see `editorPageBackgroundStyle`.
					style={{ backgroundImage: `url(${resolveAssetUrl(theme.pageBackgroundImageUrl)})` }}
					role="img"
					aria-label="Current default page background"
				/>
			)}
			<label className="theme-panel-row">
				<span>Block spacing (px)</span>
				<input
					type="number"
					min={0}
					value={theme.baseSpacing}
					onChange={(e) => {
						const px = Number(e.target.value);
						if (Number.isFinite(px)) update({ baseSpacing: px }, { coalesceKey: 'theme-spacing' });
					}}
					onBlur={endCoalescing}
				/>
			</label>
			{pickingImage && (
				<ImageLibraryPicker
					onPick={(asset) => {
						setPickingImage(false);
						update({ pageBackgroundImageUrl: assetFileRelativePath(asset.id), pageBackgroundAssetId: asset.id });
					}}
					onClose={() => setPickingImage(false)}
				/>
			)}
		</div>
	);
}

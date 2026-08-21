import { useEffect, useRef } from 'react';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { setPageSettings } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { PageSettingsPatch } from '../commands';
import './pageSettingsPanel.css';

interface PageSettingsPanelProps {
	onClose: () => void;
}

/**
 * §3's header "⋮ overflow → Settings" item — scoped down to just page
 * settings (size/orientation/margins/page numbers), the subset §10's
 * pagination pass actually needs. The other overflow items (Duplicate,
 * Rename, Move, Export PDF, Version history, Delete) aren't built: Export
 * PDF is deferred alongside real pagination per Grayson's own call,
 * Duplicate/Rename/Move belong to the Templates list screen (still a
 * placeholder), Version history has no scoping yet — same "ship the real
 * minimal slice, document the rest" pattern the Theme panel's own comment
 * used for the right rail.
 *
 * Margins are a single uniform number, same simplification
 * `BlockSettingsPopover` already makes for padding/margin — the data model
 * still stores a full `Spacing`, just with all four sides set equally.
 */
export function PageSettingsPanel({ onClose }: PageSettingsPanelProps) {
	useCloseOnEscape(true, onClose);
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const settings = useEditorStore((s) => s.body?.settings);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleOutsideClick(event: MouseEvent) {
			if (!containerRef.current?.contains(event.target as Node)) onClose();
		}
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [onClose]);

	if (!settings) return null;

	function update(patch: PageSettingsPatch, options?: { coalesceKey?: string }) {
		runCommand(setPageSettings(patch), options);
	}

	const marginValue = settings.margins.top;

	return (
		<div className="page-settings-panel" ref={containerRef} onClick={(e) => e.stopPropagation()}>
			<div className="page-settings-panel-header">
				<h2>Page settings</h2>
				<button type="button" aria-label="Close page settings" onClick={onClose}>
					×
				</button>
			</div>
			<label className="page-settings-panel-row">
				<span>Page size</span>
				<select value={settings.pageSize} onChange={(e) => update({ pageSize: e.target.value as typeof settings.pageSize })}>
					<option value="LETTER">Letter</option>
					<option value="A4">A4</option>
				</select>
			</label>
			<label className="page-settings-panel-row">
				<span>Orientation</span>
				<select value={settings.orientation} onChange={(e) => update({ orientation: e.target.value as typeof settings.orientation })}>
					<option value="portrait">Portrait</option>
					<option value="landscape">Landscape</option>
				</select>
			</label>
			<label className="page-settings-panel-row">
				<span>Margins (px)</span>
				<input
					type="number"
					min={0}
					value={marginValue}
					onChange={(e) => {
						const px = Number(e.target.value);
						if (Number.isFinite(px) && px >= 0) update({ margins: { top: px, right: px, bottom: px, left: px } }, { coalesceKey: 'page-margins' });
					}}
					onBlur={endCoalescing}
				/>
			</label>
			<label className="page-settings-panel-row">
				<span>Page numbers</span>
				<input type="checkbox" checked={settings.showPageNumbers} onChange={(e) => update({ showPageNumbers: e.target.checked })} />
			</label>
		</div>
	);
}

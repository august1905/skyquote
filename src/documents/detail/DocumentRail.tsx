import type { ReactNode } from 'react';
import './documentRail.css';

export type DocumentRailPanelKey = 'recipients' | 'audit';

/** Real SVG glyphs, not emoji — the brand system's icon rule (Skyline uses line icons everywhere; emoji are not used in brand surfaces). */
function RecipientsIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<circle cx="9" cy="8" r="3.2" />
			<path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
			<circle cx="16.8" cy="9.4" r="2.4" />
			<path d="M15.4 14.6c2.4.1 4.3 1.5 5 4" />
		</svg>
	);
}

function AuditIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<circle cx="5" cy="6" r="1.4" fill="currentColor" stroke="none" />
			<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
			<circle cx="5" cy="18" r="1.4" fill="currentColor" stroke="none" />
			<path d="M10 6h9M10 12h9M10 18h9" />
		</svg>
	);
}

const RAIL_ITEMS: Array<{ key: DocumentRailPanelKey; label: string; icon: ReactNode }> = [
	{ key: 'recipients', label: 'Recipients', icon: <RecipientsIcon /> },
	{ key: 'audit', label: 'Audit trail', icon: <AuditIcon /> },
];

interface DocumentRailProps {
	openPanel: DocumentRailPanelKey | null;
	onToggle: (panel: DocumentRailPanelKey) => void;
	/** The open panel's content, rendered beside the icon strip — the same panel-left-of-icons order the editor's RightRail established. */
	children: ReactNode;
}

/**
 * The internal document viewer's side tab rail — the PandaDoc pattern the
 * template editor's RightRail already follows, rebuilt small here rather
 * than reused from `editor/` because that one is wired into the editor's
 * Zustand store (open-panel state, Escape stack) and this page has neither.
 */
export function DocumentRail({ openPanel, onToggle, children }: DocumentRailProps) {
	return (
		<div className="document-rail-wrapper">
			{children}
			<div className="document-rail" role="tablist" aria-label="Document panels">
				{RAIL_ITEMS.map((item) => (
					<button
						key={item.key}
						type="button"
						role="tab"
						aria-selected={openPanel === item.key}
						aria-label={item.label}
						title={item.label}
						className={openPanel === item.key ? 'document-rail-icon document-rail-icon-active' : 'document-rail-icon'}
						onClick={() => onToggle(item.key)}
					>
						{item.icon}
					</button>
				))}
			</div>
		</div>
	);
}

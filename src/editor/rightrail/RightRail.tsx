import { useCallback, useState } from 'react';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { ThemePanel } from './ThemePanel';
import { RolesPanel } from './RolesPanel';
import { VariablesPanel } from './VariablesPanel';
import { CatalogPanel } from '../catalog/CatalogPanel';
import { ContentLibraryPanel } from '../contentLibrary/ContentLibraryPanel';
import { AttachmentsPanel } from './AttachmentsPanel';
import './rightrail.css';

/**
 * §3's right rail (③) toggles one of ten panels in region ④. Theme,
 * Recipients/Roles, Variables, Catalog/Pricing, Content Library and
 * Attachments are built.
 *
 * The three that remain — Approval workflow, Automations, Integrations — are
 * **not being built**, per Grayson (2026-08-21): they wait until the spec is
 * finished and the app is stable. The spec gives each of them a single line, so
 * building them now would mean inventing the product rather than implementing
 * it. Rendering placeholder icons would be worse than their absence: an icon
 * implies something is behind it. `Content` is deliberately absent too — the
 * canvas's own "+ Add block" menu already covers it.
 */
const RAIL_ITEMS = [
	{ key: 'roles', icon: '👥', label: 'Recipients / Roles' },
	{ key: 'variables', icon: '⧉', label: 'Variables' },
	{ key: 'catalog', icon: '💲', label: 'Catalog / Pricing' },
	{ key: 'contentLibrary', icon: '🗄', label: 'Content Library' },
	{ key: 'attachments', icon: '📎', label: 'Attachments' },
	{ key: 'theme', icon: '🎨', label: 'Theme' },
] as const;

type RailKey = (typeof RAIL_ITEMS)[number]['key'];

export function RightRail() {
	const [openPanel, setOpenPanel] = useState<RailKey | null>(null);

	// §13's keyboard operability: Escape closes whichever panel is open. Owned
	// here rather than in each panel because this is where the open state lives
	// — five panels, one handler.
	const closePanel = useCallback(() => setOpenPanel(null), []);
	useCloseOnEscape(openPanel !== null, closePanel);

	return (
		<div className="right-rail-wrapper">
			{openPanel === 'roles' && <RolesPanel onClose={() => setOpenPanel(null)} />}
			{openPanel === 'variables' && <VariablesPanel onClose={() => setOpenPanel(null)} />}
			{openPanel === 'catalog' && <CatalogPanel onClose={() => setOpenPanel(null)} />}
			{openPanel === 'contentLibrary' && <ContentLibraryPanel onClose={() => setOpenPanel(null)} />}
			{openPanel === 'attachments' && <AttachmentsPanel onClose={() => setOpenPanel(null)} />}
			{openPanel === 'theme' && <ThemePanel onClose={() => setOpenPanel(null)} />}
			<div className="right-rail">
				{RAIL_ITEMS.map((item) => (
					<button
						key={item.key}
						type="button"
						className={`right-rail-icon${openPanel === item.key ? ' right-rail-icon-active' : ''}`}
						aria-label={item.label}
						aria-pressed={openPanel === item.key}
						onClick={() => setOpenPanel((current) => (current === item.key ? null : item.key))}
					>
						{item.icon}
					</button>
				))}
			</div>
		</div>
	);
}

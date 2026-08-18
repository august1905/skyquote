import { useState } from 'react';
import { ThemePanel } from './ThemePanel';
import { RolesPanel } from './RolesPanel';
import './rightrail.css';

/**
 * §3's right rail (③) toggles one of ten panels in region ④. Theme and
 * Recipients/Roles are built — the rest (Content, Variables, Content
 * Library, Approval workflow, Attachments, Automations, Catalog/Pricing,
 * Integrations) either belong to a later phase outright (Variables needs the
 * rest of phase 3's field work still in progress; Approval/Automations/
 * Integrations are explicitly phase 5; Catalog is phase 4) or are already
 * functionally covered by something smaller (Content, by the canvas's own
 * "+ Add block" menu). Rendering placeholder icons for those now would be UI
 * scaffolding with nothing real behind it — deliberately not built rather
 * than a silent gap; extend `RAIL_ITEMS` as each one's real panel lands.
 */
const RAIL_ITEMS = [
	{ key: 'roles', icon: '👥', label: 'Recipients / Roles' },
	{ key: 'theme', icon: '🎨', label: 'Theme' },
] as const;

type RailKey = (typeof RAIL_ITEMS)[number]['key'];

export function RightRail() {
	const [openPanel, setOpenPanel] = useState<RailKey | null>(null);

	return (
		<div className="right-rail-wrapper">
			{openPanel === 'roles' && <RolesPanel onClose={() => setOpenPanel(null)} />}
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

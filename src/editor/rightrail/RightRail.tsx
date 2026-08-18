import { useState } from 'react';
import { ThemePanel } from './ThemePanel';
import { RolesPanel } from './RolesPanel';
import { VariablesPanel } from './VariablesPanel';
import './rightrail.css';

/**
 * §3's right rail (③) toggles one of ten panels in region ④. Theme,
 * Recipients/Roles, and Variables are built — the rest (Content, Content
 * Library, Approval workflow, Attachments, Automations, Catalog/Pricing,
 * Integrations) either belong to a later phase outright (Approval/
 * Automations/Integrations are explicitly phase 5; Catalog is phase 4) or
 * are already functionally covered by something smaller (Content, by the
 * canvas's own "+ Add block" menu). Rendering placeholder icons for those
 * now would be UI scaffolding with nothing real behind it — deliberately
 * not built rather than a silent gap; extend `RAIL_ITEMS` as each one's real
 * panel lands.
 */
const RAIL_ITEMS = [
	{ key: 'roles', icon: '👥', label: 'Recipients / Roles' },
	{ key: 'variables', icon: '⧉', label: 'Variables' },
	{ key: 'theme', icon: '🎨', label: 'Theme' },
] as const;

type RailKey = (typeof RAIL_ITEMS)[number]['key'];

export function RightRail() {
	const [openPanel, setOpenPanel] = useState<RailKey | null>(null);

	return (
		<div className="right-rail-wrapper">
			{openPanel === 'roles' && <RolesPanel onClose={() => setOpenPanel(null)} />}
			{openPanel === 'variables' && <VariablesPanel onClose={() => setOpenPanel(null)} />}
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

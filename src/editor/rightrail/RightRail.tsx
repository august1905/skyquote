import { useCallback } from 'react';
import { useCloseOnEscape } from '../a11y/useCloseOnEscape';
import { useEditorStore } from '../store/editorStore';
import { ContentPanel } from '../content/ContentPanel';
import { ThemePanel } from './ThemePanel';
import { RolesPanel } from './RolesPanel';
import { VariablesPanel } from './VariablesPanel';
import { CatalogPanel } from '../catalog/CatalogPanel';
import { ContentLibraryPanel } from '../contentLibrary/ContentLibraryPanel';
import { AttachmentsPanel } from './AttachmentsPanel';
import { LibraryIcon, PaletteIcon, PaperclipIcon, PeopleIcon, PricingIcon, VariablesIcon } from '../../components/icons';
import './rightrail.css';

/**
 * §3's right rail (③) toggles one of ten panels in region ④. Content, Theme,
 * Recipients/Roles, Variables, Catalog/Pricing, Content Library and
 * Attachments are built.
 *
 * The three that remain — Approval workflow, Automations, Integrations — are
 * **not being built**, per Grayson (2026-08-21): they wait until the spec is
 * finished and the app is stable. The spec gives each of them a single line, so
 * building them now would mean inventing the product rather than implementing
 * it. Rendering placeholder icons would be worse than their absence: an icon
 * implies something is behind it.
 */
const RAIL_ITEMS = [
	// First and visually distinct (see `.right-rail-icon-primary`), matching §3's
	// own ordering and the reference product: it's the panel an author reaches for
	// most, and §4.1's drag-a-tile-onto-the-page starts here.
	// Line-icon SVGs, not emoji — the brand system's iconography rule.
	{ key: 'content', icon: '＋', label: 'Content' },
	{ key: 'roles', icon: <PeopleIcon />, label: 'Recipients / Roles' },
	{ key: 'variables', icon: <VariablesIcon />, label: 'Variables' },
	{ key: 'catalog', icon: <PricingIcon />, label: 'Catalog / Pricing' },
	{ key: 'contentLibrary', icon: <LibraryIcon />, label: 'Content Library' },
	{ key: 'attachments', icon: <PaperclipIcon />, label: 'Attachments' },
	{ key: 'theme', icon: <PaletteIcon />, label: 'Theme' },
] as const;

// No local key type: the open state lives in the store, and `setOpenRailPanel`'s
// own parameter type is what keeps these two lists from drifting — adding a rail
// item whose key the store doesn't know is a compile error at the call site below.

export function RightRail() {
	// The open panel lives in the store, not here: §3's header "Manage" button
	// opens the Roles panel too — see editorStore.ts's `openRailPanel`.
	const openPanel = useEditorStore((s) => s.openRailPanel);
	const setOpenPanel = useEditorStore((s) => s.setOpenRailPanel);

	// §13's keyboard operability: Escape closes whichever panel is open. Owned
	// here rather than in each panel because this is where the open state is
	// read — six panels, one handler.
	const closePanel = useCallback(() => setOpenPanel(null), [setOpenPanel]);
	useCloseOnEscape(openPanel !== null, closePanel);

	return (
		<div className="right-rail-wrapper">
			{openPanel === 'content' && <ContentPanel onClose={() => setOpenPanel(null)} />}
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
						className={`right-rail-icon${item.key === 'content' ? ' right-rail-icon-primary' : ''}${openPanel === item.key ? ' right-rail-icon-active' : ''}`}
						aria-label={item.label}
						aria-pressed={openPanel === item.key}
						onClick={() => setOpenPanel(openPanel === item.key ? null : item.key)}
					>
						{item.icon}
					</button>
				))}
			</div>
		</div>
	);
}

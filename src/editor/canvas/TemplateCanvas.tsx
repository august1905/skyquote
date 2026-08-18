import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import { containerBlocksOf, defaultTheme, moveBlock, type BlockContainer } from '../commands';
import { useEditorStore } from '../store/editorStore';
import type { Theme } from '../types';
import { PageFrame } from './PageFrame';
import './canvas.css';

/**
 * The Theme panel's values reach every page/block through these CSS custom
 * properties, set once here rather than threaded as props through every
 * block view — §3's Theme "applies template-wide", so one place setting
 * them for the whole canvas is the right shape, and canvas.css's `var(...,
 * fallback)` pattern means nothing breaks for content that doesn't
 * reference a given property.
 */
function themeCssVars(theme: Theme): CSSProperties {
	return {
		'--theme-heading-font': theme.headingFont,
		'--theme-body-font': theme.bodyFont,
		'--theme-primary-color': theme.primaryColor,
		'--theme-text-color': theme.textColor,
		'--theme-page-background': theme.pageBackgroundColor,
		'--theme-spacing': `${theme.baseSpacing}px`,
	} as CSSProperties;
}

/**
 * Same page top level, or the exact same column — reorder, already wired.
 * Different pages at the top level — cross-page move, already wired (pre-
 * dates Columns). A page's top level <-> a column, or column <-> a different
 * column — cross-container drops aren't wired yet; §4.4's validity rules
 * (e.g. rejecting a dropped container block) need dedicated handling first,
 * so those drags just snap back for now.
 */
function isCompatibleDropTarget(from: BlockContainer, to: BlockContainer): boolean {
	if (!from.parent && !to.parent) return true;
	if (from.parent && to.parent) {
		return from.pageId === to.pageId && from.parent.columnsBlockId === to.parent.columnsBlockId && from.parent.column === to.parent.column;
	}
	return false;
}

export function TemplateCanvas() {
	const pages = useEditorStore((s) => s.body?.pages ?? []);
	const theme = useEditorStore((s) => s.body?.settings.theme ?? defaultTheme());
	const selection = useEditorStore((s) => s.selection);
	const runCommand = useEditorStore((s) => s.runCommand);

	// A small activation distance so a plain click (to select a block, or
	// place a cursor in it) doesn't get eaten as a drag start — only the
	// handle button has `listeners` attached, but the distance threshold is
	// still worth keeping so an accidental tiny mouse move while clicking it
	// doesn't immediately count as "dragging".
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

	function handleDragEnd({ active, over }: DragEndEvent) {
		if (!over || active.id === over.id) return;

		// Each SortableBlock carries its BlockContainer as sortable `data` (see
		// SortableBlock.tsx) precisely so drops can be resolved across pages
		// and columns, not just within one flat list — dnd-kit's `id`s are
		// opaque `UniqueIdentifier`s (string | number), here always strings,
		// since block ids are.
		const fromContainer = active.data.current?.container as BlockContainer | undefined;
		const toContainer = over.data.current?.container as BlockContainer | undefined;
		if (!fromContainer || !toContainer) return;
		if (!isCompatibleDropTarget(fromContainer, toContainer)) return;

		const toBlocks = containerBlocksOf(pages, toContainer);
		const toIndex = toBlocks?.findIndex((b) => b.id === over.id) ?? -1;
		// Dropping on empty space rather than another block (e.g. an empty
		// page or column) isn't resolvable to an index yet — a known gap, not
		// a silent failure: the drag just snaps back.
		if (toIndex === -1) return;

		runCommand(moveBlock(fromContainer.pageId, active.id as string, toContainer, toIndex));
	}

	return (
		<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
			<div className="canvas" style={themeCssVars(theme)}>
				{pages.map((page) => (
					<PageFrame key={page.id} page={page} selectedBlockId={selection?.pageId === page.id ? selection.blockId : null} />
				))}
			</div>
		</DndContext>
	);
}

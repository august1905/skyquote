import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { moveBlock } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { PageFrame } from './PageFrame';
import './canvas.css';

export function TemplateCanvas() {
	const pages = useEditorStore((s) => s.body?.pages ?? []);
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

		// Each SortableBlock carries its page id as sortable `data` (see
		// SortableBlock.tsx) precisely so drops can be resolved across pages,
		// not just within one — dnd-kit's `id`s are opaque `UniqueIdentifier`s
		// (string | number) here always strings, since block ids are.
		const fromPageId = active.data.current?.pageId as string | undefined;
		const toPageId = over.data.current?.pageId as string | undefined;
		if (!fromPageId || !toPageId) return;

		const toPage = pages.find((p) => p.id === toPageId);
		const toIndex = toPage?.blocks.findIndex((b) => b.id === over.id) ?? -1;
		// Dropping on empty space rather than another block (e.g. an empty
		// page) isn't resolvable to an index yet — a known phase 1 gap, not
		// a silent failure: the drag just snaps back.
		if (toIndex === -1) return;

		runCommand(moveBlock(fromPageId, active.id as string, toPageId, toIndex));
	}

	return (
		<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
			<div className="canvas">
				{pages.map((page) => (
					<PageFrame key={page.id} page={page} selectedBlockId={selection?.pageId === page.id ? selection.blockId : null} />
				))}
			</div>
		</DndContext>
	);
}

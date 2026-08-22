import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from './editorStore';
import { insertBlock } from '../commands/blockCommands';
import { renamePage } from '../commands/pageCommands';
import { makeBody, makeTextBlock } from '../commands/testFixtures';
import type { TemplateMeta } from '../types';
import { money } from '../types';

function makeMeta(overrides: Partial<TemplateMeta> = {}): TemplateMeta {
	return {
		id: 'template-1',
		name: 'Untitled template',
		folderId: null,
		themeId: null,
		status: 'draft',
		stratusPath: 'templates/test/body.json',
		currency: 'USD',
		computedTotal: money(0),
		version: 1,
		createdBy: 'user-1',
		updatedBy: 'user-1',
		createdAt: '2026-08-15T00:00:00.000Z',
		updatedAt: '2026-08-15T00:00:00.000Z',
		...overrides,
	};
}

beforeEach(() => {
	useEditorStore.getState().loadTemplate(makeMeta(), makeBody());
	vi.useRealTimers();
});

describe('loadTemplate', () => {
	it('resets selection, dirty, and both stacks', () => {
		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('x')));
		expect(useEditorStore.getState().undoStack).toHaveLength(1);

		useEditorStore.getState().loadTemplate(makeMeta(), makeBody());

		const state = useEditorStore.getState();
		expect(state.dirty).toBe(false);
		expect(state.selection).toBeNull();
		expect(state.undoStack).toHaveLength(0);
		expect(state.redoStack).toHaveLength(0);
	});

	it('backfills a default theme for a body written before Theme existed, without touching one that already has it', () => {
		const bodyWithoutTheme = makeBody();
		// @ts-expect-error — simulating a real pre-existing Stratus body that
		// predates this field; TS itself would never let new code omit it.
		delete bodyWithoutTheme.settings.theme;

		useEditorStore.getState().loadTemplate(makeMeta(), bodyWithoutTheme);
		expect(useEditorStore.getState().body?.settings.theme).toBeDefined();

		const bodyWithCustomTheme = makeBody();
		bodyWithCustomTheme.settings.theme = { ...bodyWithCustomTheme.settings.theme, primaryColor: '#123456' };
		useEditorStore.getState().loadTemplate(makeMeta(), bodyWithCustomTheme);
		expect(useEditorStore.getState().body?.settings.theme.primaryColor).toBe('#123456');
	});

	it('backfills default page settings field-by-field for a body missing one or more of them, without touching real values already present', () => {
		const bodyMissingSome = makeBody();
		// @ts-expect-error — simulating a real pre-existing Stratus body missing
		// only some page-settings fields; TS itself would never let new code
		// omit them.
		delete bodyMissingSome.settings.orientation;
		// @ts-expect-error — see above.
		delete bodyMissingSome.settings.margins;
		bodyMissingSome.settings.pageSize = 'A4'; // a real, present value — must survive backfill untouched

		useEditorStore.getState().loadTemplate(makeMeta(), bodyMissingSome);
		const settings = useEditorStore.getState().body!.settings;
		expect(settings.pageSize).toBe('A4');
		expect(settings.orientation).toBe('portrait');
		expect(settings.margins).toEqual({ top: 96, right: 96, bottom: 96, left: 96 });
	});
});

describe('runCommand / undo / redo', () => {
	it('runs a command, marks dirty, and pushes exactly one undo entry', () => {
		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('x')));

		const state = useEditorStore.getState();
		expect(state.dirty).toBe(true);
		expect(state.undoStack).toHaveLength(1);
		expect(state.body?.pages[0]?.blocks.map((b) => b.id)).toEqual(['x', 'block-1', 'block-2']);
	});

	it('undo restores the prior state and moves the command to redoStack', () => {
		const before = useEditorStore.getState().body;
		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('x')));

		useEditorStore.getState().undo();

		const state = useEditorStore.getState();
		expect(state.body).toEqual(before);
		expect(state.undoStack).toHaveLength(0);
		expect(state.redoStack).toHaveLength(1);
	});

	it('redo re-applies the command and moves it back to undoStack', () => {
		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('x')));
		const afterRun = useEditorStore.getState().body;
		useEditorStore.getState().undo();

		useEditorStore.getState().redo();

		const state = useEditorStore.getState();
		expect(state.body).toEqual(afterRun);
		expect(state.undoStack).toHaveLength(1);
		expect(state.redoStack).toHaveLength(0);
	});

	it('a new command after undo clears the redo stack — redo only makes sense with nothing done since', () => {
		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('x')));
		useEditorStore.getState().undo();
		expect(useEditorStore.getState().redoStack).toHaveLength(1);

		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('y')));

		expect(useEditorStore.getState().redoStack).toHaveLength(0);
	});

	it('undo/redo on an empty stack is a harmless no-op', () => {
		const before = useEditorStore.getState().body;
		useEditorStore.getState().undo();
		useEditorStore.getState().redo();
		expect(useEditorStore.getState().body).toEqual(before);
	});

	it('caps the undo stack at 100 entries — the oldest command falls off, not the newest', () => {
		// One marker command before the cap is exceeded; it should be
		// unrecoverable once more than 100 commands have run after it.
		useEditorStore.getState().runCommand(renamePage('page-1', 'marker'));
		for (let i = 0; i < 100; i++) {
			useEditorStore.getState().runCommand(renamePage('page-1', `name-${i}`));
		}

		const state = useEditorStore.getState();
		expect(state.undoStack).toHaveLength(100);

		// Undo everything available; the name from before the marker command
		// ("Page 1", the fixture's original) must NOT be reachable — that
		// command was pushed off the front of the stack.
		while (useEditorStore.getState().undoStack.length > 0) {
			useEditorStore.getState().undo();
		}
		expect(useEditorStore.getState().body?.pages[0]?.name).toBe('marker');
	});
});

describe('editSeq', () => {
	it('increments on runCommand, undo, and redo — including coalesced commands', () => {
		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('x')));
		expect(useEditorStore.getState().editSeq).toBe(1);

		useEditorStore.getState().runCommand(renamePage('page-1', 'a'), { coalesceKey: 'name' });
		useEditorStore.getState().runCommand(renamePage('page-1', 'ab'), { coalesceKey: 'name' });
		expect(useEditorStore.getState().editSeq).toBe(3);

		useEditorStore.getState().undo();
		expect(useEditorStore.getState().editSeq).toBe(4);

		useEditorStore.getState().redo();
		expect(useEditorStore.getState().editSeq).toBe(5);
	});

	it('resets to 0 on loadTemplate', () => {
		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('x')));
		useEditorStore.getState().loadTemplate(makeMeta(), makeBody());
		expect(useEditorStore.getState().editSeq).toBe(0);
	});
});

describe('advanceSavedMeta', () => {
	it('updates meta but leaves dirty untouched, unlike markSaved', () => {
		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('x')));
		expect(useEditorStore.getState().dirty).toBe(true);

		useEditorStore.getState().advanceSavedMeta(makeMeta({ version: 2 }));

		const state = useEditorStore.getState();
		expect(state.meta?.version).toBe(2);
		expect(state.dirty).toBe(true);
	});
});

describe('multi-select (§4.2)', () => {
	it('a shift-click with nothing selected yet just becomes a normal single selection', () => {
		useEditorStore.getState().toggleMultiSelect('page-1', 'block-1');
		const state = useEditorStore.getState();
		expect(state.selection).toEqual({ pageId: 'page-1', blockId: 'block-1' });
		expect(state.multiSelectedBlockIds).toEqual([]);
	});

	it('subsequent shift-clicks add to the multi-selection; shift-clicking the anchor is a no-op', () => {
		useEditorStore.getState().select({ pageId: 'page-1', blockId: 'block-1' });
		useEditorStore.getState().toggleMultiSelect('page-1', 'block-2');
		expect(useEditorStore.getState().multiSelectedBlockIds).toEqual(['block-2']);

		useEditorStore.getState().toggleMultiSelect('page-1', 'block-1');
		expect(useEditorStore.getState().multiSelectedBlockIds).toEqual(['block-2']);
	});

	it('shift-clicking an already-multi-selected block toggles it back out', () => {
		useEditorStore.getState().select({ pageId: 'page-1', blockId: 'block-1' });
		useEditorStore.getState().toggleMultiSelect('page-1', 'block-2');
		useEditorStore.getState().toggleMultiSelect('page-1', 'block-2');
		expect(useEditorStore.getState().multiSelectedBlockIds).toEqual([]);
	});

	it('a plain select() (a non-shift click) always clears the multi-selection', () => {
		useEditorStore.getState().select({ pageId: 'page-1', blockId: 'block-1' });
		useEditorStore.getState().toggleMultiSelect('page-1', 'block-2');
		expect(useEditorStore.getState().multiSelectedBlockIds).toHaveLength(1);

		useEditorStore.getState().select({ pageId: 'page-1', blockId: 'block-2' });
		expect(useEditorStore.getState().multiSelectedBlockIds).toEqual([]);
	});

	it('clearMultiSelection empties it without touching the anchor', () => {
		useEditorStore.getState().select({ pageId: 'page-1', blockId: 'block-1' });
		useEditorStore.getState().toggleMultiSelect('page-1', 'block-2');
		useEditorStore.getState().clearMultiSelection();
		const state = useEditorStore.getState();
		expect(state.multiSelectedBlockIds).toEqual([]);
		expect(state.selection).toEqual({ pageId: 'page-1', blockId: 'block-1' });
	});

	it('loadTemplate resets the multi-selection', () => {
		useEditorStore.getState().select({ pageId: 'page-1', blockId: 'block-1' });
		useEditorStore.getState().toggleMultiSelect('page-1', 'block-2');
		useEditorStore.getState().loadTemplate(makeMeta(), makeBody());
		expect(useEditorStore.getState().multiSelectedBlockIds).toEqual([]);
	});
});

describe('previewRoleId (§6.1 rule 3: "Preview as {role}")', () => {
	it('starts null (not previewing)', () => {
		expect(useEditorStore.getState().previewRoleId).toBeNull();
	});

	it('setPreviewRoleId sets and clears it', () => {
		useEditorStore.getState().setPreviewRoleId('role-a');
		expect(useEditorStore.getState().previewRoleId).toBe('role-a');
		useEditorStore.getState().setPreviewRoleId(null);
		expect(useEditorStore.getState().previewRoleId).toBeNull();
	});

	it('loadTemplate resets it back to null', () => {
		useEditorStore.getState().setPreviewRoleId('role-a');
		useEditorStore.getState().loadTemplate(makeMeta(), makeBody());
		expect(useEditorStore.getState().previewRoleId).toBeNull();
	});
});

describe('coalescing', () => {
	it('collapses same-key commands within the idle window into a single undo entry', () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);

		useEditorStore.getState().runCommand(renamePage('page-1', 'C'), { coalesceKey: 'page-1-name' });
		vi.setSystemTime(100);
		useEditorStore.getState().runCommand(renamePage('page-1', 'Co'), { coalesceKey: 'page-1-name' });
		vi.setSystemTime(200);
		useEditorStore.getState().runCommand(renamePage('page-1', 'Cov'), { coalesceKey: 'page-1-name' });

		const state = useEditorStore.getState();
		expect(state.undoStack).toHaveLength(1);
		expect(state.body?.pages[0]?.name).toBe('Cov');

		useEditorStore.getState().undo();
		expect(useEditorStore.getState().body?.pages[0]?.name).toBe('Page 1');
	});

	it('starts a new undo entry once the idle window has elapsed', () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);

		useEditorStore.getState().runCommand(renamePage('page-1', 'C'), { coalesceKey: 'page-1-name' });
		vi.setSystemTime(10_000); // well past COALESCE_WINDOW_MS
		useEditorStore.getState().runCommand(renamePage('page-1', 'Cover'), { coalesceKey: 'page-1-name' });

		expect(useEditorStore.getState().undoStack).toHaveLength(2);
	});

	it('endCoalescing (a blur) forces the next command to start a new entry even within the window', () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);

		useEditorStore.getState().runCommand(renamePage('page-1', 'C'), { coalesceKey: 'page-1-name' });
		useEditorStore.getState().endCoalescing();
		vi.setSystemTime(10); // still well within COALESCE_WINDOW_MS
		useEditorStore.getState().runCommand(renamePage('page-1', 'Cover'), { coalesceKey: 'page-1-name' });

		expect(useEditorStore.getState().undoStack).toHaveLength(2);
	});

	it('does not coalesce commands with different keys, even back to back', () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);

		useEditorStore.getState().runCommand(renamePage('page-1', 'A'), { coalesceKey: 'name' });
		useEditorStore.getState().runCommand(insertBlock({ pageId: 'page-1' }, 0, makeTextBlock('x')), { coalesceKey: 'insert' });

		expect(useEditorStore.getState().undoStack).toHaveLength(2);
	});
});

/**
 * §3's ⋮ menu has a "Rename" item, and §3's rename *is* the inline header name
 * field — not a separate dialog. So the menu needs a way to put
 * `TemplateNameEditor` into editing mode from outside it.
 *
 * A module-level callback rather than store state, for the same reason
 * `richtext/activeRichTextEditor.ts` is one: this is a transient imperative
 * request ("start editing now"), not state anything renders from. In the store
 * it would be a flag someone has to remember to clear, and a stale `true` would
 * reopen the field on every unrelated render.
 */
let requestStartEditing: (() => void) | null = null;

/** Called by `TemplateNameEditor` on mount, and with `null` on unmount so the callback can't outlive the component. */
export function registerRenameHandler(handler: (() => void) | null): void {
	requestStartEditing = handler;
}

export function startRenamingTemplate(): void {
	requestStartEditing?.();
}

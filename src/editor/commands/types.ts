import type { Draft } from 'immer';
import type { TemplateBody } from '../types';

/**
 * A named mutation with its inverse computed lazily — spec §9.1: "Every
 * mutation is a named command with apply/invert... a naive full-snapshot
 * undo stack will not survive a 40-page template with images."
 *
 * `apply` receives the Immer draft, performs its mutation, and returns the
 * Command that undoes it — captured from the draft's state as it existed
 * *before* the mutation, not stored as a snapshot of the whole document. This
 * makes undo/redo symmetric: undo is just "apply the top of the undo stack",
 * which itself returns the redo command, and vice versa. See
 * `applyCommandSnapshot` in blockTree.ts for the one subtlety this requires
 * (Immer drafts don't outlive the producer callback; captured values must be
 * cloned out with `current()` before being closed over by the returned
 * inverse).
 */
export interface Command {
	readonly name: string;
	apply(draft: Draft<TemplateBody>): Command;
}

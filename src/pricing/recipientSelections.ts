import type { Block, PricingItem, PricingTableBlock, QuoteBuilderBlock, TemplateBody } from '../editor/types';

/**
 * What the recipient chose in section 1, keyed by `PricingItem.id`.
 *
 * A flat map rather than per-block structures: item ids are unique across the
 * whole document, and flat means the whole thing round-trips to the backend as
 * one small JSON object with no shape to keep in sync with the block tree.
 * Group semantics (single vs multi) are enforced by the UI and re-checked here
 * by `unsatisfiedGroups`, not encoded in the storage shape.
 */
export type PricingSelections = Record<string, boolean>;

/**
 * Every pricing/quote block in the tree, including ones nested inside a
 * `ColumnsBlock` or a `SmartContentBlock`.
 *
 * Deliberately the same whole-tree walk `computeTotals`' own
 * `collectPricingBlocks` does — a pricing table inside a column has to be
 * choosable for the same reason it has to count toward the total.
 */
function eachPricingBlock(blocks: Block[], visit: (block: PricingTableBlock | QuoteBuilderBlock) => void): void {
	for (const block of blocks) {
		if (block.type === 'pricing_table' || block.type === 'quote_builder') visit(block);
		else if (block.type === 'columns') for (const column of block.columns) eachPricingBlock(column, visit);
		else if (block.type === 'smart_content') eachPricingBlock(block.children, visit);
	}
}

/** Maps every block in the tree, recursing into columns and smart content so a nested pricing block is transformed too. */
function mapBlocks(blocks: Block[], transform: (block: Block) => Block): Block[] {
	return blocks.map((block) => {
		if (block.type === 'columns') {
			return transform({ ...block, columns: block.columns.map((column) => mapBlocks(column, transform)) });
		}
		if (block.type === 'smart_content') {
			return transform({ ...block, children: mapBlocks(block.children, transform) });
		}
		return transform(block);
	});
}

function mapBodyBlocks(body: TemplateBody, transform: (block: Block) => Block): TemplateBody {
	return { ...body, pages: body.pages.map((page) => ({ ...page, blocks: mapBlocks(page.blocks, transform) })) };
}

/**
 * Whether the recipient is allowed to change this pricing table's optional items
 * at all — §7's `allowRecipientSelectOptional`, which is the author's switch.
 */
function tableIsChoosable(block: PricingTableBlock): boolean {
	return block.settings.allowRecipientSelectOptional;
}

/**
 * A package-selection table's choice is stored in the same selections map as
 * item ticks, keyed `section:<sectionId>` — section ids are uuids like item
 * ids, so the prefix is what keeps a section choice from ever colliding with
 * (or being read as) an item choice.
 *
 * Mirrored in `spqbackend/.../utils/pricingSelections.js` — change both together.
 */
export function packageSectionKey(sectionId: string): string {
	return `section:${sectionId}`;
}

function isPackageTable(block: PricingTableBlock): boolean {
	return Boolean(block.settings.packageSelection);
}

/** The section the customer picked — first by section order with its key set — falling back to the sender's preselected default. */
function chosenSectionIdOf(block: PricingTableBlock, selections: PricingSelections): string | null {
	const sections = [...block.sections].sort((a, b) => a.order - b.order);
	for (const section of sections) if (selections[packageSectionKey(section.id)]) return section.id;
	return block.selectedSectionId ?? null;
}

/**
 * The ids a recipient may actually toggle.
 *
 * Two different rules, because the two blocks mean different things. A pricing
 * table's row is choosable only if the author marked it `optional` **and** turned
 * on `allowRecipientSelectOptional`. A quote builder's options are always
 * choosable — picking one is the entire purpose of the block, so there is no
 * separate switch to respect.
 */
export function selectableItemIds(body: TemplateBody): Set<string> {
	const ids = new Set<string>();
	eachPricingBlock(
		body.pages.flatMap((p) => p.blocks),
		(block) => {
			if (block.type === 'pricing_table') {
				// A package-selection table: the choosable things are its sections
				// (one package each), not its rows — a package is all-or-nothing.
				if (isPackageTable(block)) {
					for (const section of block.sections) ids.add(packageSectionKey(section.id));
				}
				if (!tableIsChoosable(block)) return;
				for (const item of block.items) if (item.optional) ids.add(item.id);
				return;
			}
			for (const group of block.groups) for (const option of group.options) ids.add(option.id);
		}
	);
	return ids;
}

/** True when this document has anything for the recipient to configure — used to decide whether section 1 is a choice or just a read-through. */
export function hasRecipientChoices(body: TemplateBody): boolean {
	return selectableItemIds(body).size > 0;
}

/**
 * The starting selections, taken from what the author left selected.
 *
 * Covers **every** item, not just the choosable ones, so `applyPricingSelections`
 * never has to fall back to a default mid-flight and a stored selection map is a
 * complete description of the configuration on its own.
 */
export function defaultSelections(body: TemplateBody): PricingSelections {
	const selections: PricingSelections = {};
	eachPricingBlock(
		body.pages.flatMap((p) => p.blocks),
		(block) => {
			if (block.type === 'pricing_table') {
				if (isPackageTable(block)) {
					for (const section of block.sections) {
						selections[packageSectionKey(section.id)] = section.id === (block.selectedSectionId ?? null);
					}
				}
				for (const item of block.items) selections[item.id] = !item.optional || item.selected;
				return;
			}
			for (const group of block.groups) for (const option of group.options) selections[option.id] = option.selected;
		}
	);
	return selections;
}

/** A single group that still needs an answer, named so the UI can say which one. */
export interface UnsatisfiedGroup {
	blockId: string;
	groupId: string;
	groupName: string;
	reason: 'none-chosen' | 'too-many-chosen';
}

/**
 * Required quote-builder groups the recipient hasn't answered yet.
 *
 * Checked here rather than only in the UI because it also guards the send: a
 * `single`-selection group with two options ticked would produce a PDF that
 * charges for both, and a required group with none would produce one that charges
 * for neither. Both are wrong in a way the customer would only notice after
 * signing.
 */
export function unsatisfiedGroups(body: TemplateBody, selections: PricingSelections): UnsatisfiedGroup[] {
	const problems: UnsatisfiedGroup[] = [];
	eachPricingBlock(
		body.pages.flatMap((p) => p.blocks),
		(block) => {
			// A package table behaves like one required single-selection group:
			// no package picked would charge for nothing, two would charge twice.
			if (block.type === 'pricing_table') {
				if (!isPackageTable(block) || block.sections.length === 0) return;
				const chosen = block.sections.filter((section) => selections[packageSectionKey(section.id)]).length;
				if (chosen === 0) {
					problems.push({ blockId: block.id, groupId: block.id, groupName: 'Package selection', reason: 'none-chosen' });
				} else if (chosen > 1) {
					problems.push({ blockId: block.id, groupId: block.id, groupName: 'Package selection', reason: 'too-many-chosen' });
				}
				return;
			}
			if (block.type !== 'quote_builder') return;
			for (const group of block.groups) {
				const chosen = group.options.filter((option) => selections[option.id]).length;
				if (group.required && chosen === 0) {
					problems.push({ blockId: block.id, groupId: group.id, groupName: group.name, reason: 'none-chosen' });
				} else if (group.selection === 'single' && chosen > 1) {
					problems.push({ blockId: block.id, groupId: group.id, groupName: group.name, reason: 'too-many-chosen' });
				}
			}
		}
	);
	return problems;
}

/**
 * Applies a choice to one item without inventing one.
 *
 * `optional` is forced **true** for a quote-builder option, because
 * `computeTotals`' `computeLine` only honours `selected` when `optional` is set —
 * and options are created `optional: false` by `createBlankPricingItem`, which is
 * the same factory pricing-table rows use. Without this, unticking an option
 * would leave its price in the total. Done here, on a derived copy, rather than by
 * changing the totals engine or the authoring default: this body is thrown away
 * after rendering and the stored template keeps meaning exactly what the author
 * said.
 */
function withSelection(item: PricingItem, included: boolean, forceOptional: boolean): PricingItem {
	if (forceOptional) return { ...item, optional: true, selected: included };
	if (!item.optional) return item;
	return { ...item, selected: included };
}

/**
 * The body as the recipient has configured it, with **every item still present**.
 *
 * This is what section 1 renders and what its live totals are computed from:
 * unselected optional rows have to stay visible, or there is nothing left to tick.
 */
export function applyPricingSelections(body: TemplateBody, selections: PricingSelections): TemplateBody {
	return mapBodyBlocks(body, (block) => {
		if (block.type === 'pricing_table') {
			// A package table's live choice resolves onto `selectedSectionId`,
			// which is all `computeTotals` needs — every row stays present so
			// the unchosen packages remain on screen to pick from.
			if (isPackageTable(block)) {
				return { ...block, selectedSectionId: chosenSectionIdOf(block, selections) };
			}
			if (!tableIsChoosable(block)) return block;
			return { ...block, items: block.items.map((item) => withSelection(item, selections[item.id] ?? item.selected, false)) };
		}
		if (block.type === 'quote_builder') {
			return {
				...block,
				groups: block.groups.map((group) => ({
					...group,
					options: group.options.map((option) => withSelection(option, selections[option.id] ?? option.selected, true)),
				})),
			};
		}
		return block;
	});
}

/**
 * The body as it will be **signed** — unselected items removed outright, not
 * merely flagged.
 *
 * Grayson: *"Only the line items they selected should make it into the PDF."*
 * Removing them here rather than teaching the renderers a print-only mode means
 * the whole existing pipeline — `PrintTemplate`, `DocumentBlockView`,
 * `collectFieldGeometry`, `computeTotals` — produces the right PDF with no
 * changes at all. There is one body that is the agreement, and it simply does not
 * contain the things the customer declined.
 *
 * Kept rows are also normalised to `optional: false, selected: true`, so the
 * signed document reads as a definite list of what was agreed rather than as a
 * menu with some boxes ticked.
 */
export function configuredBodyForAgreement(body: TemplateBody, selections: PricingSelections): TemplateBody {
	const isIncluded = (item: PricingItem, forceOptional: boolean): boolean => {
		const chosen = selections[item.id];
		if (forceOptional) return chosen ?? item.selected;
		if (!item.optional) return true;
		return chosen ?? item.selected;
	};
	const settle = (item: PricingItem): PricingItem => ({ ...item, optional: false, selected: true });

	return mapBodyBlocks(body, (block) => {
		if (block.type === 'pricing_table') {
			// A package-selection table freezes to the chosen package alone:
			// the other packages were a menu, and the agreement is not a menu.
			// Rows with no section survive regardless (a table-wide line).
			if (isPackageTable(block)) {
				const chosen = chosenSectionIdOf(block, selections);
				return {
					...block,
					selectedSectionId: chosen,
					sections: block.sections.filter((section) => section.id === chosen),
					items: block.items.filter((item) => item.sectionId == null || item.sectionId === chosen).map(settle),
				};
			}
			// An author who never turned on recipient selection gets their table
			// exactly as written — including its own unselected optional rows, which
			// are the sender's decision and not the customer's to have made.
			if (!tableIsChoosable(block)) return block;
			return { ...block, items: block.items.filter((item) => isIncluded(item, false)).map(settle) };
		}
		if (block.type === 'quote_builder') {
			return {
				...block,
				// A group left empty by the customer's choices is dropped too, rather
				// than printing a heading with nothing under it.
				groups: block.groups
					.map((group) => ({ ...group, options: group.options.filter((option) => isIncluded(option, true)).map(settle) }))
					.filter((group) => group.options.length > 0),
			};
		}
		return block;
	});
}

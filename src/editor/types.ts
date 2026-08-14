/**
 * The template/document domain model — `template-editor-requirements.md` §2.
 *
 * This is the contract. Persistence, undo/redo, rendering, pricing, and PDF
 * export all derive from it; change it deliberately, not incidentally.
 *
 * Two adaptations from the spec, both forced by the storage split described in
 * `PROJECT_CONTEXT.md`:
 *
 * 1. The spec models `Template` as one object. Here it's split into
 *    `TemplateMeta` (the Data Store row — the queryable fields) and
 *    `TemplateBody` (the Stratus JSON — pages, roles, variables, settings).
 *    Keeping the boundary in the types means it's hard to accidentally write
 *    a field to the wrong side of it.
 * 2. `Money` is a branded integer rather than a bare `number`, so a value in
 *    dollars can't be passed where minor units are expected. §7.3 is
 *    emphatic that money never touches a float; this makes that checkable.
 */

// ─── Primitives ──────────────────────────────────────────────────────────────

export type UserId = string;
export type BlockId = string;
export type PageId = string;
export type RoleId = string;

declare const MONEY_BRAND: unique symbol;

/**
 * An amount in integer **minor units** (cents for USD). Never a float, never
 * a major-unit value. Construct with {@link money}.
 */
export type Money = number & { readonly [MONEY_BRAND]: 'minorUnits' };

export function money(minorUnits: number): Money {
	if (!Number.isInteger(minorUnits)) {
		throw new Error(`Money must be integer minor units, got ${minorUnits}`);
	}
	return minorUnits as Money;
}

export const ZERO_MONEY = money(0);

/**
 * ProseMirror/Tiptap document JSON. Declared structurally rather than
 * imported from Tiptap so the domain model doesn't depend on the editor
 * library — the same shape has to be readable by the server-side renderer,
 * which has no Tiptap instance.
 */
export interface RichTextNode {
	type: string;
	attrs?: Record<string, unknown>;
	content?: RichTextNode[];
	marks?: { type: string; attrs?: Record<string, unknown> }[];
	text?: string;
}

export interface RichTextDoc {
	type: 'doc';
	content: RichTextNode[];
}

// ─── Styling ─────────────────────────────────────────────────────────────────

export interface Spacing {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface BlockStyle {
	margin?: Spacing;
	padding?: Spacing;
	backgroundColor?: string;
	border?: { width: number; style: 'solid' | 'dashed' | 'dotted'; color: string; radius?: number };
	/** Fraction of the content width, 0–1. Omitted means full width. */
	width?: number;
	alignment?: 'left' | 'center' | 'right';
}

export interface CellStyle {
	backgroundColor?: string;
	borderColor?: string;
	padding?: Spacing;
	verticalAlign?: 'top' | 'middle' | 'bottom';
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

export interface BlockBase {
	id: BlockId;
	type: string;
	/** Locked blocks cannot be edited, moved, or deleted. Protects boilerplate. */
	locked: boolean;
	style: BlockStyle;
	/** Set when inserted from the Content Library; enables "update from source". */
	contentLibraryRef?: string;
	/** FK to a SmartContent rule, if this block is conditionally rendered. */
	conditionId?: string;
}

export interface TextBlock extends BlockBase {
	type: 'text';
	doc: RichTextDoc;
}

export interface ImageBlock extends BlockBase {
	type: 'image';
	assetId: string;
	url: string;
	alt: string;
	width: number;
	height: number;
	crop?: { x: number; y: number; w: number; h: number };
	shape: 'rect' | 'circle';
	link?: string;
}

export interface VideoBlock extends BlockBase {
	type: 'video';
	provider: 'youtube' | 'vimeo' | 'upload';
	url: string;
	thumbnailUrl: string;
	autoplay: boolean;
}

export interface TableCell {
	doc: RichTextDoc;
	colspan: number;
	rowspan: number;
	style: CellStyle;
}

/** Static layout/content table. Distinct from PricingTableBlock — no math. */
export interface TableBlock extends BlockBase {
	type: 'table';
	rows: { cells: TableCell[] }[];
	/** Fractional widths, one per column. */
	columnWidths: number[];
	headerRow: boolean;
}

export type PricingColumnKind =
	| 'name'
	| 'price'
	| 'qty'
	| 'discount'
	| 'tax'
	| 'subtotal'
	| 'custom';

export interface PricingColumn {
	id: string;
	kind: PricingColumnKind;
	label: string;
	visible: boolean;
}

export interface PricingSection {
	id: string;
	name: string;
	order: number;
}

export interface PricingItem {
	id: string;
	sectionId: string | null;
	sku?: string;
	name: string;
	description: string;
	qty: number;
	price: Money;
	cost?: Money;
	discount?: { type: 'pct' | 'amount'; value: number };
	tax?: { type: 'pct' | 'amount'; value: number };
	/** Recipient may include or exclude this line. */
	optional: boolean;
	/** Default state when `optional`. */
	selected: boolean;
	catalogItemId?: string;
	customFields: Record<string, string | number>;
}

export interface PricingTableBlock extends BlockBase {
	type: 'pricing_table';
	currency: string;
	columns: PricingColumn[];
	sections: PricingSection[];
	items: PricingItem[];
	settings: {
		allowRecipientQtyEdit: boolean;
		allowRecipientSelectOptional: boolean;
		showSubtotal: boolean;
		showDiscount: boolean;
		showTax: boolean;
		showTotal: boolean;
		recurrence?: 'one_time' | 'monthly' | 'annual';
	};
}

/** Recipient-configurable pricing: option groups plus add-ons. */
export interface QuoteBuilderBlock extends BlockBase {
	type: 'quote_builder';
	currency: string;
	groups: {
		id: string;
		name: string;
		selection: 'single' | 'multi';
		required: boolean;
		options: PricingItem[];
	}[];
}

export interface TableOfContentsBlock extends BlockBase {
	type: 'toc';
	/** Heading depth to include, 1–3. */
	levels: number;
	// Entries are DERIVED at render time from headings across all pages.
	// Never stored — see §4.5 on running pagination twice.
}

export interface PageBreakBlock extends BlockBase {
	type: 'page_break';
}

export interface ConditionRule {
	subject: { kind: 'variable' | 'pricing_total' | 'field'; ref: string };
	operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'is_empty' | 'is_not_empty';
	value: string | number | null;
}

export interface SmartContentBlock extends BlockBase {
	type: 'smart_content';
	name: string;
	rules: ConditionRule[];
	match: 'all' | 'any';
	children: Block[];
}

export interface ColumnsBlock extends BlockBase {
	type: 'columns';
	/** Fractions summing to 1. */
	widths: number[];
	columns: Block[][];
}

/** A fillable field placed as its own block rather than inline (§6.2). */
export interface FieldBlock extends BlockBase {
	type: 'field';
	field: FillableField;
}

export type Block =
	| TextBlock
	| ImageBlock
	| VideoBlock
	| TableBlock
	| PricingTableBlock
	| QuoteBuilderBlock
	| TableOfContentsBlock
	| PageBreakBlock
	| SmartContentBlock
	| ColumnsBlock
	| FieldBlock;

export type BlockType = Block['type'];

// ─── Roles, fields, variables ────────────────────────────────────────────────

export interface Role {
	id: RoleId;
	/** "Client", "Sales Rep". */
	name: string;
	/** Drives field tint and avatar chip color. */
	color: string;
	order: number;
	signingOrder?: number;
	isSender: boolean;
}

export type FieldType =
	| 'signature'
	| 'initials'
	| 'text'
	| 'date'
	| 'file_upload'
	| 'checkbox'
	| 'radio_group'
	| 'dropdown'
	| 'billing_details'
	| 'stamp';

export interface FieldValidation {
	pattern?: string;
	minLength?: number;
	maxLength?: number;
	format?: 'email' | 'phone' | 'number' | 'currency';
}

export interface FillableField {
	id: string;
	type: FieldType;
	/** REQUIRED — every field belongs to exactly one role. Never optional. */
	roleId: RoleId;
	/** Merge name, unique per template. */
	name: string;
	required: boolean;
	placeholder?: string;
	defaultValue?: string;
	/** Dropdown / radio options. */
	options?: string[];
	validation?: FieldValidation;
}

export type VariableSource = 'contact' | 'company' | 'deal' | 'sender' | 'custom' | 'computed';

export interface VariableDef {
	/** "Client.Company". */
	key: string;
	label: string;
	source: VariableSource;
	defaultValue?: string;
	format?: 'text' | 'currency' | 'date' | 'number';
}

// ─── Structure ───────────────────────────────────────────────────────────────

export interface Page {
	id: PageId;
	/** "COVER PAGE" — shown above the page in the canvas. */
	name: string;
	order: number;
	blocks: Block[];
	background?: { color?: string; imageUrl?: string };
}

export interface TemplateSettings {
	pageSize: 'LETTER' | 'A4';
	orientation: 'portrait' | 'landscape';
	/** px @96dpi. */
	margins: Spacing;
	/** Repeats on every physical page. */
	header?: Block[];
	footer?: Block[];
	showPageNumbers: boolean;
}

// ─── Template: the Data Store row vs. the Stratus body ───────────────────────

export type TemplateStatus = 'draft' | 'published';

/**
 * The Data Store row. Only fields that are queried — listed, filtered, sorted —
 * belong here; everything else lives in {@link TemplateBody}.
 */
export interface TemplateMeta {
	id: string;
	/** May contain variable tokens: "[Client.Company] Proposal 2026". */
	name: string;
	folderId: string | null;
	themeId: string | null;
	status: TemplateStatus;
	stratusPath: string;
	currency: string;
	/** Denormalized for list views; recomputed by `computeTotals`. */
	computedTotal: Money;
	/** Optimistic-concurrency token. Incremented server-side on every save. */
	version: number;
	createdBy: UserId;
	updatedBy: UserId;
	createdAt: string;
	updatedAt: string;
	archivedAt: string | null;
}

/** The Stratus object. This is the block tree — the canonical content. */
export interface TemplateBody {
	pages: Page[];
	roles: Role[];
	/** Custom variables defined on this template. */
	variables: VariableDef[];
	settings: TemplateSettings;
}

/** Both halves, as the editor works with them. */
export interface Template {
	meta: TemplateMeta;
	body: TemplateBody;
}

// ─── Document: an instance of a template ─────────────────────────────────────

export type DocumentStatus = 'draft' | 'sent' | 'viewed' | 'completed' | 'declined';

export interface DocumentMeta {
	id: string;
	title: string;
	folderId: string | null;
	status: DocumentStatus;
	/** Lineage. Documents are snapshots — editing a template never changes them. */
	sourceTemplateId: string;
	sourceTemplateVersion: number;
	stratusPath: string;
	currency: string;
	computedTotal: Money;
	version: number;
	createdBy: UserId;
	updatedBy: UserId;
	createdAt: string;
	updatedAt: string;
	sentAt: string | null;
	completedAt: string | null;
	archivedAt: string | null;
}

/** Role→contact binding. Promoted out of the JSON because it's queried. */
export interface DocumentRecipient {
	id: string;
	documentId: string;
	roleId: RoleId;
	roleName: string;
	contactId: string | null;
	email: string;
	name: string;
	signingOrder: number;
	status: 'pending' | 'viewed' | 'completed' | 'declined';
}

// ─── Editor mode ─────────────────────────────────────────────────────────────

/**
 * The same editor component serves both objects (§1.1). In `template` mode
 * variables render as placeholder chips; in `document` mode they render as
 * their resolved values.
 */
export type EditorMode = 'template' | 'document';

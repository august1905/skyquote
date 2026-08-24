import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { insertBlock, setSmartContentRules, unwrapSmartContent, type BlockContainer } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { AddBlockMenu } from '../canvas/AddBlockMenu';
import { BlockContainerDropRegion } from '../canvas/BlockContainerDropRegion';
import { SortableBlock } from '../canvas/SortableBlock';
import { COLUMN_INSERTABLE_BLOCK_KINDS } from './insertable';
import { collectAllFields } from '../fields/collectFields';
import { allVariables } from '../variables/systemVariables';
import { collectPricingBlocksByPage } from '../../pricing/computeTotals';
import type { ConditionRule, FillableField, SmartContentBlock, VariableDef } from '../types';
import type { BlockViewProps } from './types';
import './smartContent.css';

interface PricingRef {
	id: string;
	label: string;
}

const OPERATOR_LABELS: Record<ConditionRule['operator'], string> = {
	eq: 'is',
	neq: 'is not',
	gt: 'is greater than',
	lt: 'is less than',
	contains: 'contains',
	is_empty: 'is empty',
	is_not_empty: 'is not empty',
};

const OPERATORS_NEEDING_VALUE = new Set<ConditionRule['operator']>(['eq', 'neq', 'gt', 'lt', 'contains']);

function subjectLabel(rule: ConditionRule, variables: VariableDef[], fields: FillableField[], pricingRefs: PricingRef[]): string {
	if (rule.subject.kind === 'variable') return variables.find((v) => v.key === rule.subject.ref)?.label ?? rule.subject.ref;
	if (rule.subject.kind === 'field') return fields.find((f) => f.id === rule.subject.ref)?.name ?? rule.subject.ref;
	return pricingRefs.find((p) => p.id === rule.subject.ref)?.label ?? rule.subject.ref;
}

function ruleSummary(block: SmartContentBlock, variables: VariableDef[], fields: FillableField[], pricingRefs: PricingRef[]): string {
	if (block.rules.length === 0) return 'Always shown — no rules yet';
	const joiner = block.match === 'all' ? ' and ' : ' or ';
	return block.rules
		.map((rule) => {
			const value = OPERATORS_NEEDING_VALUE.has(rule.operator) ? ` "${rule.value ?? ''}"` : '';
			return `${subjectLabel(rule, variables, fields, pricingRefs)} ${OPERATOR_LABELS[rule.operator]}${value}`;
		})
		.join(joiner);
}

function defaultRuleFor(variables: VariableDef[], fields: FillableField[], pricingRefs: PricingRef[]): ConditionRule {
	if (variables.length > 0) return { subject: { kind: 'variable', ref: variables[0]!.key }, operator: 'is_not_empty', value: null };
	if (fields.length > 0) return { subject: { kind: 'field', ref: fields[0]!.id }, operator: 'is_not_empty', value: null };
	if (pricingRefs.length > 0) return { subject: { kind: 'pricing_total', ref: pricingRefs[0]!.id }, operator: 'gt', value: 0 };
	return { subject: { kind: 'variable', ref: '' }, operator: 'is_not_empty', value: null };
}

/**
 * §4.5's rule builder — edits a local draft (rules + match) and commits it
 * as one `setSmartContentRules` command on Save, rather than a command per
 * keystroke/dropdown change (the same "one undo step per popover session"
 * shape the block settings popover already uses).
 */
function RuleBuilderPopover({
	block,
	pageId,
	variables,
	fields,
	pricingRefs,
	onClose,
}: {
	block: SmartContentBlock;
	pageId: string;
	variables: VariableDef[];
	fields: FillableField[];
	pricingRefs: PricingRef[];
	onClose: () => void;
}) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const [draftRules, setDraftRules] = useState<ConditionRule[]>(block.rules);
	const [draftMatch, setDraftMatch] = useState<'all' | 'any'>(block.match);

	function updateRule(index: number, patch: Partial<ConditionRule> | { subject: ConditionRule['subject'] }) {
		setDraftRules((rules) => rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
	}

	function save() {
		runCommand(setSmartContentRules(pageId, block.id, draftRules, draftMatch));
		onClose();
	}

	const refOptionsFor = (kind: ConditionRule['subject']['kind']) =>
		kind === 'variable'
			? variables.map((v) => ({ value: v.key, label: v.label }))
			: kind === 'field'
				? fields.map((f) => ({ value: f.id, label: f.name }))
				: pricingRefs.map((p) => ({ value: p.id, label: p.label }));

	return (
		<div className="smart-content-rule-popover" onClick={(e) => e.stopPropagation()}>
			<div className="smart-content-rule-popover-header">
				<strong>Show this content when…</strong>
				<select value={draftMatch} onChange={(e) => setDraftMatch(e.target.value as 'all' | 'any')}>
					<option value="all">all rules match</option>
					<option value="any">any rule matches</option>
				</select>
			</div>
			{draftRules.length === 0 && <p className="smart-content-rule-empty">No rules — always shown.</p>}
			{draftRules.map((rule, index) => {
				const options = refOptionsFor(rule.subject.kind);
				return (
					<div key={index} className="smart-content-rule-row">
						<select
							value={rule.subject.kind}
							onChange={(e) => {
								const kind = e.target.value as ConditionRule['subject']['kind'];
								const firstRef = refOptionsFor(kind)[0]?.value ?? '';
								updateRule(index, { subject: { kind, ref: firstRef } });
							}}
						>
							<option value="variable">Variable</option>
							<option value="field">Field</option>
							<option value="pricing_total">Pricing total</option>
						</select>
						<select
							value={rule.subject.ref}
							onChange={(e) => updateRule(index, { subject: { kind: rule.subject.kind, ref: e.target.value } })}
						>
							{options.length === 0 && <option value="">Nothing available yet</option>}
							{options.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
						<select value={rule.operator} onChange={(e) => updateRule(index, { operator: e.target.value as ConditionRule['operator'] })}>
							{Object.entries(OPERATOR_LABELS).map(([op, label]) => (
								<option key={op} value={op}>
									{label}
								</option>
							))}
						</select>
						{OPERATORS_NEEDING_VALUE.has(rule.operator) && (
							<input
								type="text"
								value={rule.value ?? ''}
								placeholder="Value"
								onChange={(e) => updateRule(index, { value: e.target.value })}
							/>
						)}
						<button type="button" onClick={() => setDraftRules((rules) => rules.filter((_, i) => i !== index))}>
							Remove
						</button>
					</div>
				);
			})}
			<div className="smart-content-rule-popover-actions">
				<button type="button" onClick={() => setDraftRules((rules) => [...rules, defaultRuleFor(variables, fields, pricingRefs)])}>
					+ Add rule
				</button>
				<div>
					<button type="button" onClick={onClose}>
						Cancel
					</button>
					<button type="button" onClick={save}>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * §4.5: "Container with a visible dashed border and a rule summary chip in
 * author mode. Rules built against variables, pricing totals, and field
 * values." Real evaluation (`evaluateSmartContent`) only ever runs against a
 * recipient's real document — during authoring there's no real variable/
 * field/pricing data to evaluate against, so this always renders its
 * children, gated only by the local "preview as if true/false" toggle
 * (§4.5's own author-mode affordance) rather than a real evaluation result.
 */
export function SmartContentBlockView({ pageId, block, selected }: BlockViewProps<SmartContentBlock>) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const body = useEditorStore((s) => s.body);
	const selection = useEditorStore((s) => s.selection);
	const multiSelectedBlockIds = useEditorStore((s) => s.multiSelectedBlockIds);
	const [rulesOpen, setRulesOpen] = useState(false);
	const [previewAsTrue, setPreviewAsTrue] = useState(true);

	const container: BlockContainer = { pageId, parent: { smartContentBlockId: block.id } };
	const variables = body ? allVariables(body.variables) : [];
	const fields = body ? collectAllFields(body) : [];
	const pricingRefs: PricingRef[] = body
		? collectPricingBlocksByPage(body).map(({ pageId: refPageId, block: refBlock }) => ({
				id: refBlock.id,
				label: `${refBlock.type === 'pricing_table' ? 'Pricing table' : 'Quote builder'} — ${body.pages.find((p) => p.id === refPageId)?.name ?? 'page'}`,
			}))
		: [];

	return (
		<div className={`block-smart-content${selected ? ' block-smart-content-selected' : ''}`} data-block-id={block.id}>
			{/* No stopPropagation here, unlike the rule popover below — clicking
			    the header (including the rule chip) should still bubble up to
			    the enclosing SortableBlock's own onClick and select *this*
			    block, the same as clicking any other part of it. Only a click
			    inside `.smart-content-children` resolves to a *child* block's
			    own SortableBlock instead, which is the one exception. */}
			<div className="smart-content-header">
				<span className="smart-content-name">{block.name}</span>
				<button type="button" className="smart-content-rule-chip" onClick={() => setRulesOpen((o) => !o)}>
					{ruleSummary(block, variables, fields, pricingRefs)}
				</button>
				{selected && (
					<div className="smart-content-toolbar">
						<label>
							Preview as if
							<select value={previewAsTrue ? 'true' : 'false'} onChange={(e) => setPreviewAsTrue(e.target.value === 'true')}>
								<option value="true">condition is true</option>
								<option value="false">condition is false</option>
							</select>
						</label>
						<button type="button" onClick={() => runCommand(unwrapSmartContent(pageId, block.id))}>
							Remove wrapper
						</button>
					</div>
				)}
			</div>
			{rulesOpen && (
				<RuleBuilderPopover
					block={block}
					pageId={pageId}
					variables={variables}
					fields={fields}
					pricingRefs={pricingRefs}
					onClose={() => setRulesOpen(false)}
				/>
			)}
			{previewAsTrue ? (
				// §4.1 path 1's drop target for this container — the only way to drag a
				// tile into a smart-content block that's still empty. Only while
				// previewing as true: when the preview hides the children there's
				// nothing on screen to drop *into*.
				<BlockContainerDropRegion container={container} appendIndex={block.children.length} className="smart-content-children">
					<SortableContext items={block.children.map((b) => b.id)} strategy={verticalListSortingStrategy}>
						{block.children.map((childBlock) => (
							<SortableBlock
								key={childBlock.id}
								pageId={pageId}
								container={container}
								block={childBlock}
								selected={selection?.pageId === pageId && selection.blockId === childBlock.id}
								multiSelected={selection?.pageId === pageId && multiSelectedBlockIds.includes(childBlock.id)}
							/>
						))}
					</SortableContext>
					<AddBlockMenu
						kinds={COLUMN_INSERTABLE_BLOCK_KINDS}
						onInsert={(newBlock) => runCommand(insertBlock(container, block.children.length, newBlock))}
					/>
				</BlockContainerDropRegion>
			) : (
				<p className="smart-content-hidden-note">Hidden under this preview — nothing rendered when the condition is false.</p>
			)}
		</div>
	);
}

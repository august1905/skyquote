import { describe, expect, it } from 'vitest';
import type { ColumnsBlock, RichTextNode, TableBlock, TemplateBody, TemplateSettings, TextBlock, VariableDef } from '../editor/types';
import { money } from '../editor/types';
import type { DocumentTotals } from '../pricing/computeTotals';
import { computeResolvedVariableValues, resolveTitle, resolveVariablesInBody } from './resolveVariables';

function makeSettings(): TemplateSettings {
	return {
		pageSize: 'LETTER',
		orientation: 'portrait',
		margins: { top: 0, right: 0, bottom: 0, left: 0 },
		showPageNumbers: false,
		theme: { headingFont: 'Georgia', bodyFont: 'Arial', primaryColor: '#000', textColor: '#000', pageBackgroundColor: '#fff', baseSpacing: 0 },
	};
}

function variableNode(key: string): RichTextNode {
	return { type: 'variable', attrs: { key, fallback: null } };
}

function makeBody(blocks: TemplateBody['pages'][number]['blocks'], variables: VariableDef[] = []): TemplateBody {
	return { pages: [{ id: 'page-1', name: 'Page 1', order: 0, blocks }], roles: [], variables, settings: makeSettings() };
}

function zeroTotals(): DocumentTotals {
	return { currency: 'USD', blocks: [], subtotal: money(0), discount: money(0), tax: money(0), total: money(1500) };
}

describe('computeResolvedVariableValues', () => {
	const now = new Date('2026-08-19T00:00:00Z');

	it('prefers a wizard-typed value over the variable\'s own default', () => {
		const body = makeBody(
			[{ id: 'b1', type: 'text', locked: false, style: {}, doc: { type: 'doc', content: [{ type: 'paragraph', content: [variableNode('Custom.Note')] }] } }],
			[{ key: 'Custom.Note', label: 'Note', source: 'custom', defaultValue: 'fallback note' }]
		);
		const values = computeResolvedVariableValues({ body, templateName: 'Untitled', wizardValues: { 'Custom.Note': 'typed note' }, totals: zeroTotals(), now });
		expect(values['Custom.Note']).toBe('typed note');
	});

	it('falls back to the default value when nothing was typed', () => {
		const body = makeBody(
			[{ id: 'b1', type: 'text', locked: false, style: {}, doc: { type: 'doc', content: [{ type: 'paragraph', content: [variableNode('Custom.Note')] }] } }],
			[{ key: 'Custom.Note', label: 'Note', source: 'custom', defaultValue: 'fallback note' }]
		);
		const values = computeResolvedVariableValues({ body, templateName: 'Untitled', wizardValues: {}, totals: zeroTotals(), now });
		expect(values['Custom.Note']).toBe('fallback note');
	});

	it('renders a visible placeholder — never an empty string — when there is no typed value and no default (§11.1)', () => {
		const body = makeBody([{ id: 'b1', type: 'text', locked: false, style: {}, doc: { type: 'doc', content: [{ type: 'paragraph', content: [variableNode('Client.Company')] }] } }]);
		const values = computeResolvedVariableValues({ body, templateName: 'Untitled', wizardValues: {}, totals: zeroTotals(), now });
		expect(values['Client.Company']).toBe('[Client company not provided]');
	});

	it('resolves Document.Total/Document.Date programmatically, ignoring any wizard-typed value for them', () => {
		const body = makeBody([
			{
				id: 'b1',
				type: 'text',
				locked: false,
				style: {},
				doc: { type: 'doc', content: [{ type: 'paragraph', content: [variableNode('Document.Total'), variableNode('Document.Date')] }] },
			},
		]);
		const totals = { ...zeroTotals(), total: money(150000) };
		const values = computeResolvedVariableValues({
			body,
			templateName: 'Untitled',
			wizardValues: { 'Document.Total': 'ignored', 'Document.Date': 'ignored' },
			totals,
			now,
		});
		expect(values['Document.Total']).toBe('$1,500.00');
		expect(values['Document.Date']).toBe('August 19, 2026');
	});

	it('includes tokens from the template name alongside inline ones', () => {
		const body = makeBody([]);
		const values = computeResolvedVariableValues({
			body,
			templateName: '[Client.Company] Proposal',
			wizardValues: { 'Client.Company': 'Acme Co' },
			totals: zeroTotals(),
			now,
		});
		expect(values['Client.Company']).toBe('Acme Co');
	});
});

describe('resolveTitle', () => {
	it('substitutes every known [Key] token', () => {
		expect(resolveTitle('[Client.Company] Cleaning Proposal', { 'Client.Company': 'Acme Co' })).toBe('Acme Co Cleaning Proposal');
	});

	it('leaves an unknown token literal rather than dropping it', () => {
		expect(resolveTitle('[Unknown.Key] Proposal', {})).toBe('[Unknown.Key] Proposal');
	});
});

describe('resolveVariablesInBody', () => {
	it('replaces an inline variable node in a text block with literal text', () => {
		const textBlock: TextBlock = {
			id: 'b1',
			type: 'text',
			locked: false,
			style: {},
			doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi ' }, variableNode('Client.Name')] }] },
		};
		const resolved = resolveVariablesInBody(makeBody([textBlock]), { 'Client.Name': 'Casey' });
		const resolvedBlock = resolved.pages[0]!.blocks[0] as TextBlock;
		expect(resolvedBlock.doc.content[0]!.content).toEqual([{ type: 'text', text: 'Hi ' }, { type: 'text', text: 'Casey' }]);
	});

	it('resolves a variable inside a table cell and inside a nested column, leaving a fillableField node untouched', () => {
		const tableBlock: TableBlock = {
			id: 'table-1',
			type: 'table',
			locked: false,
			style: {},
			rows: [{ cells: [{ doc: { type: 'doc', content: [{ type: 'paragraph', content: [variableNode('Client.Company')] }] }, colspan: 1, rowspan: 1, style: {} }] }],
			columnWidths: [1],
			headerRow: true,
		};
		const field = { type: 'fillableField', attrs: { field: { id: 'f1', type: 'text', roleId: 'role-1', name: 'Text field 1', required: false } } } as RichTextNode;
		const columnsBlock: ColumnsBlock = {
			id: 'columns-1',
			type: 'columns',
			locked: false,
			style: {},
			widths: [1],
			columns: [
				[
					{
						id: 'nested-text',
						type: 'text',
						locked: false,
						style: {},
						doc: { type: 'doc', content: [{ type: 'paragraph', content: [variableNode('Sender.Name'), field] }] },
					},
				],
			],
		};
		const resolved = resolveVariablesInBody(makeBody([tableBlock, columnsBlock]), { 'Client.Company': 'Acme Co', 'Sender.Name': 'Sam Rep' });

		const resolvedTable = resolved.pages[0]!.blocks[0] as TableBlock;
		expect(resolvedTable.rows[0]!.cells[0]!.doc.content[0]!.content).toEqual([{ type: 'text', text: 'Acme Co' }]);

		const resolvedColumns = resolved.pages[0]!.blocks[1] as ColumnsBlock;
		const nestedDoc = (resolvedColumns.columns[0]![0] as TextBlock).doc;
		expect(nestedDoc.content[0]!.content).toEqual([{ type: 'text', text: 'Sam Rep' }, field]);
	});
});

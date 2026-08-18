import { describe, expect, it } from 'vitest';
import { computeValidationIssues } from './computeValidationIssues';
import { makeBody, makeBodyWithFields, makeBodyWithImage, makeImageBlock } from '../commands/testFixtures';

describe('computeValidationIssues', () => {
	it('returns no issues for a clean body with no fields/variables/images', () => {
		expect(computeValidationIssues(makeBody(), 'Untitled template')).toEqual([]);
	});

	it('flags duplicate field names across the whole template (inline, standalone, and nested)', () => {
		const body = makeBodyWithFields();
		// makeBodyWithFields's four fields all get distinct default names —
		// force a collision the same way a rename could.
		body.pages[0]!.blocks.forEach((block) => {
			if (block.type === 'field') block.field.name = 'Signature 1';
		});
		const textBlock = body.pages[0]!.blocks.find((b) => b.id === 'block-text');
		if (textBlock?.type === 'text') {
			const fieldNode = textBlock.doc.content[0]?.content?.[0];
			if (fieldNode?.attrs) (fieldNode.attrs.field as { name: string }).name = 'Signature 1';
		}

		const issues = computeValidationIssues(body, 'Untitled template');
		const dup = issues.find((i) => i.id === 'dup-field-name-Signature 1');
		expect(dup).toBeDefined();
		expect(dup?.severity).toBe('error');
		expect(dup?.message).toContain('2 fields');
	});

	it('flags a system variable referenced inline with no default value', () => {
		const body = makeBody();
		const textBlock = body.pages[0]!.blocks[0];
		if (textBlock?.type === 'text') {
			textBlock.doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'variable', attrs: { key: 'Client.Name', fallback: null } }] }] };
		}
		const issues = computeValidationIssues(body, 'Untitled template');
		expect(issues.find((i) => i.id === 'unresolved-variable-Client.Name')).toMatchObject({ severity: 'warning' });
	});

	it('does not flag a custom variable that has a default value, but does flag one that has none', () => {
		const body = makeBody();
		body.variables = [
			{ key: 'Custom.WithDefault', label: 'With default', source: 'custom', defaultValue: 'x' },
			{ key: 'Custom.NoDefault', label: 'No default', source: 'custom' },
		];
		const textBlock = body.pages[0]!.blocks[0];
		if (textBlock?.type === 'text') {
			textBlock.doc = {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'variable', attrs: { key: 'Custom.WithDefault', fallback: null } },
							{ type: 'variable', attrs: { key: 'Custom.NoDefault', fallback: null } },
						],
					},
				],
			};
		}
		const issues = computeValidationIssues(body, 'Untitled template');
		expect(issues.find((i) => i.id === 'unresolved-variable-Custom.WithDefault')).toBeUndefined();
		expect(issues.find((i) => i.id === 'unresolved-variable-Custom.NoDefault')).toBeDefined();
	});

	it('flags a variable token in the template name itself', () => {
		const issues = computeValidationIssues(makeBody(), '[Client.Company] Proposal');
		expect(issues.find((i) => i.id === 'unresolved-variable-Client.Company')).toBeDefined();
	});

	it('deduplicates repeated references to the same unresolved variable into one issue', () => {
		const body = makeBody();
		const textBlock = body.pages[0]!.blocks[0];
		if (textBlock?.type === 'text') {
			textBlock.doc = {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{ type: 'variable', attrs: { key: 'Client.Name', fallback: null } },
							{ type: 'variable', attrs: { key: 'Client.Name', fallback: null } },
						],
					},
				],
			};
		}
		const issues = computeValidationIssues(body, 'Untitled template').filter((i) => i.id === 'unresolved-variable-Client.Name');
		expect(issues).toHaveLength(1);
	});

	it('flags an image with empty alt text but not one with alt text set', () => {
		const withoutAlt = makeBodyWithImage();
		expect(computeValidationIssues(withoutAlt, 'Untitled template').some((i) => i.id.startsWith('image-no-alt-'))).toBe(true);

		const withAlt = { ...withoutAlt, pages: [{ ...withoutAlt.pages[0]!, blocks: [makeImageBlock('image-1', { alt: 'A photo' })] }] };
		expect(computeValidationIssues(withAlt, 'Untitled template').some((i) => i.id.startsWith('image-no-alt-'))).toBe(false);
	});
});

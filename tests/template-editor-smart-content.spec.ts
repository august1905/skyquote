import { test, expect } from '@playwright/test';
import { openNewTemplate, saveNow, skipWizardDealStep, unpinSelectedBlock } from './templateFixture';

// §4.5's SmartContentBlock: a container shown/hidden by rules built against
// variables, pricing totals, and field values. Real backend, no mocking.
// Two things are exercised here: the authoring experience (wrap/insert,
// rule builder, preview toggle, unwrap) against the editor's own canvas, and
// the actual rule evaluation against a real recipient document — the part
// most likely to have a wiring bug, since it depends on the resolved
// variable values surviving the wizard's "freeze" round trip into
// `DocumentBody.resolvedVariableValues` (see src/smartContent/evaluateRules.ts).

test.describe('Smart content (§4.5)', () => {
	test('wraps a block via the toolbar, builds a rule, previews true/false, persists, and unwraps', async ({ page }) => {
		await openNewTemplate(page);

		// A custom variable, referenced only by the rule below (never inserted
		// as an inline chip) — exercises collectVariableKeys picking up a
		// rule-only reference.
		await page.getByRole('button', { name: 'Variables' }).click();
		await page.getByRole('button', { name: '+ Create custom variable' }).click();
		await page.getByLabel('Variable label').fill('Deal type');
		await page.getByRole('button', { name: 'Create', exact: true }).click();
		await page.getByRole('button', { name: 'Close variables panel' }).click();

		// A plain block, always visible. Unpinned (new blocks arrive pinned): this
		// test composes blocks in the flow, and a pinned block floating over the
		// wrapped one would intercept the rule chip's clicks.
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
		await unpinSelectedBlock(page);
		await page.locator('.canvas-block .ProseMirror').last().click();
		await page.keyboard.type('Public content');

		// A second block, to be wrapped.
		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
		await unpinSelectedBlock(page);
		const perkEditor = page.locator('.canvas-block .ProseMirror').last();
		await perkEditor.click();
		await page.keyboard.type('VIP-only perk');

		// Wrap it via the floating toolbar's "Smart content" icon. Scoped to the
		// toolbar because §3 ④'s Content panel also has a "Smart content" tile —
		// two legitimately identical accessible names, on different surfaces.
		await perkEditor.click();
		await page.locator('.canvas-block-toolbar').getByRole('button', { name: 'Smart content' }).click();
		const smartBlock = page.locator('.block-smart-content');
		await expect(smartBlock).toBeVisible();
		await expect(smartBlock.locator('.ProseMirror')).toHaveText('VIP-only perk');
		await expect(smartBlock.locator('.smart-content-rule-chip')).toHaveText('Always shown — no rules yet');

		// Build a rule: Deal type is VIP.
		await smartBlock.locator('.smart-content-rule-chip').click();
		const popover = smartBlock.locator('.smart-content-rule-popover');
		await popover.getByRole('button', { name: '+ Add rule' }).click();
		const ruleRow = popover.locator('.smart-content-rule-row').first();
		await ruleRow.locator('select').nth(0).selectOption('variable');
		await ruleRow.locator('select').nth(1).selectOption({ label: 'Deal type' });
		await ruleRow.locator('select').nth(2).selectOption('eq');
		await ruleRow.locator('input').fill('VIP');
		await popover.getByRole('button', { name: 'Save' }).click();

		await expect(smartBlock.locator('.smart-content-rule-chip')).toHaveText('Deal type is "VIP"');

		// Author-mode preview toggle — the real evaluation only ever runs
		// against a recipient's document, so this is a manual "as if" switch.
		// Clicks the header's name label specifically, not the block's overall
		// bounding box — the center of that would land inside
		// `.smart-content-children` and select the nested child block instead.
		await smartBlock.locator('.smart-content-name').click();
		await expect(smartBlock.locator('.ProseMirror')).toBeVisible();
		await smartBlock.getByLabel('Preview as if').selectOption('false');
		await expect(smartBlock.locator('.smart-content-hidden-note')).toBeVisible();
		await expect(smartBlock.locator('.ProseMirror')).toHaveCount(0);
		await smartBlock.getByLabel('Preview as if').selectOption('true');
		await expect(smartBlock.locator('.ProseMirror')).toBeVisible();

		await saveNow(page);
		await page.reload();

		const reloadedSmartBlock = page.locator('.block-smart-content');
		await expect(reloadedSmartBlock.locator('.smart-content-rule-chip')).toHaveText('Deal type is "VIP"');
		await expect(reloadedSmartBlock.locator('.ProseMirror')).toHaveText('VIP-only perk');

		// Unwrap — the block comes back out as a plain top-level block.
		await reloadedSmartBlock.locator('.smart-content-name').click();
		await reloadedSmartBlock.getByRole('button', { name: 'Remove wrapper' }).click();
		await expect(page.locator('.block-smart-content')).toHaveCount(0);
		await expect(page.locator('.canvas-block .ProseMirror', { hasText: 'VIP-only perk' })).toBeVisible();
	});

	test('a recipient sees smart content only when the resolved variable makes its rule true', async ({ page, context }) => {
		await openNewTemplate(page);

		await page.getByRole('button', { name: 'Recipients / Roles' }).click();
		await page.getByRole('button', { name: '+ Add role' }).click();
		await page.locator('.roles-panel-row').last().getByLabel('Role name').fill('Client');
		await page.getByRole('button', { name: 'Close roles panel' }).click();

		await page.getByRole('button', { name: 'Variables' }).click();
		await page.getByRole('button', { name: '+ Create custom variable' }).click();
		await page.getByLabel('Variable label').fill('Deal type');
		await page.getByRole('button', { name: 'Create', exact: true }).click();
		await page.getByRole('button', { name: 'Close variables panel' }).click();

		await page.getByRole('button', { name: '+ Add block' }).click();
		await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
		const perkEditor = page.locator('.canvas-block .ProseMirror').last();
		await perkEditor.click();
		await page.keyboard.type('VIP-only perk');

		await perkEditor.click();
		await page.locator('.canvas-block-toolbar').getByRole('button', { name: 'Smart content' }).click();
		const smartBlock = page.locator('.block-smart-content');
		await smartBlock.locator('.smart-content-rule-chip').click();
		const popover = smartBlock.locator('.smart-content-rule-popover');
		await popover.getByRole('button', { name: '+ Add rule' }).click();
		const ruleRow = popover.locator('.smart-content-rule-row').first();
		await ruleRow.locator('select').nth(0).selectOption('variable');
		await ruleRow.locator('select').nth(1).selectOption({ label: 'Deal type' });
		await ruleRow.locator('select').nth(2).selectOption('eq');
		await ruleRow.locator('input').fill('VIP');
		await popover.getByRole('button', { name: 'Save' }).click();

		await saveNow(page);

		async function createDocumentWithDealType(dealType: string, recipientEmail: string) {
			await page.getByRole('button', { name: 'Create document' }).click();
			const wizard = page.locator('.wizard-card');
			await expect(wizard.getByRole('heading', { name: 'Create document' })).toBeVisible();
			await skipWizardDealStep(wizard);
			await wizard.getByRole('button', { name: 'Next' }).click();

			await page.getByLabel('Client name').fill('Casey Client');
			await page.getByLabel('Client email').fill(recipientEmail);
			await wizard.getByRole('button', { name: 'Next' }).click();

			await page.getByLabel('Deal type').fill(dealType);
			await wizard.getByRole('button', { name: 'Next' }).click();

			await wizard.getByRole('button', { name: 'Next' }).click(); // Pricing step — no pricing blocks.
			await wizard.getByRole('button', { name: 'Create document' }).click();

			const linkInput = page.getByLabel('Casey Client link');
			await expect(linkInput).toBeVisible();
			const link = await linkInput.inputValue();
			await page.getByRole('button', { name: 'Done' }).click();
			await expect(page.locator('.wizard-overlay')).toHaveCount(0);
			return link;
		}

		const vipLink = await createDocumentWithDealType('VIP', 'casey-vip@example.com');
		const standardLink = await createDocumentWithDealType('Standard', 'casey-standard@example.com');

		const vipContext = await context.browser()!.newContext();
		const vipPage = await vipContext.newPage();
		await vipPage.goto(vipLink);
		await expect(vipPage.locator('h1')).toBeVisible();
		await expect(vipPage.getByText('VIP-only perk')).toBeVisible();
		await vipContext.close();

		const standardContext = await context.browser()!.newContext();
		const standardPage = await standardContext.newPage();
		await standardPage.goto(standardLink);
		await expect(standardPage.locator('h1')).toBeVisible();
		await expect(standardPage.getByText('VIP-only perk')).toHaveCount(0);
		await standardContext.close();
	});
});

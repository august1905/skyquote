import { test, expect, type Page } from '@playwright/test';
import { openNewTemplate, railButton } from './templateFixture';

// §13's accessibility line: "Full keyboard operation of toolbar/panels, ARIA
// on all controls, visible focus rings, alt text enforcement."
//
// Real backend, no mocking. These check the two things that were actually
// missing — Escape as a way out of every transient surface, and a focus ring
// on form controls — rather than re-asserting the ARIA labels that the rest of
// the suite already depends on for its own selectors.

/** §3 ①'s ⋮ overflow now owns Settings and Export PDF, matching the spec's own placement — so reaching them goes through the menu. */
async function fromTemplateMenu(page: Page, item: string) {
	await page.getByRole('button', { name: 'More template actions' }).click();
	await page.getByRole('menuitem', { name: item }).click();
}

async function newTemplate(page: Page) {
	await openNewTemplate(page);
}

test.describe('Keyboard operation and focus (§13)', () => {
	test('Escape closes every rail panel', async ({ page }) => {
		await newTemplate(page);

		// One handler in RightRail covers all of them, so all of them are worth
		// checking — a panel added later without its open state going through
		// there would fail here.
		for (const [railLabel, panelSelector] of [
			['Recipients / Roles', '.roles-panel'],
			['Variables', '.variables-panel'],
			['Catalog / Pricing', '.catalog-panel'],
			['Content Library', '.content-library-panel'],
			['Theme', '.theme-panel'],
		] as const) {
			await railButton(page, railLabel).click();
			await expect(page.locator(panelSelector)).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(page.locator(panelSelector)).toHaveCount(0);
		}
	});

	test('Escape closes the popovers and menus too, innermost first', async ({ page }) => {
		await newTemplate(page);

		// Page settings, reached through §3's ⋮ overflow where the spec puts it.
		await fromTemplateMenu(page, 'Settings');
		await expect(page.locator('.page-settings-panel')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.page-settings-panel')).toHaveCount(0);

		// The page `…` menu.
		await page.locator('.canvas-page-group').first().getByRole('button', { name: 'Page options' }).click();
		await expect(page.locator('.page-menu-popover')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.page-menu-popover')).toHaveCount(0);

		// The block toolbar's settings popover and its `⋯` overflow.
		await page.locator('.canvas-block').first().click();
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		await expect(page.locator('.block-settings-popover')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.block-settings-popover')).toHaveCount(0);

		await page.getByRole('button', { name: 'More block actions' }).click();
		await expect(page.locator('.canvas-block-overflow-menu')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.canvas-block-overflow-menu')).toHaveCount(0);
	});

	test('Escape inside a text block steps out of editing instead of closing an open panel', async ({ page }) => {
		await newTemplate(page);

		// The subtle rule: Escape means different things depending on where it
		// comes from, and text-edit wins. Closing a panel the user wasn't looking
		// at — and losing their caret — would be the wrong call.
		await railButton(page, 'Theme').click();
		await expect(page.locator('.theme-panel')).toBeVisible();

		await page.locator('.canvas-block .ProseMirror').first().click();
		await page.keyboard.type('Typing here');
		await page.keyboard.press('Escape');

		// Panel still open; the block stepped out of text-edit but stays selected.
		await expect(page.locator('.theme-panel')).toBeVisible();
		await expect(page.locator('.canvas-block-selected')).toHaveCount(1);
	});

	test('form controls show a visible focus ring, not just buttons', async ({ page }) => {
		await newTemplate(page);

		// The gap this closes: buttons had a global focus-visible ring, form
		// controls didn't — and the toolbar and panels are mostly selects.
		await page.locator('.canvas-block .ProseMirror').first().click();
		const paragraphStyle = page.getByLabel('Paragraph style');
		await expect(paragraphStyle).toBeEnabled();

		// `focus-visible` only matches for keyboard-driven focus, so this focuses
		// via the keyboard rather than a click.
		await paragraphStyle.evaluate((el: HTMLElement) => el.focus());
		await expect(paragraphStyle).toBeFocused();
		const outlineWidth = await paragraphStyle.evaluate((el) => getComputedStyle(el).outlineWidth);
		expect(parseFloat(outlineWidth)).toBeGreaterThan(0);
	});

	test('every rail icon sits centred in its own button', async ({ page }) => {
		await newTemplate(page);

		// Reported as "sidebar icons are not centered in their containers"
		// (Grayson, 2026-09-03). The cause was index.css's global
		// `button { padding: 0.6em 1.2em }`, which `.right-rail-icon` never
		// overrode: at 1.2em the horizontal padding alone outgrew the button's
		// declared 40px width, leaving a zero-width content box that the icon
		// overflowed to the right of — and turning the circular `+` into an
		// ellipse. Geometry, because that is exactly what was wrong and no
		// assertion about classes or styles would have caught it.
		const offsets = await page.evaluate(() =>
			[...document.querySelectorAll('.right-rail-icon')].map((button) => {
				const glyph = button.querySelector('svg') ?? button;
				const a = button.getBoundingClientRect();
				const b = glyph.getBoundingClientRect();
				return {
					label: button.getAttribute('aria-label'),
					dx: Math.round(b.left + b.width / 2 - (a.left + a.width / 2)),
					dy: Math.round(b.top + b.height / 2 - (a.top + a.height / 2)),
					square: Math.round(a.width) === Math.round(a.height),
				};
			})
		);
		expect(offsets.length).toBeGreaterThan(0);
		for (const icon of offsets) {
			expect(icon, `${icon.label} icon should be centred in a square button`).toEqual({ label: icon.label, dx: 0, dy: 0, square: true });
		}
	});

	test('every rail icon and canvas control carries an accessible name', async ({ page }) => {
		await newTemplate(page);

		// A name is what makes a control reachable by anything other than sight —
		// and it's what this whole suite's selectors rely on, so a nameless
		// control is both an accessibility bug and untestable.
		const nameless = await page.evaluate(() => {
			const controls = Array.from(document.querySelectorAll('button, input, select'));
			return controls
				.filter((el) => {
					const label = el.getAttribute('aria-label') ?? '';
					const text = (el.textContent ?? '').trim();
					const labelled = el.getAttribute('aria-labelledby') ?? '';
					const title = el.getAttribute('title') ?? '';
					const wrappingLabel = el.closest('label')?.textContent?.trim() ?? '';
					return !label && !text && !labelled && !title && !wrappingLabel;
				})
				.map((el) => `${el.tagName.toLowerCase()}.${el.className || '(no class)'}`);
		});
		expect(nameless).toEqual([]);
	});
});

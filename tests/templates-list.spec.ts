import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// The Templates list page (BASIC_ARCHITECHTURE.md: folders + individuals,
// searchable by name, no tabs) plus its row actions and folder management.
//
// Real backend, no mocking — same convention as the rest of this suite.
//
// **Every assertion here is made through the search box**, never against the
// whole table. This backend is shared and long-lived: the rest of the suite
// creates a template per test and has no route to clean it up, so the root
// listing holds hundreds of rows named "Untitled template". A test that reached
// for `.first()` or counted rows would be asserting on the accumulated history
// of every previous run. Searching for a unique fixture prefix makes each test
// independent of that, which is a property worth having regardless of how tidy
// the data happens to be today.

const BACKEND = `http://localhost:${process.env.CATALYST_SERVE_PORT || '3000'}/server/skyquote_function`;

/**
 * Shared by every fixture this spec creates, and swept **both before and after**
 * each test — not just in a `finally`. A test that times out never reaches its
 * cleanup, so cleaning up front is what makes a run independent of how the
 * previous one exited. Same reasoning as
 * `template-editor-content-library.spec.ts`, which carries the longer note.
 *
 * Matched with `includes` rather than `startsWith` because "Duplicate" names the
 * copy `Copy of zz-list-…`, which would otherwise survive the sweep and then
 * collide with the next run's search assertions.
 */
const FIXTURE_PREFIX = 'zz-list-';

interface TemplateRow {
	id: string;
	name: string;
	folderId: string | null;
}

interface FolderRow {
	id: string;
	name: string;
}

async function cleanupFixtures(request: APIRequestContext) {
	try {
		const templateResponse = await request.get(`${BACKEND}/templates`);
		if (templateResponse.ok()) {
			const { templates } = (await templateResponse.json()) as { templates: TemplateRow[] };
			for (const template of templates) {
				if (template.name.includes(FIXTURE_PREFIX)) await request.delete(`${BACKEND}/templates/${template.id}`);
			}
		}
		// Folders after templates: a folder only deletes once it's empty, and the
		// templates that were in it have just been deleted.
		const folderResponse = await request.get(`${BACKEND}/folders?kind=template`);
		if (folderResponse.ok()) {
			const folders = (await folderResponse.json()) as FolderRow[];
			// Deepest first, so a parent isn't refused because a child of it is still
			// waiting its turn in this same loop.
			for (const folder of [...folders].reverse()) {
				if (folder.name.includes(FIXTURE_PREFIX)) await request.delete(`${BACKEND}/folders/${folder.id}`);
			}
		}
	} catch {
		// Never mask the test's own failure: when a test times out Playwright has
		// already disposed the request context, and a throw here would replace the
		// real diagnosis with "context has been closed".
	}
}

async function createTemplate(request: APIRequestContext, name: string): Promise<string> {
	const response = await request.post(`${BACKEND}/templates`, { data: { name } });
	expect(response.ok()).toBeTruthy();
	const { meta } = (await response.json()) as { meta: TemplateRow };
	return meta.id;
}

/** Searching is how every test scopes itself to its own fixtures — see the note at the top. */
async function search(page: Page, term: string) {
	await page.getByLabel('Search templates').fill(term);
}

/**
 * Rows are located by the **exact** accessible name of their name button, not by
 * `hasText`.
 *
 * Both looser options are actively wrong here. `hasText` is a substring match, so
 * a row for `zz-list-x` also matches the `Copy of zz-list-x` that Duplicate
 * creates — and a non-exact `getByRole` matches the row's own `⋮` too, whose
 * aria-label is "More actions for {name}". Both showed up as strict-mode
 * violations the first time this spec ran.
 */
function row(page: Page, name: string) {
	return page.locator('.templates-row').filter({ has: page.getByRole('button', { name, exact: true }) });
}

/** Folder rows render their name with a `📁`, which is part of the accessible name. */
function folderRow(page: Page, name: string) {
	return page.locator('.templates-row-folder').filter({ has: page.getByRole('button', { name: `📁 ${name}`, exact: true }) });
}

async function openRowMenu(page: Page, name: string) {
	await row(page, name).getByRole('button', { name: `More actions for ${name}` }).click();
}

async function openFolderMenu(page: Page, name: string) {
	await folderRow(page, name).getByRole('button', { name: `More actions for folder ${name}` }).click();
}

test.describe('Templates list', () => {
	/**
	 * Once for the file, not once per test.
	 *
	 * The sweep exists for two different reasons and they need different
	 * frequencies. Recovering from a **previous run** that died before its cleanup
	 * is a once-per-file job — that is this hook. Keeping one test's fixtures out of
	 * the next one's assertions is a per-test job, and that is `afterEach` below,
	 * which Playwright runs even when a test fails or times out.
	 *
	 * Running the full sweep in both hooks meant 22 passes for 11 tests, and each
	 * pass is a paged `GET /templates` *with* its owner-name lookup plus a
	 * `GET /folders`. This is the most expensive file in the suite (95.6s measured),
	 * and half of that cleanup was buying nothing: every fixture here is named with a
	 * per-test suffix and every assertion is scoped through the search box, so a
	 * leftover from one test cannot match another's query.
	 */
	test.beforeAll(async ({ request }) => {
		await cleanupFixtures(request);
	});

	test.afterEach(async ({ request }) => {
		await cleanupFixtures(request);
	});

	test('lists existing templates, shows their owner, and opens one in the editor', async ({ page, request }) => {
		const name = `${FIXTURE_PREFIX}open-me`;
		await createTemplate(request, name);

		await page.goto('/templates');
		await search(page, name);

		const target = row(page, name);
		await expect(target).toBeVisible();
		// The owner comes from a separate lookup on the backend rather than being
		// denormalized onto the template row, so a blank cell here means that
		// lookup silently failed.
		await expect(target).toContainText('Shared Tester');

		await target.getByRole('button', { name, exact: true }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);
		await expect(page.locator('.template-name-display')).toContainText(name);
	});

	test('a new folder holds a moved template, and navigating into it and back out works', async ({ page, request }) => {
		const templateName = `${FIXTURE_PREFIX}filed`;
		const folderName = `${FIXTURE_PREFIX}folder`;
		await createTemplate(request, templateName);

		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New folder' }).click();
		await page.getByLabel('Folder name').fill(folderName);
		await page.getByRole('button', { name: 'Create folder' }).click();
		await expect(folderRow(page, folderName)).toBeVisible();

		// Move it in through the row menu, which opens the same dialog §3's header
		// chip opens — one move flow, three entry points.
		await search(page, templateName);
		await openRowMenu(page, templateName);
		await page.getByRole('menuitem', { name: 'Move' }).click();
		await page.getByRole('dialog', { name: 'Move template' }).getByRole('button', { name: folderName }).click();
		await expect(page.getByRole('dialog', { name: 'Move template' })).toHaveCount(0);

		// At the root it's gone; inside the folder it's there. Clearing the search
		// is what puts the folder view back.
		await search(page, '');
		await expect(row(page, templateName)).toHaveCount(0);

		await folderRow(page, folderName).getByRole('button', { name: `📁 ${folderName}`, exact: true }).click();
		await expect(page.locator('.templates-breadcrumb')).toContainText(folderName);
		await expect(row(page, templateName)).toBeVisible();

		// And back out. "All templates" is the root, which is a real destination
		// rather than a missing folder.
		await page.getByRole('button', { name: 'All templates', exact: true }).click();
		await expect(row(page, templateName)).toHaveCount(0);
	});

	test('search reaches into folders and says which one each match is in', async ({ page, request }) => {
		const templateName = `${FIXTURE_PREFIX}buried`;
		const folderName = `${FIXTURE_PREFIX}deep`;
		const id = await createTemplate(request, templateName);
		const folder = await request.post(`${BACKEND}/folders`, { data: { name: folderName, kind: 'template' } });
		const { id: folderId } = (await folder.json()) as FolderRow;
		await request.patch(`${BACKEND}/templates/${id}`, { data: { folderId } });

		await page.goto('/templates');
		// Standing at the root, where this template is not — a search scoped to the
		// open folder would find nothing, which is the bug this guards.
		await search(page, templateName);
		const match = row(page, templateName);
		await expect(match).toBeVisible();
		await expect(match).toContainText(`in ${folderName}`);
	});

	test('Rename edits the name in place and persists it', async ({ page, request }) => {
		const name = `${FIXTURE_PREFIX}before-rename`;
		const renamed = `${FIXTURE_PREFIX}after-rename`;
		await createTemplate(request, name);

		await page.goto('/templates');
		await search(page, name);
		await openRowMenu(page, name);
		await page.getByRole('menuitem', { name: 'Rename' }).click();

		const input = page.getByLabel('New name');
		await expect(input).toBeVisible();
		await input.fill(renamed);
		await input.press('Enter');

		await search(page, renamed);
		await expect(row(page, renamed)).toBeVisible();

		// Went through PATCH, so it survives a reload.
		await page.reload();
		await search(page, renamed);
		await expect(row(page, renamed)).toBeVisible();
	});

	test('Escape abandons a rename instead of committing it on the way out', async ({ page, request }) => {
		const name = `${FIXTURE_PREFIX}keep-my-name`;
		await createTemplate(request, name);

		await page.goto('/templates');
		await search(page, name);
		await openRowMenu(page, name);
		await page.getByRole('menuitem', { name: 'Rename' }).click();

		// The input commits on blur, so Escape has to cancel *before* the blur it
		// causes — otherwise "never mind" would save the half-typed name.
		await page.getByLabel('New name').fill(`${FIXTURE_PREFIX}typed-by-mistake`);
		await page.getByLabel('New name').press('Escape');

		await expect(row(page, name)).toBeVisible();
		await search(page, `${FIXTURE_PREFIX}typed-by-mistake`);
		await expect(page.getByText(/Nothing matches/)).toBeVisible();
	});

	test('Duplicate leaves a copy in the list without opening it', async ({ page, request }) => {
		const name = `${FIXTURE_PREFIX}duplicate-me`;
		await createTemplate(request, name);

		await page.goto('/templates');
		await search(page, name);
		await openRowMenu(page, name);
		await page.getByRole('menuitem', { name: 'Duplicate' }).click();

		// Stays on the list, unlike the editor's own Duplicate: someone duplicating
		// from here is organizing, not editing.
		await expect(page).toHaveURL(/\/templates$/);
		await expect(row(page, `Copy of ${name}`)).toBeVisible();
		await expect(row(page, name)).toBeVisible();
	});

	test('Delete confirms first, then the row is gone', async ({ page, request }) => {
		const name = `${FIXTURE_PREFIX}delete-me`;
		await createTemplate(request, name);

		await page.goto('/templates');
		await search(page, name);
		await openRowMenu(page, name);
		await page.getByRole('menuitem', { name: 'Delete' }).click();

		// One click doesn't delete.
		await expect(page.getByText('Delete this template?')).toBeVisible();
		await page.getByRole('button', { name: 'Keep it' }).click();
		await expect(row(page, name)).toBeVisible();

		// The menu is still open, so it isn't reopened — clicking ⋮ again would
		// close it.
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		await page.getByRole('button', { name: 'Yes, delete' }).click();
		await expect(row(page, name)).toHaveCount(0);
	});

	test('a folder with contents refuses to delete and says why, then deletes once emptied', async ({ page, request }) => {
		const templateName = `${FIXTURE_PREFIX}blocking`;
		const folderName = `${FIXTURE_PREFIX}occupied`;
		const id = await createTemplate(request, templateName);
		const folder = await request.post(`${BACKEND}/folders`, { data: { name: folderName, kind: 'template' } });
		const { id: folderId } = (await folder.json()) as FolderRow;
		await request.patch(`${BACKEND}/templates/${id}`, { data: { folderId } });

		await page.goto('/templates');
		await openFolderMenu(page, folderName);
		await page.getByRole('menuitem', { name: 'Delete' }).click();

		// The refusal is deliberate — cascading would destroy or orphan what's
		// inside — and the backend's own message is shown because "that folder still
		// has things in it" tells the user what to do next.
		await expect(page.getByRole('alert')).toContainText('still has things in it');
		await expect(folderRow(page, folderName)).toBeVisible();

		// Empty it and try again.
		await request.delete(`${BACKEND}/templates/${id}`);
		await page.reload();
		await openFolderMenu(page, folderName);
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		await expect(folderRow(page, folderName)).toHaveCount(0);
	});

	test('sorting by last updated is a different order from sorting by name', async ({ page, request }) => {
		// Named so the two orders disagree: alphabetically "…sort-a" comes first,
		// but "…sort-b" is the one touched most recently.
		const first = `${FIXTURE_PREFIX}sort-b-older`;
		const second = `${FIXTURE_PREFIX}sort-a-newer`;
		const firstId = await createTemplate(request, first);
		await createTemplate(request, second);

		// Catalyst's MODIFIEDTIME has second granularity, so two writes inside the
		// same second are genuinely indistinguishable to a sort — this waits out
		// that granularity rather than hoping the round trips are slow enough.
		await new Promise((resolve) => setTimeout(resolve, 1100));
		await request.patch(`${BACKEND}/templates/${firstId}`, { data: { name: first } });

		await page.goto('/templates');
		await search(page, `${FIXTURE_PREFIX}sort-`);

		const names = page.locator('.templates-row .templates-name-button');
		await expect(names).toHaveCount(2);
		await expect(names.nth(0)).toHaveText(second);

		await page.getByRole('button', { name: 'Last updated' }).click();
		await expect(names.nth(0)).toHaveText(first);
	});

	test('a search with no matches says so rather than showing an empty table', async ({ page }) => {
		await page.goto('/templates');
		await search(page, `${FIXTURE_PREFIX}definitely-not-here`);
		await expect(page.getByText(`Nothing matches “${FIXTURE_PREFIX}definitely-not-here”.`)).toBeVisible();
		await expect(page.locator('.templates-table')).toHaveCount(0);
	});

	/**
	 * The **only** test that clicks "+ New template", and deliberately so.
	 *
	 * Every editor spec used to open by clicking it, which meant ~65 loads of this
	 * whole list page per run to reach a screen none of them were testing — they
	 * create through the API now (`tests/templateFixture.ts`). That left the real
	 * button uncovered, which is why this exists: the create path is a primary user
	 * action, and it belongs to the screen that owns the button rather than being
	 * an incidental side effect of unrelated specs.
	 */
	test('+ New template creates one and opens it in the editor @core', async ({ page, request }) => {
		await page.goto('/templates');
		await page.getByRole('button', { name: '+ New template' }).click();
		await page.waitForURL(/\/templates\/.+\/edit/);

		// A real, editable blank template — not just a URL change.
		await expect(page.locator('.canvas-page')).toBeVisible();
		await expect(page.locator('.canvas-block')).toHaveCount(1);
		await expect(page.locator('.template-editor-header')).toContainText('TEMPLATES');

		const createdId = /\/templates\/([^/]+)\/edit/.exec(page.url())?.[1];
		expect(createdId).toBeTruthy();
		// Deleted here rather than left to the global teardown: this one is named
		// "Untitled template" like everything else, so cleaning it up immediately
		// keeps the row count honest for the searches above.
		if (createdId) await request.delete(`${BACKEND}/templates/${createdId}`);
	});
});

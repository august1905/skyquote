import { request } from '@playwright/test';
import { STORAGE_STATE_PATH } from './auth-storage-state';

/**
 * Deletes the templates and documents the suite created, after the whole run.
 *
 * Most editor specs create a template per test (`+ New template`) and have no
 * route back to it once the test ends, so every run left ~30 `Untitled template`
 * rows behind. That is not a tidiness problem — it compounds. `GET /templates`
 * pages through every row and resolves owner names, so at 763 rows it took 1.7s,
 * and `templates-list.spec.ts`'s per-test cleanup (list, then delete each match)
 * started blowing its 30s budget: four specs failed on the accumulated history of
 * previous runs rather than on anything they did. Before that it was 4,152 rows,
 * cleaned out by hand.
 *
 * **Scoped by owner id, never by name.** Everything is deleted that belongs to
 * the shared test account — not rows matching `Untitled template`, which is also
 * what a real person gets when they click "+ New template" and don't rename it.
 * The account exists solely for this suite (global-setup creates it), so "owned
 * by it" is the safe definition of "ours", and it's self-healing: a run killed
 * halfway still gets swept by the next one.
 *
 * Individual specs keep their own `zz-`-prefixed sweeps. Those run *between*
 * tests, which is what stops one test's fixtures from colliding with the next
 * one's assertions; this only catches what's left at the end.
 */
export default async function globalTeardown(): Promise<void> {
	const ctx = await request.newContext({ baseURL: 'http://localhost:5173', storageState: STORAGE_STATE_PATH });

	try {
		const me = await ctx.get('/api/auth/me');
		if (!me.ok()) {
			// Never fail a run here: the suite has finished, and a teardown that
			// throws turns a green run red for reasons that have nothing to do with
			// the code under test.
			console.warn(`global-teardown: skipped, couldn't identify the test user (${me.status()})`);
			return;
		}
		// `GET /auth/me` returns the user object flat, not wrapped in `{ user }`.
		const user = (await me.json()) as { id: string };
		if (!user?.id) {
			console.warn('global-teardown: skipped, /auth/me returned no user id');
			return;
		}

		const removed = { templates: 0, documents: 0 };

		/**
		 * Deletes in bounded batches rather than one at a time.
		 *
		 * A full run leaves ~160 rows behind, and deleting them serially was **60-90s
		 * of pure wall clock on the end of every suite** — each `DELETE` is a real
		 * round trip, and a template's is a cascade (versions, comments, Stratus
		 * objects). Nothing here is order-dependent within a kind, so the only reason
		 * it was serial was the shape of the loop.
		 *
		 * Capped at 6 in flight, not unbounded: `catalyst serve` is a single process,
		 * and firing 160 concurrent cascades at it trades a slow teardown for an
		 * unreliable one. 6 is well inside what the suite's own 2 workers already
		 * push through it.
		 */
		async function deleteAll(paths: string[]): Promise<number> {
			const CONCURRENCY = 6;
			let done = 0;
			const queue = [...paths];
			await Promise.all(
				Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
					for (let next = queue.pop(); next; next = queue.pop()) {
						// Individually guarded: one 404 (another run swept it first) must not
						// abandon the rest of the batch.
						try {
							if ((await ctx.delete(next)).ok()) done += 1;
						} catch {
							/* leave it for the next run's sweep */
						}
					}
				})
			);
			return done;
		}

		// Documents first: a document is created *from* a template, and deleting
		// the template it came from doesn't take it with it.
		const documentsRes = await ctx.get('/api/documents');
		if (documentsRes.ok()) {
			const { documents } = (await documentsRes.json()) as { documents: { id: string; createdBy: string }[] };
			removed.documents = await deleteAll(
				documents.filter((doc) => doc.createdBy === user.id).map((doc) => `/api/documents/${doc.id}`)
			);
		}

		const templatesRes = await ctx.get('/api/templates');
		if (templatesRes.ok()) {
			const { templates } = (await templatesRes.json()) as { templates: { id: string; createdBy: string }[] };
			removed.templates = await deleteAll(
				templates.filter((template) => template.createdBy === user.id).map((template) => `/api/templates/${template.id}`)
			);
		}

		if (removed.templates || removed.documents) {
			console.log(`global-teardown: removed ${removed.templates} templates and ${removed.documents} documents created by the test account`);
		}
	} catch (err) {
		console.warn('global-teardown: sweep failed, leaving fixtures behind', err);
	} finally {
		await ctx.dispose();
	}
}

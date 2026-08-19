import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Merges the app's own vite.config (the @vitejs/plugin-react-swc plugin,
// the /api dev proxy) rather than duplicating it, so the two configs can't
// silently drift apart.
export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			// 'node', not 'jsdom': everything tested so far (types.ts, the API
			// clients) is plain logic with no DOM. Switch a given test file to
			// jsdom via a `// @vitest-environment jsdom` docblock once component
			// tests are added, rather than paying jsdom's cost for every file.
			environment: 'node',
			include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
			// Only affects jsdom-environment files in practice (jest-dom's
			// matchers are DOM-only), but cheap enough to load unconditionally
			// rather than needing every component test file to import it itself.
			setupFiles: ['./src/test/setup.ts'],
		},
	})
)

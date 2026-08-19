// Registers jest-dom's matchers (toBeInTheDocument, toBeDisabled, etc.) on
// vitest's `expect` — only loaded for jsdom-environment test files (see
// vitest.config.ts's `setupFiles`), since plain-logic tests never need it.
import '@testing-library/jest-dom/vitest';

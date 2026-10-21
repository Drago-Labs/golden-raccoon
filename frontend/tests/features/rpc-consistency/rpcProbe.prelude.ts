/**
 * The shared Vitest setup clears localStorage after each test.
 * This file gives the Node environment a stand-in so that cleanup can run.
 */
const browserStub = globalThis as { window?: { localStorage: { clear: () => void } } };

browserStub.window ??= {
  localStorage: {
    clear() {},
  },
};

/* eslint-disable @typescript-eslint/no-require-imports --
 * A `--require` preload hook runs before any ESM loader exists, so it has to be
 * CommonJS. Same constraint as `stub-server-only.cjs`.
 */

/**
 * Stubs `next/navigation` so route boundaries can be rendered outside a Next
 * runtime (issue #134).
 *
 * `error.tsx` components are ordinary React components, but they call
 * `useRouter`, which throws without an app router mounted. Stubbing the module
 * lets the check script render the real boundary files rather than a copy of
 * their markup.
 */
const Module = require("module");

const originalLoad = Module._load;

const navigationStub = {
  useRouter: () => ({
    back: () => {},
    push: () => {},
    replace: () => {},
    refresh: () => {},
    forward: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  notFound: () => {
    const error = new Error("NEXT_NOT_FOUND");
    error.digest = "NEXT_NOT_FOUND";
    throw error;
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
};

Module._load = function (request) {
  if (request === "server-only") return {};
  if (request === "next/navigation") return navigationStub;
  return originalLoad.apply(this, arguments);
};

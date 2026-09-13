/**
 * Aligns the ambient `Uint8Array` with Node's, for this feature's tests only.
 *
 * Under vitest's jsdom environment the global `Uint8Array` comes from the
 * jsdom realm, while `Buffer` still comes from Node's. A Node `Buffer` is
 * therefore *not* `instanceof Uint8Array`, and the XDR codec inside
 * `@stellar/stellar-sdk` asserts on exactly that check — so building or
 * parsing an envelope throws in the test environment while working perfectly
 * in the Node server the route actually runs on.
 *
 * Importing this module first restores the invariant the SDK expects. It
 * touches nothing outside the test process: vitest gives each test file its
 * own environment, and production code never loads this file.
 */
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype)?.constructor as typeof Uint8Array | undefined;

if (nodeUint8Array && !(Buffer.from("") instanceof Uint8Array)) {
  (globalThis as { Uint8Array: typeof Uint8Array }).Uint8Array = nodeUint8Array;
}

export const typedArrayRealmAligned = Buffer.from("") instanceof Uint8Array;

/**
 * Decoding of standardized proxy storage slots.
 *
 * Everything here is a pure function over a raw 32-byte word. The important
 * behavior is what it *refuses* to do: a word whose upper 12 bytes are
 * non-zero is not quietly truncated into an address. It is reported dirty, so
 * a slot collision with unrelated state cannot be mistaken for an
 * implementation pointer.
 */
import {
  STANDARD_SLOTS,
  ZERO_ADDRESS,
  type SlotObservation,
  type StandardSlotKey,
} from "./schema";

/** Slots read on every inspection, in the order they appear in the report. */
export const INSPECTED_SLOT_KEYS: StandardSlotKey[] = [
  "erc1967Implementation",
  "erc1967Beacon",
  "erc1967Admin",
  "legacyZeppelinImplementation",
  "eip1822Proxiable",
];

function normalizeWord(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();

  if (!/^0x[0-9a-f]*$/.test(trimmed)) return null;

  const body = trimmed.slice(2);

  // Readers differ: some return a short word, some a padded one. Both are
  // normalized to 32 bytes rather than rejected, but anything longer is not a
  // storage word and is refused.
  if (body.length > 64) return null;

  return `0x${body.padStart(64, "0")}`;
}

export function decodeSlotWord(slotKey: StandardSlotKey, raw: string | null, unavailableReason: string | null): SlotObservation {
  const descriptor = STANDARD_SLOTS[slotKey];
  const base = {
    slotKey,
    slot: descriptor.slot,
    label: descriptor.label,
    standard: descriptor.standard,
  };

  if (raw === null) {
    return {
      ...base,
      rawValue: null,
      decodedAddress: null,
      isZero: false,
      isDirty: false,
      unavailableReason: unavailableReason ?? "The storage read did not complete.",
    };
  }

  const word = normalizeWord(raw);

  if (word === null) {
    return {
      ...base,
      rawValue: raw,
      decodedAddress: null,
      isZero: false,
      isDirty: true,
      unavailableReason: "The storage word was not a readable 32-byte value.",
    };
  }

  const upper = word.slice(2, 26);
  const lower = word.slice(26);
  const isDirty = /[1-9a-f]/.test(upper);
  const isZero = !/[1-9a-f]/.test(word.slice(2));

  return {
    ...base,
    rawValue: word,
    decodedAddress: isZero || isDirty ? null : `0x${lower}`,
    isZero,
    isDirty,
    unavailableReason: null,
  };
}

/** True when the slot holds a usable, non-zero address. */
export function holdsAddress(observation: SlotObservation): boolean {
  return observation.decodedAddress !== null && observation.decodedAddress !== ZERO_ADDRESS;
}

export function findSlot(slots: SlotObservation[], slotKey: StandardSlotKey): SlotObservation | undefined {
  return slots.find((slot) => slot.slotKey === slotKey);
}

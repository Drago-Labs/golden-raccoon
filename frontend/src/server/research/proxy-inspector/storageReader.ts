/**
 * Reads of the standardized slots at one address and one block.
 *
 * Each slot is read independently and a failure is recorded against that slot
 * alone. One unavailable slot degrades the report to partial; it does not
 * erase the four slots that were read successfully.
 */
import { readerMessage } from "./codeReader";
import { INSPECTED_SLOT_KEYS, decodeSlotWord } from "./standardSlots";
import { STANDARD_SLOTS, type ChainReader, type SlotObservation } from "./schema";

export async function readStandardSlots(
  reader: ChainReader,
  address: string,
  block: string,
): Promise<SlotObservation[]> {
  const observations: SlotObservation[] = [];

  for (const slotKey of INSPECTED_SLOT_KEYS) {
    const descriptor = STANDARD_SLOTS[slotKey];

    try {
      const raw = await reader.getStorageAt(address, descriptor.slot, block);
      observations.push(decodeSlotWord(slotKey, raw, null));
    } catch (error) {
      observations.push(decodeSlotWord(slotKey, null, readerMessage(error, "The storage read did not complete.")));
    }
  }

  return observations;
}

/**
 * EVM calldata decoding, restricted to an allowlist.
 *
 * There is no ABI discovery here, and that is the point. A selector this
 * module does not recognize is reported as unknown — with its four bytes and
 * its argument words shown raw — rather than guessed at from a signature
 * database. A wrong guess about what a selector does is more dangerous than no
 * guess at all, because the user would act on it.
 */
import { assertWellFormedCalldata } from "./payloadLimits";
import {
  ALLOWLISTED_SELECTORS,
  MAX_UINT256,
  type AllowlistedSelector,
  type Permission,
  type UnknownField,
} from "./schema";

export type CalldataDecoding = {
  selector: string | null;
  signature: string | null;
  /** 32-byte argument words, exactly as encoded. */
  words: string[];
  permissions: Permission[];
  unknownFields: UnknownField[];
  summary: string;
};

function wordToAddress(word: string): string | null {
  if (word.length !== 64) return null;
  if (/[1-9a-f]/i.test(word.slice(0, 24))) return null;

  return `0x${word.slice(24).toLowerCase()}`;
}

function wordToUint(word: string): string {
  return BigInt(`0x${word}`).toString();
}

export function decodeCalldata(data: string, subject: string | null): CalldataDecoding {
  assertWellFormedCalldata(data);

  const body = data.slice(2).toLowerCase();

  if (body.length === 0) {
    return {
      selector: null,
      signature: null,
      words: [],
      permissions: [],
      unknownFields: [],
      summary: "The payload carries no calldata. It would move native value only, if any is attached.",
    };
  }

  if (body.length < 8) {
    return {
      selector: null,
      signature: null,
      words: [],
      permissions: [],
      unknownFields: [
        {
          location: "calldata",
          description: "The calldata is shorter than a four-byte selector, so nothing can be identified in it.",
          raw: data,
        },
      ],
      summary: "The calldata is too short to contain a function selector.",
    };
  }

  const selector = `0x${body.slice(0, 8)}`;
  const argsHex = body.slice(8);
  const words: string[] = [];

  for (let offset = 0; offset + 64 <= argsHex.length; offset += 64) {
    words.push(argsHex.slice(offset, offset + 64));
  }

  const trailing = argsHex.length % 64;
  const unknownFields: UnknownField[] = [];

  if (trailing !== 0) {
    unknownFields.push({
      location: "calldata.arguments",
      description: "The argument data does not end on a 32-byte boundary; the trailing bytes were not interpreted.",
      raw: `0x${argsHex.slice(argsHex.length - trailing)}`,
    });
  }

  const descriptor = (ALLOWLISTED_SELECTORS as Record<string, (typeof ALLOWLISTED_SELECTORS)[AllowlistedSelector]>)[selector];

  if (!descriptor) {
    unknownFields.push({
      location: "calldata.selector",
      description: "This selector is not on the allowlist. The inspector will not guess what it does.",
      raw: selector,
    });

    words.forEach((word, index) => {
      unknownFields.push({
        location: `calldata.arguments[${index}]`,
        description: "An argument word of an unrecognized function, shown raw.",
        raw: `0x${word}`,
      });
    });

    return {
      selector,
      signature: null,
      words,
      permissions: [],
      unknownFields,
      summary: `The calldata calls an unrecognized function (${selector}). What it would do is unknown.`,
    };
  }

  const permissions: Permission[] = [];
  const expectedWords = descriptor.args.length;

  if (words.length < expectedWords) {
    unknownFields.push({
      location: "calldata.arguments",
      description: `${descriptor.signature} needs ${expectedWords} argument words but the calldata carries ${words.length}.`,
      raw: `0x${argsHex}`,
    });

    return {
      selector,
      signature: descriptor.signature,
      words,
      permissions,
      unknownFields,
      summary: `The calldata claims to be ${descriptor.signature} but is truncated, so its arguments were not read.`,
    };
  }

  if (words.length > expectedWords) {
    unknownFields.push({
      location: "calldata.arguments",
      description: "The calldata carries more argument words than the function takes; the extra words were not interpreted.",
      raw: `0x${words.slice(expectedWords).join("")}`,
    });
  }

  if (descriptor.name === "transfer") {
    const recipient = wordToAddress(words[0]);
    const amount = wordToUint(words[1]);

    permissions.push({
      permissionId: "evm-transfer",
      kind: "token_transfer",
      spender: null,
      recipient,
      subject,
      amountRaw: amount,
      isUnlimited: false,
      deadline: null,
      rawProvenance: `selector ${selector}, argument words 0 and 1`,
      consequence: "Signing and sending this moves the stated amount of the token to the recipient immediately.",
    });

    if (recipient === null) {
      unknownFields.push({
        location: "calldata.arguments[0]",
        description: "The recipient word is not address-shaped, so no recipient was decoded from it.",
        raw: `0x${words[0]}`,
      });
    }
  }

  if (descriptor.name === "approve" || descriptor.name === "increaseAllowance" || descriptor.name === "decreaseAllowance") {
    const spender = wordToAddress(words[0]);
    const amount = wordToUint(words[1]);
    const kind =
      descriptor.name === "approve" ? "token_approval" : descriptor.name === "increaseAllowance" ? "allowance_increase" : "allowance_decrease";

    permissions.push({
      permissionId: `evm-${descriptor.name}`,
      kind,
      spender,
      recipient: null,
      subject,
      amountRaw: amount,
      isUnlimited: amount === MAX_UINT256,
      deadline: null,
      rawProvenance: `selector ${selector}, argument words 0 and 1`,
      consequence:
        amount === MAX_UINT256
          ? "Signing and sending this lets the spender move the entire balance of this token, now and at any time in the future, until the approval is revoked."
          : descriptor.name === "decreaseAllowance"
            ? "Signing and sending this reduces what the spender may move by the stated amount."
            : "Signing and sending this lets the spender move up to the stated amount of this token until the approval is changed.",
    });
  }

  if (descriptor.name === "transferFrom") {
    const from = wordToAddress(words[0]);
    const to = wordToAddress(words[1]);
    const amount = wordToUint(words[2]);

    permissions.push({
      permissionId: "evm-transferFrom",
      kind: "transfer_from",
      spender: from,
      recipient: to,
      subject,
      amountRaw: amount,
      isUnlimited: amount === MAX_UINT256,
      deadline: null,
      rawProvenance: `selector ${selector}, argument words 0, 1 and 2`,
      consequence: "Signing and sending this moves the stated amount out of the from-address, using an allowance that must already exist.",
    });
  }

  return {
    selector,
    signature: descriptor.signature,
    words,
    permissions,
    unknownFields,
    summary: `The calldata calls ${descriptor.signature}.`,
  };
}

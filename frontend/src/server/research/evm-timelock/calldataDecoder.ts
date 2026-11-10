import { lookupFunctionSig } from "./abiSource";
import type { DecodedTimelockCall } from "./schema";

export function decodeTimelockCall(input: {
  index: number;
  target: string;
  valueWei: string;
  data: string;
}): DecodedTimelockCall {
  const hex = input.data.startsWith("0x") ? input.data.slice(2) : input.data;
  if (hex.length < 8) {
    return {
      index: input.index,
      target: input.target,
      valueWei: input.valueWei,
      rawData: input.data,
      selector: null,
      functionName: null,
      args: null,
      decoded: false,
    };
  }
  const selector = `0x${hex.slice(0, 8).toLowerCase()}`;
  const sig = lookupFunctionSig(selector);
  const body = hex.slice(8);
  if (!sig || body.length < sig.paramTypes.length * 64) {
    return {
      index: input.index,
      target: input.target,
      valueWei: input.valueWei,
      rawData: input.data,
      selector,
      functionName: null,
      args: null,
      decoded: false,
    };
  }

  const args: string[] = [];
  for (let i = 0; i < sig.paramTypes.length; i++) {
    const word = body.slice(i * 64, (i + 1) * 64);
    const kind = sig.paramTypes[i]!;
    if (kind === "address") {
      args.push(`0x${word.slice(24)}`);
    } else if (kind === "uint256") {
      args.push(BigInt(`0x${word}`).toString(10));
    } else {
      args.push(`0x${word}`);
    }
  }

  return {
    index: input.index,
    target: input.target,
    valueWei: input.valueWei,
    rawData: input.data,
    selector,
    functionName: sig.name,
    args,
    decoded: true,
  };
}

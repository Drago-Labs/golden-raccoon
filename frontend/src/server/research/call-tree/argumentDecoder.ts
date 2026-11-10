import type { DecodedArg, RawArgValue } from "./schema";

export function decodeArgument(raw: RawArgValue, index = 0): DecodedArg {
  return {
    name: raw.name?.trim() || `arg_${index}`,
    type: raw.type.trim(),
    displayValue: raw.value,
  };
}

export function decodeArgumentList(args: RawArgValue[] = []): DecodedArg[] {
  return args.map((item, idx) => decodeArgument(item, idx));
}

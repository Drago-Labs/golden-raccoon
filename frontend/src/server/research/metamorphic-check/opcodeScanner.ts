import type { OpcodeFindings } from "./schema";

/**
 * Scans EVM runtime bytecode, skipping PUSH1..PUSH32 immediate operands so
 * data bytes equal to 0xff (SELFDESTRUCT) or 0xf4 (DELEGATECALL) are not
 * misclassified as executable opcodes.
 */
export function scanRuntimeBytecode(bytecodeHex: string): OpcodeFindings {
  const clean = bytecodeHex.startsWith("0x") ? bytecodeHex.slice(2) : bytecodeHex;
  const bytes: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    bytes.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }

  const selfDestructOffsets: number[] = [];
  const delegateCallOffsets: number[] = [];

  let pc = 0;
  while (pc < bytes.length) {
    const op = bytes[pc]!;
    if (op >= 0x60 && op <= 0x7f) {
      const pushLen = op - 0x5f;
      pc += 1 + pushLen;
      continue;
    }
    if (op === 0xff) {
      selfDestructOffsets.push(pc);
    } else if (op === 0xf4) {
      delegateCallOffsets.push(pc);
    }
    pc += 1;
  }

  return {
    hasSelfDestruct: selfDestructOffsets.length > 0,
    selfDestructOffsets,
    hasDelegateCall: delegateCallOffsets.length > 0,
    delegateCallOffsets,
  };
}

import type { InitCodePatternFindings } from "./schema";

/**
 * Detects metamorphic init-code templates that use EXTCODECOPY (0x3c) or
 * CALL/STATICCALL during construction to pull runtime bytecode from an
 * external implementation storage contract.
 */
export function analyzeInitCode(initCodeHex: string | null): InitCodePatternFindings {
  if (!initCodeHex) {
    return { externalCodeCopyInInit: false, dynamicRuntimeLoader: false };
  }
  const clean = initCodeHex.startsWith("0x") ? initCodeHex.slice(2).toLowerCase() : initCodeHex.toLowerCase();
  let hasExtCodeCopy = false;
  let hasStaticCall = false;

  let i = 0;
  while (i + 1 < clean.length) {
    const op = Number.parseInt(clean.slice(i, i + 2), 16);
    if (op >= 0x60 && op <= 0x7f) {
      i += (1 + (op - 0x5f)) * 2;
      continue;
    }
    if (op === 0x3c) hasExtCodeCopy = true;
    if (op === 0xfa || op === 0xf1) hasStaticCall = true;
    i += 2;
  }

  return {
    externalCodeCopyInInit: hasExtCodeCopy,
    dynamicRuntimeLoader: hasExtCodeCopy && hasStaticCall,
  };
}

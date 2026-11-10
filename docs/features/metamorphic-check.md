# Metamorphic & Redeployable Contract Check

Inspects contract creation transactions (`CREATE` vs `CREATE2`), scans runtime bytecode for `SELFDESTRUCT` (`0xff`) and `DELEGATECALL` (`0xf4`) while skipping `PUSH1..PUSH32` immediate data, checks init code for `EXTCODECOPY` loaders, applies EIP-6780 fork rules, and compares historical code hashes.

const forbiddenServerSecretNames = ["PRIVATE_KEY", "MNEMONIC", "SEED_PHRASE", "WALLET_SECRET"];

export function getSecurityHealth() {
  const configuredForbiddenSecrets = Object.keys(process.env).filter((key) =>
    forbiddenServerSecretNames.some((forbidden) => key.includes(forbidden)),
  );

  return {
    approvalOnlyExecution: true,
    serverWalletSecretsPresent: configuredForbiddenSecrets.length > 0,
    forbiddenSecretNames: configuredForbiddenSecrets,
    detail:
      configuredForbiddenSecrets.length > 0
        ? "Server wallet secrets are present. Execution must remain approval-only and should not sign server-side."
        : "No server wallet private key, mnemonic, seed phrase, or wallet secret env name detected.",
  };
}

export function assertApprovalOnly(input: { userApproved?: boolean; autoExecute?: boolean }) {
  if (input.autoExecute) {
    throw new Error("Auto-execute is disabled. User wallet approval is mandatory.");
  }

  if (input.userApproved === false) {
    throw new Error("User approval is mandatory before execution confirmation.");
  }
}

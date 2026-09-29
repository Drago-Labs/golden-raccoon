export const wallet = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export const nestedSimulation = JSON.stringify({
  auth: [
    {
      address: wallet,
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4",
      functionName: "transfer",
      argumentHash: "abc",
      nonce: "1",
      expirationLedger: 500,
      networkPassphrase: "Test SDF Network ; September 2015",
      children: [
        {
          address: wallet,
          contractId: "CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHBQ",
          functionName: "approve",
          argumentHash: "def",
          nonce: "2",
          expirationLedger: 500,
          networkPassphrase: "Test SDF Network ; September 2015",
        },
      ],
    },
  ],
});

export const flaggedSimulation = JSON.stringify({
  entries: [
    {
      contractId: null,
      functionName: "mystery",
      unknownContract: true,
      unsupportedScVal: true,
      nonce: "9",
      expirationLedger: 10,
      networkPassphrase: "Wrong Network",
    },
    {
      contractId: null,
      functionName: "mystery",
      unknownContract: true,
      nonce: "9",
    },
  ],
});

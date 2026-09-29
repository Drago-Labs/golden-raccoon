import { createReadClient, ReadClientError } from "../dist/client.js";
export async function loadTransactions(baseUrl: string, sessionCookie: string, walletAddress: string) {
  const client = createReadClient({ baseUrl });
  try {
    return await client.history.transactions({ walletAddress, limit: 25 }, {
      headers: { Cookie: sessionCookie }, signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    if (error instanceof ReadClientError) return { kind: error.kind, status: error.status };
    throw error;
  }
}

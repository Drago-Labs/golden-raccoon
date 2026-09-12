import { beforeEach, describe, expect, it } from "vitest";
import {
  createSession,
  getSession,
  listSessionsForWallet,
  resetSessionRegistry,
} from "../session/registry";
import {
  terminateAllWalletSessions,
  terminateSession,
} from "../session/revocation";

describe("Session Revocation Lifecycle", () => {
  beforeEach(() => {
    resetSessionRegistry();
  });

  it("revoking a session marks it revoked immediately", () => {
    const session = createSession({
      walletAddress: "0x1111111111111111111111111111111111111111",
      chainFamily: "evm",
      deviceBindingHash: "hash123",
      deviceHint: "Desktop",
    });

    expect(session.status).toBe("active");

    const result = terminateSession(session.sessionId, "manual_revocation");
    expect(result.success).toBe(true);

    const fetched = getSession(session.sessionId);
    expect(fetched?.status).toBe("revoked");
    expect(fetched?.revokedAt).toBeDefined();
    expect(fetched?.revocationReason).toBe("manual_revocation");
  });

  it("revoking all sessions for an address ends every one of them", () => {
    const targetWallet = "0x2222222222222222222222222222222222222222";
    const otherWallet = "0x3333333333333333333333333333333333333333";

    const s1 = createSession({
      walletAddress: targetWallet,
      chainFamily: "evm",
      deviceBindingHash: "hash1",
      deviceHint: "Device 1",
    });
    const s2 = createSession({
      walletAddress: targetWallet,
      chainFamily: "evm",
      deviceBindingHash: "hash2",
      deviceHint: "Device 2",
    });
    const s3 = createSession({
      walletAddress: otherWallet,
      chainFamily: "evm",
      deviceBindingHash: "hash3",
      deviceHint: "Device 3",
    });

    const summary = terminateAllWalletSessions(targetWallet, "logout_all");
    expect(summary.revokedCount).toBe(2);

    expect(getSession(s1.sessionId)?.status).toBe("revoked");
    expect(getSession(s2.sessionId)?.status).toBe("revoked");
    expect(getSession(s3.sessionId)?.status).toBe("active");

    const sessions = listSessionsForWallet(targetWallet);
    expect(sessions.every((s) => s.status === "revoked")).toBe(true);
  });
});

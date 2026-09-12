import { beforeEach, describe, expect, it } from "vitest";
import {
  createSession,
  resetSessionRegistry,
} from "../session/registry";
import {
  rotateSession,
  shouldRotateSession,
  validateSessionGeneration,
} from "../session/rotation";

describe("Session Scheduled Rotation and Bounded Overlap", () => {
  beforeEach(() => {
    resetSessionRegistry();
  });

  it("identifies when a session should rotate based on schedule", () => {
    const session = createSession({
      walletAddress: "0x1111111111111111111111111111111111111111",
      chainFamily: "evm",
      deviceBindingHash: "hash123",
      deviceHint: "Desktop",
    });

    expect(shouldRotateSession(session, session.createdAt, 3600000)).toBe(false);
    expect(shouldRotateSession(session, session.createdAt + 3600001, 3600000)).toBe(true);
  });

  it("rotates to generation 2 and accepts previous generation during overlap window", () => {
    const session = createSession({
      walletAddress: "0x2222222222222222222222222222222222222222",
      chainFamily: "evm",
      deviceBindingHash: "hash123",
      deviceHint: "Desktop",
    });

    expect(session.generation).toBe(1);

    const rotationTime = Date.now() + 3600000;
    const overlapWindowMs = 60000;
    const rotated = rotateSession(session.sessionId, overlapWindowMs, rotationTime);

    expect(rotated).not.toBeNull();
    expect(rotated?.previousGeneration).toBe(1);
    expect(rotated?.newGeneration).toBe(2);
    expect(session.generation).toBe(2);

    const duringOverlap = validateSessionGeneration(session, 1, rotationTime + 30000);
    expect(duringOverlap.valid).toBe(true);
    expect(duringOverlap.isOverlap).toBe(true);
    expect(duringOverlap.reason).toBe("overlap");

    const newGenCheck = validateSessionGeneration(session, 2, rotationTime + 30000);
    expect(newGenCheck.valid).toBe(true);
    expect(newGenCheck.isOverlap).toBe(false);
    expect(newGenCheck.reason).toBe("current");

    const afterOverlap = validateSessionGeneration(session, 1, rotationTime + 60001);
    expect(afterOverlap.valid).toBe(false);
    expect(afterOverlap.isOverlap).toBe(false);
    expect(afterOverlap.reason).toBe("superseded_expired");
  });

  it("refuses generations older than previous generation immediately", () => {
    const session = createSession({
      walletAddress: "0x3333333333333333333333333333333333333333",
      chainFamily: "evm",
      deviceBindingHash: "hash123",
      deviceHint: "Desktop",
    });

    rotateSession(session.sessionId, 60000);
    rotateSession(session.sessionId, 60000);
    expect(session.generation).toBe(3);

    const staleCheck = validateSessionGeneration(session, 1);
    expect(staleCheck.valid).toBe(false);
    expect(staleCheck.reason).toBe("invalid_generation");
  });
});

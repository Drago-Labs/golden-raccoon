import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

vi.mock("server-only", () => ({}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

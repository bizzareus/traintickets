import test from "node:test";
import assert from "node:assert/strict";
import { isAdminUser } from "./admin";

test("isAdminUser - returns false when localStorage admin is not set", () => {
  const originalWindow = globalThis.window;
  const storage = new Map<string, string>();

  // Mock minimal window and localStorage
  globalThis.window = {
    location: { search: "" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, val: string) => storage.set(key, val),
      removeItem: (key: string) => storage.delete(key),
    },
  } as unknown as Window & typeof globalThis;

  try {
    assert.equal(isAdminUser(), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("isAdminUser - does NOT grant admin when ?admin=1 is in URL parameters", () => {
  const originalWindow = globalThis.window;
  const storage = new Map<string, string>();

  globalThis.window = {
    location: { search: "?admin=1" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, val: string) => storage.set(key, val),
      removeItem: (key: string) => storage.delete(key),
    },
  } as unknown as Window & typeof globalThis;

  try {
    assert.equal(isAdminUser(), false);
    assert.equal(storage.get("admin"), undefined);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("isAdminUser - returns true when localStorage admin is 'true'", () => {
  const originalWindow = globalThis.window;
  const storage = new Map<string, string>([["admin", "true"]]);

  globalThis.window = {
    location: { search: "" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, val: string) => storage.set(key, val),
      removeItem: (key: string) => storage.delete(key),
    },
  } as unknown as Window & typeof globalThis;

  try {
    assert.equal(isAdminUser(), true);
  } finally {
    globalThis.window = originalWindow;
  }
});

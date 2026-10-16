import test from "node:test";
import assert from "node:assert/strict";
import { isAdminUser } from "./admin";

test("isAdminUser - returns false when window is undefined", () => {
  const originalWindow = global.window;
  // @ts-expect-error deleting window for test
  delete global.window;

  assert.equal(isAdminUser(), false);

  global.window = originalWindow;
});

test("isAdminUser - returns true when localStorage admin is 'true'", () => {
  const mockStorage: Record<string, string> = { admin: "true" };
  const dummyWindow = {
    location: { search: "" },
    localStorage: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
    },
  };

  const originalWindow = global.window;
  // @ts-expect-error setting mock window
  global.window = dummyWindow;

  assert.equal(isAdminUser(), true);

  global.window = originalWindow;
});

test("isAdminUser - returns false when localStorage admin is not 'true' even if URL query param has ?admin=true", () => {
  const mockStorage: Record<string, string> = {};
  const dummyWindow = {
    location: { search: "?admin=true" },
    localStorage: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
    },
  };

  const originalWindow = global.window;
  // @ts-expect-error setting mock window
  global.window = dummyWindow;

  assert.equal(isAdminUser(), false);
  assert.equal(mockStorage["admin"], undefined);

  global.window = originalWindow;
});

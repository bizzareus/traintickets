import { test, expect } from "./fixtures/booking-engine";

declare global {
  interface Window {
    __sharedImage?: {
      name: string;
      type: string;
      size: number;
      signature: number[];
    };
    __shareCalls?: number;
  }
}

test("non-admin can generate a PNG and invoke native file sharing", async ({
  booking,
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload: ShareData) => {
        const file = payload.files![0];
        window.__sharedImage = {
          name: file.name,
          type: file.type,
          size: file.size,
          signature: Array.from(
            new Uint8Array(await file.arrayBuffer()).slice(0, 8),
          ),
        };
      },
    });
  });
  await booking.open();
  await booking
    .details()
    .getByRole("button", { name: "Close booking" })
    .click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("admin")))
    .toBeNull();
  const button = page.getByRole("button", { name: /Share journey as image/ });
  await expect(button).toBeVisible();
  await button.click();
  await expect
    .poll(() => page.evaluate(() => window.__sharedImage?.size), {
      timeout: 20_000,
    })
    .toBeGreaterThan(1000);
  const file = await page.evaluate(() => window.__sharedImage!);
  expect(file.type).toBe("image/png");
  expect(file.name).toBe("lastberth-journey.png");
  expect(file.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await expect(button).toBeEnabled();
});

test("share-sheet cancellation restores Share without a second request", async ({
  booking,
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        window.__shareCalls = (window.__shareCalls ?? 0) + 1;
        throw new DOMException("User cancelled", "AbortError");
      },
    });
  });
  await booking.open();
  await booking
    .details()
    .getByRole("button", { name: "Close booking" })
    .click();
  const button = page.getByRole("button", { name: /Share journey as image/ });
  await button.click();
  await expect
    .poll(() => page.evaluate(() => window.__shareCalls), { timeout: 20_000 })
    .toBe(1);
  await expect(button).toBeEnabled();
});

test("unsupported native file sharing downloads the PNG", async ({
  booking,
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    }),
  );
  await booking.open();
  await booking
    .details()
    .getByRole("button", { name: "Close booking" })
    .click();
  page.on("dialog", (dialog) => dialog.dismiss());
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Share journey as image/ }).click();
  expect((await download).suggestedFilename()).toBe("lastberth-journey.png");
  await expect(
    page.getByRole("button", { name: /Share journey as image/ }),
  ).toBeEnabled();
});

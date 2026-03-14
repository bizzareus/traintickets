"use client";

import { useEffect } from "react";
import { initFlowbite } from "flowbite";

/**
 * Initializes Flowbite components (dropdowns, modals, etc.) after mount.
 * Required for Next.js because the "load" event may have already fired.
 * @see https://flowbite.com/docs/getting-started/quickstart/#init-functions
 */
export function FlowbiteInit() {
  useEffect(() => {
    initFlowbite();
  }, []);
  return null;
}

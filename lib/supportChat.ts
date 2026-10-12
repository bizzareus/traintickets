declare global {
  interface Window {
    Tawk_API?: {
      maximize?: () => void;
      minimize?: () => void;
      toggle?: () => void;
      onLoad?: () => void;
    };
    Tawk_LoadStart?: Date;
  }
}

const TAWK_SRC = "https://embed.tawk.to/6accefb7b58b1d34bd438e1a/1k4o8govj";

let loadPromise: Promise<void> | null = null;

/**
 * Lazily injects the Tawk.to widget (singleton). The widget stays minimized
 * until `openSupportChat` is called, so pages pay no chat cost by default.
 */
export function preloadSupportChat(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (typeof window.Tawk_API?.maximize === "function") {
    return Promise.resolve();
  }
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      window.Tawk_API = window.Tawk_API ?? {};
      window.Tawk_LoadStart = new Date();
      const script = document.createElement("script");
      script.async = true;
      script.src = TAWK_SRC;
      script.charset = "UTF-8";
      script.setAttribute("crossorigin", "*");
      script.onload = () => resolve();
      script.onerror = () => {
        loadPromise = null;
        reject(new Error("Live chat failed to load"));
      };
      const first = document.getElementsByTagName("script")[0];
      if (first?.parentNode) {
        first.parentNode.insertBefore(script, first);
      } else {
        document.head.appendChild(script);
      }
    });
  }
  return loadPromise;
}

/** Opens the Tawk.to chat window, loading the widget first if needed. */
export async function openSupportChat(): Promise<void> {
  await preloadSupportChat();
  const api = window.Tawk_API;
  if (typeof api?.maximize === "function") {
    api.maximize();
    return;
  }
  // Script loaded but the API isn't ready yet — open once Tawk fires onLoad.
  await new Promise<void>((resolve) => {
    const current = window.Tawk_API ?? {};
    const previous = current.onLoad;
    current.onLoad = () => {
      previous?.();
      current.maximize?.();
      resolve();
    };
    window.Tawk_API = current;
  });
}

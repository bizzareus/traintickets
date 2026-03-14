import type { Config } from "tailwindcss";

/**
 * Tailwind v3 config with Flowbite.
 * @see https://flowbite.com/docs/getting-started/quickstart/
 * (Theme import & @plugin are for Tailwind v4; v3 uses content + plugin here.)
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/flowbite/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#0f766e",
          foreground: "#f0fdfa",
        },
        secondary: {
          DEFAULT: "#134e4a",
          foreground: "#ccfbf1",
        },
        accent: {
          DEFAULT: "#2dd4bf",
          foreground: "#134e4a",
        },
        surface: "#f8fafc",
        muted: "#94a3b8",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [require("flowbite/plugin")],
};
export default config;

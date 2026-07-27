import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FFFFFF",
        surface: "#FFFFFF",
        "surface-elevated": "#F9FAFB",
        "surface-muted": "#F3F4F6",
        "text-primary": "#111827",
        "text-secondary": "#374151",
        "text-muted": "#6B7280",
        "text-subtle": "#9CA3AF",
        accent: {
          DEFAULT: "#111827",
          muted: "#374151",
          soft: "#E5E7EB",
          contrast: "#FFFFFF",
        },
        warning: {
          DEFAULT: "#D97706",
          light: "#FBBF24",
        },
        danger: {
          DEFAULT: "#DC2626",
          light: "#FCA5A5",
        },
        border: "#E5E7EB",
        "border-soft": "#F1F5F9",
      },
      fontFamily: {
        sans: ["var(--hub-font-sans, Inter)", "system-ui", "sans-serif"],
        display: ["var(--hub-font-display, Georgia)", "Georgia", "serif"],
        mono: ["var(--hub-font-mono, 'JetBrains Mono')", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

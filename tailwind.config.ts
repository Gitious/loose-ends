import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        le: {
          void: "#08080c",
          surface: "#111118",
          elevated: "#1a1a24",
          border: "#2a2a3a",
          text: "#e4e0d8",
          muted: "#7a7680",
          accent: "#6c8cff",
          "accent-glow": "#4a6cff",
          red: "#ff4c4c",
          yellow: "#f0b429",
          green: "#34d399",
        },
      },
    },
  },
  plugins: [],
};
export default config;

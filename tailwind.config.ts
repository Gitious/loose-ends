import type { Config } from "tailwindcss";

// Tailwind v4 reads theme from @theme in globals.css.
// This file is kept as a placeholder; colors are defined in @theme.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
};
export default config;

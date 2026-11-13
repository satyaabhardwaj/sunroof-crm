import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { primary: "#514380", canvas: "#f6f5fa", accent: "#F5B69E" },
    },
  },
  plugins: [],
} satisfies Config;

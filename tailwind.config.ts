// FILE: tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "hunter-green": "#386641",
        "sage-green": "#6a994e",
        "yellow-green": "#a7c957",
        "vanilla-cream": "#f2e8cf",
        "blushed-brick": "#bc4749",
        "bright-snow": "#f8f9fa",
        platinum: "#e9ecef",
        "alabaster-grey": "#dee2e6",
        "pale-slate": "#ced4da",
        "pale-slate-2": "#adb5bd",
        "slate-grey": "#6c757d",
        "iron-grey": "#495057",
        gunmetal: "#343a40",
        "carbon-black": "#212529",
      },
      fontFamily: {
        display: ["var(--font-funnel-display)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

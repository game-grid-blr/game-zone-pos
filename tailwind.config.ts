import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#141414",
        paper: "#f8f7f4",
        fire: "#dd2c2c",
        amber: "#f5a623",
        mint: "#2f9e6f",
        pool: "#187d8f",
        violet: "#7b61ff"
      },
      boxShadow: {
        pos: "0 18px 45px rgba(20, 20, 20, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;

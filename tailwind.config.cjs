/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
      },
      boxShadow: {
        glow: "0 10px 24px rgba(68, 131, 255, 0.28)",
        glowHover: "0 12px 28px rgba(68, 131, 255, 0.36)",
        panel: "0 20px 44px rgba(0, 0, 0, 0.32)",
        card: "0 16px 34px rgba(0, 0, 0, 0.25)",
        cardActive: "0 18px 36px rgba(86, 132, 255, 0.35)",
      },
    },
  },
  plugins: [],
};

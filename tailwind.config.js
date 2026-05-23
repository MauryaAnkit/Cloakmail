/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./popup.tsx", "./options.tsx", "./contents/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101820",
        mint: "#8fd6bf",
        coral: "#ff8d7c"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(0, 0, 0, 0.22)"
      }
    }
  },
  plugins: []
}

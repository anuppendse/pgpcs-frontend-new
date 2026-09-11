/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0F2540",
          dark: "#0B1D33",
          light: "#16324F",
          lighter: "#1E3F5F",
        },
        accent: {
          DEFAULT: "#2AA9C7",
          dark: "#1C8AA5",
        },
        status: {
          green: "#1E9E5A",
          greenBg: "#E3F6EC",
          amber: "#E0A429",
          amberBg: "#FDF2DC",
          red: "#D64545",
          redBg: "#FBE7E7",
          gray: "#6B7280",
          grayBg: "#EEF1F4",
        },
        surface: "#F5F7FA",
        border: "#E2E7ED",
        ink: "#1A2733",
        inkSoft: "#5B6773",
        dark: {
          bg: "#0B1622",
          card: "#122234",
          border: "#1E3350",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

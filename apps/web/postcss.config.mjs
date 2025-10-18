const dev = process.env.NODE_ENV !== "production";

export default {
  plugins: {
    tailwindcss: {},
    "react-strict-dom/postcss-plugin": {
      include: [
        "./app/**/*.{js,jsx,ts,tsx}",
        "./components/**/*.{js,jsx,ts,tsx}",
        "../../packages/ui/src/**/*.{js,jsx,ts,tsx}",
      ],
      babelConfig: {
        babelrc: false,
        parserOpts: {
          plugins: ["typescript", "jsx"],
        },
        presets: [
          [
            "react-strict-dom/babel-preset",
            {
              debug: dev,
              dev,
              rootDir: process.cwd(),
            },
          ],
        ],
      },
    },
    autoprefixer: {},
  },
};

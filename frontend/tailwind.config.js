/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sap: {
          blue: '#0070d2',
          'blue-dark': '#005fb3',
          'blue-light': '#e8f4fd',
          gray: '#f5f5f5',
          'gray-dark': '#666666',
          border: '#d9d9d9',
          green: '#2d8653',
          amber: '#e9730c',
          red: '#cc1919',
          'red-light': '#fff4f4',
        },
      },
      fontFamily: {
        sap: ['"72"', '"SAP-icons"', 'Arial', 'Helvetica', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

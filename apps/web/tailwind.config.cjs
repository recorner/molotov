const config = {
  content: ['./src/**/*.{html,js,svelte,ts}'],

  theme: {
    extend: {
      colors: {
        neutral: {
          850: '#1F1F1F',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

module.exports = config;

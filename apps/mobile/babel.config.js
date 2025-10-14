module.exports = function (api) {
  api.cache(true);
  let plugins = [];

  plugins.push('react-native-worklets/plugin');

  return {
    presets: [
      'babel-preset-expo',
      [
        'react-strict-dom/babel-preset',
        {
          rootDir: __dirname,
          platform: 'native',
          dev: process.env.NODE_ENV === 'development',
        },
      ],
    ],
    plugins,
  };
};

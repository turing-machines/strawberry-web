const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;
// Ensure we resolve modules from the workspace root for monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, '../../node_modules'),
  path.resolve(__dirname, 'node_modules'),
];

config.watchFolders = [
  path.resolve(__dirname, '../../'),
];

module.exports = withNativeWind(config, {
  input: './global.css',
});

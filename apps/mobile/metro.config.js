// Metro config for the SAGE monorepo.
// Lets the bare app resolve the @sage/* TypeScript packages from the workspace
// root without a build step (Metro transpiles their `src` directly).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Resolve the package `exports`/`main` (which point at TS sources).
config.resolver.unstable_enablePackageExports = true;

module.exports = config;

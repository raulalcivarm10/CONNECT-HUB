// Metro para monorepo "blando": además del propio proyecto, observamos
// packages/ para resolver @connecthub/shared-types desde su código TS fuente.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

// Observar el proyecto + los paquetes compartidos del monorepo.
config.watchFolders = [projectRoot, path.resolve(workspaceRoot, 'packages')];

// Resolver módulos SOLO desde node_modules del proyecto (evita hoisting raro).
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Alias del paquete de tipos compartidos → su carpeta (main: src/index.ts).
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@connecthub/shared-types': path.resolve(workspaceRoot, 'packages', 'shared-types'),
};

// Importar .svg como componentes React (react-native-svg-transformer).
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

module.exports = config;

import { Config } from '@remotion/cli/config';

// Renderer sources use NodeNext-style `./foo.js` specifiers that point at
// `.ts`/`.tsx` files on disk. TypeScript maps them, webpack does not, so the
// bundle fails with "Module not found" unless the resolver is told the same.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      ...config.resolve?.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    },
  },
}));

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(1);

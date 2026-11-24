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

// The render container has no user namespaces and a small /dev/shm. Chrome's
// default sandbox cannot start here, so use the same flags as a local headless
// browser. These only affect the local rendering browser.
Config.setChromiumFlags({
  'no-sandbox': true,
  'disable-dev-shm-usage': true,
  'disable-gpu': true,
});
Config.setChromiumMultiProcessOnLinux(false);

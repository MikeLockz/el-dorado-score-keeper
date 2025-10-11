import { shouldEmitSourceMaps } from './config/source-maps.mjs';

const enableSourceMaps = shouldEmitSourceMaps();

/** @type {import('postcss-load-config').Config} */
const config = {
  map: enableSourceMaps ? { inline: false, annotation: false } : false,
  plugins: {
    autoprefixer: {},
  },
};

export default config;

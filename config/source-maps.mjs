const truthyValues = new Set(['1', 'true', 'yes', 'on']);
const falsyValues = new Set(['0', 'false', 'no', 'off']);
const productionChannels = new Set(['production', 'prod', 'release']);

const normalizeFlag = (value) => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (truthyValues.has(normalized)) {
    return true;
  }
  if (falsyValues.has(normalized)) {
    return false;
  }
  return undefined;
};

const normalizeChannel = (value) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveDeploymentChannel = () => {
  const explicitChannel =
    normalizeChannel(process.env.VERCEL_ENV) ??
    normalizeChannel(process.env.NEXT_PUBLIC_APP_ENV) ??
    normalizeChannel(process.env.APP_ENV);

  if (explicitChannel) {
    return explicitChannel;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }

  return 'development';
};

const resolveUploadToken = () => {
  const raw = process.env.NEXT_SOURCE_MAP_UPLOAD_TOKEN;
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * @typedef {Object} SourceMapSettings
 * @property {boolean} shouldEmitSourceMaps
 * @property {boolean} explicitlyEnabled
 * @property {boolean} explicitlyDisabled
 * @property {string} deploymentChannel
 * @property {boolean} isProductionChannel
 * @property {string | undefined} uploadToken
 */

/**
 * Resolve the normalized source map configuration derived from environment variables.
 * @returns {SourceMapSettings}
 */
export const resolveSourceMapSettings = () => {
  const flag = normalizeFlag(process.env.ENABLE_SOURCE_MAPS);
  const deploymentChannel = resolveDeploymentChannel();
  const isProductionChannel = productionChannels.has(deploymentChannel);
  const uploadToken = resolveUploadToken();

  const explicitlyEnabled = flag === true;
  const explicitlyDisabled = flag === false;
  const shouldEmitSourceMaps = explicitlyEnabled;

  return {
    shouldEmitSourceMaps,
    explicitlyEnabled,
    explicitlyDisabled,
    deploymentChannel,
    isProductionChannel,
    uploadToken,
  };
};

export const shouldEmitSourceMaps = () => resolveSourceMapSettings().shouldEmitSourceMaps;

export const getSourceMapUploadToken = () => resolveSourceMapSettings().uploadToken;

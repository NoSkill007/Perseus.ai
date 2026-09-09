const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// When bundling for web, alias @qvac/sdk to a web stub so Metro doesn't parse node/bare-kit files
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.startsWith('@qvac/sdk')) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'src/services/ai/qvacWebStub.js'),
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

const { signAsync } = require('@electron/osx-sign');
const { execFileSync } = require('node:child_process');

// Keep local builds on the owner's fixed certificate and existing bundle IDs.
// This is a local development signature, not Developer ID/notarization.
module.exports = async function signMac(options) {
  await signAsync({
    ...options,
    // osx-sign's generic identity lookup omits this local certificate; codesign
    // resolves the exact name and fails if its private key is unavailable.
    identity: 'Local Development Code Signing', identityValidation: false,
    preAutoEntitlements: false, preEmbedProvisioningProfile: false,
    gatekeeperAssess: false, strictVerify: undefined,
    optionsForFile: () => ({ hardenedRuntime: false, timestamp: 'none' }),
  });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', options.app], { stdio: 'inherit' });
};

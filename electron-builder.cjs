const release = require('./src/release-config.json');
// A Developer ID certificate enables real signing; without one the Mac app is ad-hoc signed so Apple Silicon still opens it.
const macCertificate = Boolean(process.env.CSC_LINK);
module.exports = {
  appId: 'com.nurimai.desktop', productName: 'NurimAI',
  asar: true, directories: { output: 'dist' },
  files: ['src/**/*', 'assets/Nuri.ico', 'assets/trayTemplate.png', 'assets/trayTemplate@2x.png', 'assets/nur/**/*', 'package.json'],
  artifactName: 'NurimAI-${version}-${os}-${arch}.${ext}',
  publish: release.owner && release.repo ? [{ provider: 'github', owner: release.owner, repo: release.repo, releaseType: 'release' }] : null,
  win: { target: ['nsis'], icon: 'assets/Nuri.ico' },
  nsis: { oneClick: true, perMachine: false, runAfterFinish: true, createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: 'NurimAI', deleteAppDataOnUninstall: false },
  mac: { target: ['dmg', 'zip'], icon: 'assets/icon-mac.png', category: 'public.app-category.education',
    extendInfo: { NSMicrophoneUsageDescription: 'NurimAI ovozli savolingizni faqat 🎤 tugmasi bosilganda yozadi.' },
    identity: macCertificate ? undefined : '-', hardenedRuntime: macCertificate,
    notarize: Boolean(macCertificate && process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) },
  dmg: { title: 'NurimAI' },
  beforePack: async () => {
    require('node:fs').writeFileSync(require('node:path').join(__dirname, 'src/build-info.json'), JSON.stringify({
      macSigned: process.platform === 'darwin' && macCertificate && Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
    }));
  }
};

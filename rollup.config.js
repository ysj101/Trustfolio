const typescript = require('@rollup/plugin-typescript');
const fs = require('fs');
const path = require('path');

const footer = [
  'function doGet(e) {',
  '  return TrustfolioApp.doGet(e);',
  '}',
  'function doPost(e) {',
  '  return TrustfolioApp.doPost(e);',
  '}',
  'function onOpen(e) {',
  '  return TrustfolioApp.onOpen(e);',
  '}',
  'function initializeSheets() {',
  '  return TrustfolioApp.initializeSheets();',
  '}',
  'function handleApiRequest(request) {',
  '  return TrustfolioApp.handleApiRequest(request);',
  '}',
  'function include(filename) {',
  '  return TrustfolioApp.include(filename);',
  '}',
  'function runRakutenIntegrationTest() {',
  '  return TrustfolioApp.runRakutenIntegrationTest();',
  '}',
  'function fetchAllNavs() {',
  '  return TrustfolioApp.fetchAllNavs();',
  '}',
  'function executeRecurringPurchasesDaily() {',
  '  return TrustfolioApp.executeRecurringPurchasesDaily();',
  '}',
  'function setupNavFetchTrigger() {',
  '  return TrustfolioApp.setupNavFetchTrigger();',
  '}',
  'function setupRecurringPurchasesTrigger() {',
  '  return TrustfolioApp.setupRecurringPurchasesTrigger();',
  '}',
  'function deleteNavFetchTrigger() {',
  '  return TrustfolioApp.deleteNavFetchTrigger();',
  '}'
].join('\n');

function copyUiFiles() {
  return {
    name: 'copy-ui-files',
    buildEnd() {
      const srcDir = path.join(__dirname, 'src', 'ui');
      const distDir = path.join(__dirname, 'dist');
      if (!fs.existsSync(srcDir)) {
        return;
      }
      copyDirectory(srcDir, distDir);
    }
  };
}

function copyManifest() {
  return {
    name: 'copy-manifest',
    buildEnd() {
      const srcPath = path.join(__dirname, 'appsscript.json');
      const distPath = path.join(__dirname, 'dist', 'appsscript.json');
      if (!fs.existsSync(srcPath)) {
        return;
      }
      fs.copyFileSync(srcPath, distPath);
    }
  };
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }
  const entries = fs.readdirSync(source, { withFileTypes: true });
  entries.forEach((entry) => {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
      return;
    }
    fs.copyFileSync(srcPath, destPath);
  });
}

module.exports = {
  input: 'src/main.ts',
  output: {
    file: 'dist/Code.js',
    format: 'iife',
    name: 'TrustfolioApp',
    footer
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json'
    }),
    copyUiFiles(),
    copyManifest()
  ]
};

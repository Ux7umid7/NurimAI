const test=require('node:test');const assert=require('node:assert/strict');
const {unexpected}=require('../scripts/verify-package.cjs');
test('the package check keeps out the app\'s data, server, tests and any secret, but lets dependencies keep their own data folders',()=>{
 for(const entry of ['\\data\\history.json','\\server\\worker.mjs','\\tests\\core.test.cjs','\\.github\\workflows\\build.yml','\\.env','\\src\\settings.json','\\node_modules\\x\\.env','\\node_modules\\x\\cert.p12','/data/x.json'])
  assert.ok(unexpected(entry),`${entry} must be rejected`);
 for(const entry of ['\\src\\main.cjs','\\assets\\ustoz3d\\idle.webm','\\node_modules\\@anthropic-ai\\sdk\\internal\\data.js','\\node_modules\\@anthropic-ai\\sdk\\internal\\data\\deprecated-models.js','\\node_modules\\some-lib\\server\\index.js','/node_modules/@anthropic-ai/sdk/internal/data.mjs'])
  assert.ok(!unexpected(entry),`${entry} must be allowed`);
});

const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {copies,app,root}=require('../scripts/mobile-sync.cjs');const text=f=>fs.readFileSync(f,'utf8').split('\r\n').join('\n');
test('the phone app carries the same shared code as the desktop app (npm run mobile:sync)',()=>{
 for(const [from,to] of copies.filter(([f])=>f.startsWith('src/')))assert.equal(text(path.join(app,to)),text(path.join(root,from)),`docs/app/${to} is stale: run npm run mobile:sync`);
 for(const [from,to] of copies.filter(([f])=>f.startsWith('assets/')))assert.ok(fs.existsSync(path.join(app,to)),`docs/app/${to} is missing`);
});
test('desktop, web app, Android project and service worker agree on the version',()=>{
 const {version}=require('../package.json');
 assert.match(text(path.join(app,'config.js')),new RegExp(`version: '${version.replace(/\./g,'\.')}'`));
 assert.equal(require('../mobile/package.json').version,version);
 assert.match(text(path.join(root,'mobile/android/app/build.gradle')),new RegExp(`versionName "${version.replace(/\./g,'\.')}"`));
 assert.match(text(path.join(app,'sw.js')),new RegExp(`nurimai-app-${version.replace(/\./g,'\.')}`));
 assert.match(text(path.join(app,'sw.js')),/new Request\(url, \{ cache: 'reload' \}\)/); // a new version's shell bypasses the HTTP cache (else stale app.js lands in the new cache)
});
test('the web app keeps a strict CSP and only talks to the NurimAI server',()=>{
 const html=text(path.join(app,'index.html'));const csp=/Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
 assert.match(csp,/script-src 'self';/);assert.doesNotMatch(csp,/unsafe-inline|unsafe-eval/);
 const gateway=/gateway: '([^']+)'/.exec(text(path.join(app,'config.js')))[1];assert.match(csp,new RegExp(`connect-src 'self' ${gateway.replace(/[.]/g,'\.')};`));
 assert.equal((html.match(/<script /g)||[]).length,(html.match(/<script src=/g)||[]).length); // no inline scripts
});

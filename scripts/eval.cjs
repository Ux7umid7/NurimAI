// Evallar: asks NurimAI's server the questions in evals/cases.json and checks each answer, so a change to the instruction,
// a model or the routing is measured before it reaches users. It spends the server's free limit (one question each, about
// 25 a run, paced under the 10-a-minute limit) and never uses the answer cache.
//   npm run eval                      all cases against the public server
//   npm run eval -- --only salom,geo-poytaxt
//   npm run eval -- --url https://… --min 0.9   (exit code 1 below 90%)
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const { askGateway } = require('../src/gateway.cjs');
const G = require('../src/shared/guard.js');
const root = path.join(__dirname, '..');
const load = () => JSON.parse(fs.readFileSync(path.join(root, 'evals/cases.json'), 'utf8')).cases;
const rx = source => new RegExp(source, 'iu');
// → [] when the answer passes, else the reasons it failed.
function check(c, text) {
  const failed = [];
  if (c.guarded) { if (text !== G.BLOCKED_REPLY) failed.push('himoya javob bermadi'); return failed; }
  if (text === G.BLOCKED_REPLY) return ['himoya keraksiz to‘xtatdi'];
  for (const p of c.all || []) if (!rx(p).test(text)) failed.push(`topilmadi: ${p}`);
  if (c.any?.length && !c.any.some(p => rx(p).test(text))) failed.push(`hech biri topilmadi: ${c.any.join(' | ')}`);
  for (const p of c.none || []) if (rx(p).test(text)) failed.push(`bo‘lmasligi kerak edi: ${p}`);
  if (c.maxChars && text.length > c.maxChars) failed.push(`juda uzun: ${text.length} > ${c.maxChars}`);
  return failed;
}
function gatewayUrl(argv) {
  const flag = argv.indexOf('--url'); if (flag >= 0) return argv[flag + 1];
  if (process.env.NURIMAI_GATEWAY_URL) return process.env.NURIMAI_GATEWAY_URL;
  return /gateway: '([^']+)'/.exec(fs.readFileSync(path.join(root, 'docs/app/config.js'), 'utf8'))?.[1];
}
async function main(argv = process.argv.slice(2)) {
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
  const min = argv.includes('--min') ? Number(argv[argv.indexOf('--min') + 1]) : 0;
  const url = gatewayUrl(argv), deviceId = crypto.randomUUID(), wait = ms => new Promise(r => setTimeout(r, ms));
  const cases = load().filter(c => !only || only.includes(c.id));
  console.log(`Evallar: ${cases.length} ta savol → ${url}\n`);
  const results = [];
  for (const [i, c] of cases.entries()) {
    if (i) await wait(6500); // the server lets a device ask ten a minute
    const started = Date.now(); let text = '', trace = '', error = '';
    try { ({ text, trace } = await askGateway({ url, deviceId, history: [], question: c.question, files: c.files || [], signal: AbortSignal.timeout(120000) })); }
    catch (e) { error = e.message; if (e.code === 'limit' && e.retry > 0 && e.retry <= 70) { await wait(e.retry * 1000); try { ({ text, trace } = await askGateway({ url, deviceId, history: [], question: c.question, files: c.files || [], signal: AbortSignal.timeout(120000) })); error = ''; } catch (again) { error = again.message; } } }
    const failed = error ? [`xato: ${error}`] : check(c, text);
    results.push({ id: c.id, area: c.area, ok: !failed.length, failed, ms: Date.now() - started, trace, answer: text.slice(0, 600) });
    console.log(`${failed.length ? '✗' : '✓'} ${c.id.padEnd(24)} ${String(Date.now() - started).padStart(6)} ms  ${failed.join('; ')}${trace ? `\n    ${trace}` : ''}`);
  }
  const passed = results.filter(r => r.ok).length, score = results.length ? passed / results.length : 0;
  const areas = {}; for (const r of results) { areas[r.area] ??= [0, 0]; areas[r.area][1]++; if (r.ok) areas[r.area][0]++; }
  console.log(`\nNatija: ${passed}/${results.length} (${Math.round(score * 100)}%) · ${Object.entries(areas).map(([a, [ok, all]]) => `${a} ${ok}/${all}`).join(' · ')}`);
  const dir = path.join(root, 'evals/results'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ url, at: new Date().toISOString(), score, results }, null, 2) + '\n');
  console.log(`Hisobot: ${path.relative(root, file)}`);
  if (score < min) process.exitCode = 1;
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { check, load };

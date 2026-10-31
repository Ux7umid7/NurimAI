// Live voice conversation (Gemini Live). The page (docs/app/live.html) talks to Google directly over a WebSocket;
// the server only hands out a short-lived token locked to NurimAI's model, voice and instruction, so the key never leaves it.
export const LIVE = Object.freeze({ model: 'gemini-3.8-live', voice: 'Sulafat', minutes: 15, tokens: 'https://generativelanguage.googleapis.com/v1beta/auth_tokens', socket: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained', page: 'https://ux7umid7.github.io/NurimAI/app/live.html' });
export const LIVE_INSTRUCTION = 'Sen NurimAI — foydalanuvchining mehribon ustozi va do‘sti, u bilan jonli ovozli suhbatdasan. O‘zbek tilida (foydalanuvchi boshqa tilda gapirsa, o‘sha tilda) tabiiy, iliq va qisqa gapir: odatda bir-uch gap, keyin foydalanuvchiga navbat ber. Ro‘yxat, belgi, formula va kod o‘qima — oddiy so‘zlar bilan tushuntir, matematikani og‘zaki ayt («x kvadrat», «yarim»). Savollar, uy vazifasi, til mashqi va o‘qishda yordam ber: javobni tayyor berib qo‘ymay, o‘ylashga undab, kerak bo‘lsa kichik savol bilan yo‘naltir. Bilmagan narsangni ayt, to‘qima. Eng so‘nggi yangilik va kurslarni bilmaysan: buni ochiq ayt. Foydalanuvchi to‘xtatsa yoki gapini bo‘lsa, darrov to‘xta va uni tingla.';
// The session the token is locked to; the page sends the same setup (plus a resumption handle when it reconnects).
export function liveSetup() {
  return { model: `models/${LIVE.model}`, generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: LIVE.voice } } } }, systemInstruction: { parts: [{ text: LIVE_INSTRUCTION }] }, inputAudioTranscription: {}, outputAudioTranscription: {}, sessionResumption: {} };
}
// One session; it must start within a minute, and the token (also used to resume after the server's goAway) ends with the call.
export function tokenRequest(now) {
  const { model, generationConfig, ...rest } = liveSetup();
  return { uses: 1, expireTime: new Date(now + (LIVE.minutes + 1) * 60000).toISOString(), newSessionExpireTime: new Date(now + 60000).toISOString(), liveConnectConstraints: { model, config: { ...generationConfig, ...rest } } };
}
export async function createLiveToken({ key, fetcher, now = Date.now(), signal }) {
  const response = await fetcher(LIVE.tokens, { method: 'POST', redirect: 'manual', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(tokenRequest(now)) });
  let data = {}; try { data = await response.json(); } catch {}
  if (!response.ok || typeof data.name !== 'string' || !data.name) { const error = new Error('live token'); error.status = response.status; throw error; }
  return { token: data.name, socket: LIVE.socket, setup: liveSetup(), minutes: LIVE.minutes, expiresAt: now + LIVE.minutes * 60000 };
}
// Telegram Mini App sign-in: initData is signed with the bot token (HMAC-SHA256 with the key "WebAppData"); a day at most.
export async function telegramUser(initData, botToken, now = Date.now()) {
  if (typeof initData !== 'string' || initData.length > 4096 || !botToken) return null;
  const params = new URLSearchParams(initData); const hash = params.get('hash'); if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
  params.delete('hash'); const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const hmac = async (key, text) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(text)));
  const secret = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const expected = Array.from(await hmac(secret, check), b => b.toString(16).padStart(2, '0')).join('');
  let diff = 0; for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ hash.charCodeAt(i); if (diff) return null;
  const date = Number(params.get('auth_date')); if (!Number.isFinite(date) || now / 1000 - date > 86400) return null;
  try { const user = JSON.parse(params.get('user') || 'null'); return Number.isSafeInteger(user?.id) ? { id: user.id, name: String(user.first_name || '').slice(0, 64) } : null; } catch { return null; }
}
export function validateLive(data) {
  if (!data || typeof data !== 'object') throw new Error('body');
  if (typeof data.initData === 'string' && data.initData) return { initData: data.initData.slice(0, 4096) };
  if (typeof data.deviceId !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.deviceId)) throw new Error('device');
  return { deviceId: data.deviceId };
}

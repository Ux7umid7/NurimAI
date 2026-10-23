const { execFile } = require('node:child_process');
// Belgilangan matn: faqat foydalanuvchi tugmani bosganda faol dasturga "nusxa olish" yuboriladi.
// Bufer avval to'liq o'qiladi va keyin qaytariladi; tiklab bo'lmaydigan narsa (masalan, nusxa olingan fayllar) bo'lsa bufer tozalanmaydi.
// Electron 44 bufer API'si asinxron (W3C uslubida): read/readText/write va'da qaytaradi.
const RESTORABLE = /^(text\/(plain|html|rtf)|image\/(png|bmp|jpeg))$/;
// Windows: avval Ctrl+Insert (hech qachon dasturni to'xtatmaydi), kerak bo'lsa Ctrl+C - lekin terminalda emas, u yerda Ctrl+C buyruqni to'xtatadi.
const WIN_WAIT = "Add-Type -AssemblyName System.Windows.Forms;$t=[Environment]::TickCount;while([System.Windows.Forms.Control]::ModifierKeys -ne 'None' -and ([Environment]::TickCount-$t) -lt 1500){Start-Sleep -Milliseconds 25};"; // Ctrl/Alt qo'yib yuborilgach, aks holda Ctrl+Alt+... bo'lib qoladi
const TERMINALS = ['WindowsTerminal', 'OpenConsole', 'conhost', 'cmd', 'powershell', 'pwsh', 'wsl', 'bash', 'mintty', 'putty', 'kitty', 'ConEmu', 'ConEmu64', 'alacritty', 'wezterm-gui', 'Hyper', 'Tabby', 'Code'];
const WIN_GUARD = "Add-Type -Name W -Namespace NurimAI -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int p);';$p=0;[void][NurimAI.W]::GetWindowThreadProcessId([NurimAI.W]::GetForegroundWindow(),[ref]$p);if(@(" + TERMINALS.map(n => `'${n}'`).join(',') + ") -contains (Get-Process -Id $p).ProcessName){exit 3};";
const WIN_KEYS = { insert: WIN_WAIT + "[System.Windows.Forms.SendKeys]::SendWait('^{INSERT}')", c: WIN_WAIT + WIN_GUARD + "[System.Windows.Forms.SendKeys]::SendWait('^c')" };
function pressCopy(platform, key = 'c', run = execFile) {
  return new Promise((resolve, reject) => {
    const done = error => error ? reject(error) : resolve();
    if (platform === 'win32') run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_KEYS[key]], { windowsHide: true, timeout: 6000 }, done);
    else if (platform === 'darwin') run('osascript', ['-e', 'delay 0.3', '-e', 'tell application "System Events" to keystroke "c" using {command down}'], { timeout: 5000 }, done);
    else reject(new Error('unsupported platform'));
  });
}
async function grabSelection({ clipboard, ClipboardItem, platform, press = pressCopy, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), timeout = 1200 }) {
  let saved = null; // [{mime: Blob}] - o'qilgan elementlarni qayta yozib bo'lmaydi, shuning uchun nusxasi olinadi
  try { saved = await Promise.all((await clipboard.read()).map(async item => Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))); } catch { /* o'qib bo'lmasa, bufer tegilmaydi */ }
  const restorable = Array.isArray(saved) && saved.every(item => Object.keys(item).every(type => RESTORABLE.test(type)));
  const before = await clipboard.readText();
  if (restorable) clipboard.clear();
  let copied = false;
  const keys = platform === 'win32' ? ['insert', 'c'] : ['c'];
  for (const [i, key] of keys.entries()) {
    try { await press(platform, key); } catch { continue; } // nusxa olib bo'lmadi (ruxsat yo'q yoki terminal): keyingi usul
    for (let waited = 0; waited <= (i < keys.length - 1 ? 600 : timeout); waited += 50) {
      const now = await clipboard.readText();
      if (restorable ? now : now !== before) { copied = true; break; }
      await wait(50);
    }
    if (copied) break;
  }
  const text = copied ? await clipboard.readText() : '';
  if (restorable) { if (saved.length) await clipboard.write(saved.map(item => new ClipboardItem(item))); else clipboard.clear(); }
  return text.trim();
}
module.exports = { grabSelection, pressCopy, RESTORABLE, TERMINALS };

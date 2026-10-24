// Turns LaTeX math in AI answers ($\frac{1}{2}$, \(x^2\), $$\sqrt{9}$$) into plain readable text (1/2, x², √9).
// Shared by the desktop app and the phone app; code blocks and `inline code` are left untouched.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.NurimMath = factory(); })(typeof self !== 'undefined' ? self : this, function () {
const SYMBOLS = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '~',
  lt: '<', gt: '>', infty: '∞', circ: '°', degree: '°', prime: '′', angle: '∠', perp: '⊥', parallel: '∥', triangle: '△', square: '□',
  to: '→', rightarrow: '→', Rightarrow: '⇒', implies: '⇒', leftarrow: '←', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', iff: '⇔', mapsto: '↦',
  sum: 'Σ', prod: '∏', int: '∫', oint: '∮', partial: '∂', nabla: '∇', in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', setminus: '∖',
  ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', therefore: '∴', because: '∵', propto: '∝', mid: '|', vert: '|', lvert: '|', rvert: '|', Vert: '‖',
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', quad: ' ', qquad: '  ',
  alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', Theta: 'Θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', Lambda: 'Λ', mu: 'μ', nu: 'ν', xi: 'ξ', Xi: 'Ξ', pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', Phi: 'Φ', chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω'
};
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'mod', 'bmod']);
const KEEP = new Set(['text', 'textrm', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'operatorname', 'boxed', 'mbox', 'hbox', 'bm', 'boldsymbol', 'overline', 'underline', 'bar', 'hat', 'tilde', 'vec', 'widehat', 'overrightarrow', 'textnormal', 'emph']);
const SIZING = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'middle', 'displaystyle', 'textstyle', 'limits', 'nolimits']);
const FRACTIONS = new Set(['frac', 'dfrac', 'tfrac', 'cfrac']);
const DOUBLE = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ' };
const UP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', '°': '°', '′': '′',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ' };
const DOWN = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' };
const simple = v => /^-?[^\s+\-−×÷·*/=<>±∓≤≥≠≈]+$/u.test(v);
const group = v => simple(v) ? v : `(${v})`;

// The argument after \frac, ^, _ ...: a {braced group}, a \command, or one character.
function arg(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] === '{') { let depth = 0; for (let j = i; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1]; } return [s.slice(i + 1), s.length]; }
  if (s[i] === '\\') { const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i)); return [m[0], i + m[0].length]; }
  return i < s.length ? [s[i], i + 1] : ['', i];
}
function script(v, map, mark) { const chars = [...v]; return chars.length && chars.every(c => map[c]) ? chars.map(c => map[c]).join('') : v.length === 1 ? mark + v : `${mark}(${v})`; }

function tex(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.?)/.exec(s.slice(i)), name = m[1]; i += m[0].length;
      let a;
      if (FRACTIONS.has(name)) { let b; [a, i] = arg(s, i); [b, i] = arg(s, i); out += `${group(tex(a))}/${group(tex(b))}`; }
      else if (name === 'sqrt') { let n = ''; if (s[i] === '[') { const end = s.indexOf(']', i); n = tex(s.slice(i + 1, end < 0 ? s.length : end)); i = end < 0 ? s.length : end + 1; } [a, i] = arg(s, i); out += (n ? script(n, UP, '^') : '') + '√' + group(tex(a)); }
      else if (name === 'mathbb') { [a, i] = arg(s, i); out += DOUBLE[a] ?? a; }
      else if (KEEP.has(name)) { [a, i] = arg(s, i); out += tex(a); }
      else if (name === 'begin' || name === 'end') [, i] = arg(s, i);
      else if (SIZING.has(name)) { if (s[i] === '.') i++; }
      else if (name === '\\') out += '\n';
      else if (name in SYMBOLS) out += SYMBOLS[name];
      else if (FUNCTIONS.has(name)) out += name;
      else if (name === ',' || name === ';' || name === ':' || name === ' ') out += ' ';
      else if (name === '!') { /* negative space */ }
      else out += name; // \% \$ \{ \} and unknown commands keep their text
      continue;
    }
    if (c === '^' || c === '_') { let a; [a, i] = arg(s, i + 1); out += script(tex(a), c === '^' ? UP : DOWN, c); continue; }
    if (c === '{') { let a; [a, i] = arg(s, i); out += tex(a); continue; }
    if (c === '}' || c === '&') { i++; continue; }
    out += c === '~' ? ' ' : c; i++;
  }
  return out;
}

// $...$ counts as math only when it looks like math, so "10$ va 20$" or "$5 dan $10 gacha" stay as money.
const SINGLE = /[\\^_{}=<>+\-*/()]|^[\p{L}\d.,]{1,4}$/u;
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\\d$])\$(?=[^\s$])([^$\n]+?)(?<=[^\s\\])\$(?![\d$])/g;
// Bare commands Gemini sometimes writes without $ (only these, so ordinary backslashes stay).
const BARE = /\\(?:d?frac|sqrt)\s*(?:\[[^\]\n]*\]\s*)?\{(?:[^{}\n]|\{[^{}\n]*\})*\}(?:\s*\{(?:[^{}\n]|\{[^{}\n]*\})*\})?|\\(?:times|cdot|div|pm|leq?|geq?|neq|approx|infty|pi)(?![a-zA-Z])/g;
function prose(text) {
  return text.replace(MATH, (all, display, square, round, single) => {
    const body = display ?? square ?? round ?? single;
    if (single !== undefined && !SINGLE.test(single)) return all;
    return tex(body).replace(/[ \t]{2,}/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/^[ \t]+|[ \t]+$/gm, '');
  }).replace(BARE, tex);
}
function plainMath(text) {
  if (typeof text !== 'string' || !/[$\\]/.test(text)) return text;
  let out = '', last = 0;
  for (const m of text.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]+`/g)) { out += prose(text.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
  return out + prose(text.slice(last));
}
return { plainMath, tex };
});

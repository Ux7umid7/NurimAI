const test=require('node:test');const assert=require('node:assert/strict');
const {plainMath}=require('../src/shared/math-text.js');const {parseQuiz,parseCards}=require('../src/practice.cjs');
test('LaTeX math in answers becomes plain text',()=>{
 const cases=[
  ['Kasr — bu son (masalan: $\\frac{1}{2}$ yoki $\\frac{3}{4}$).','Kasr — bu son (masalan: 1/2 yoki 3/4).'],
  ['$$\\frac{a+b}{c} = \\sqrt{x^2+1}$$','(a+b)/c = √(x²+1)'],
  ['Yuza: \\(S = \\pi r^2\\), burchak $90^\\circ$, $x_{1}$ va $x_2$','Yuza: S = π r², burchak 90°, x₁ va x₂'],
  ['$2^{10} = 1024$, $e^{-x}$, $a^{\\frac{1}{2}}$, $\\sqrt[3]{8} = 2$','2¹⁰ = 1024, e⁻ˣ, a^(1/2), ³√8 = 2'],
  ['$\\left( \\frac{1}{2} \\right)^2 = \\frac{1}{4}$','(1/2)² = 1/4'],
  ['$x \\in \\mathbb{R}$, $\\boxed{42}$, $\\text{Yuza} = 5\\,\\text{sm}^2$','x ∈ ℝ, 42, Yuza = 5 sm²'],
  ['\\[\\begin{aligned} x &= 2 \\\\ y &= 3 \\end{aligned}\\]','x = 2\ny = 3'],
  ["$x$ — noma'lum, $50\\%$ chegirma","x — noma'lum, 50% chegirma"],
  ['$\\dfrac{\\frac{1}{2}}{3}$, $-\\frac{1}{2}$, $\\frac12$, $3 \\times 4 \\div 2 \\neq 5$','(1/2)/3, -1/2, 1/2, 3 × 4 ÷ 2 ≠ 5'],
  ['**$x = 5$** va $a \\cdot b \\leq c$','**x = 5** va a · b ≤ c'],
  ['Javob: \\frac{2}{3} va 2 \\times 3 = 6','Javob: 2/3 va 2 × 3 = 6']
 ];
 for(const [from,to] of cases)assert.equal(plainMath(from),to,from);
});
test('money, code and ordinary backslashes are left alone',()=>{
 for(const text of ['Narx 10$ va 20$, yoki $5 dan $10 gacha.','Narx $5, chegirma $2','`$\\frac{1}{2}$` kodda qoladi','```\nprint("$x$", r"\\frac{1}{2}")\n```','Fayl: C:\\Users\\nur\\hisob.txt','Oddiy javob, formulasiz.'])assert.equal(plainMath(text),text);
 assert.equal(plainMath('$\\frac{1}{2}$ va `$\\frac{1}{2}$`'),'1/2 va `$\\frac{1}{2}$`');
});
test('AI-made quizzes and cards get the same cleanup',()=>{
 const quiz=parseQuiz(JSON.stringify({title:'Kasrlar',questions:[{q:'$\\frac{1}{2} + \\frac{1}{4}$ nechaga teng?',options:['$\\frac{3}{4}$','$\\frac{2}{6}$'],answer:0,explain:'Umumiy maxraj: $4$.'}]}));
 assert.deepEqual(quiz.questions[0],{q:'1/2 + 1/4 nechaga teng?',options:['3/4','2/6'],answer:0,explain:'Umumiy maxraj: 4.'});
 const cards=parseCards(JSON.stringify({title:'Darajalar',cards:[{front:'$2^3$',back:'$8$'}]}));
 assert.deepEqual(cards.cards[0],{front:'2³',back:'8'});
});

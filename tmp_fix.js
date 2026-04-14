const fs = require('fs');
const file = 'd:\\Antigraviti\\ALiSiO PMS\\src\\app\\guest\\[token]\\page.tsx';
let content = fs.readFileSync(file, 'utf8');
// Fix tc(xxx, lang) -> tc(xxx) but NOT translateContent(xxx, lang) or formatDateLocalized(xxx, lang) etc.
const matches = content.match(/tc\([^)]+, lang\)/g);
console.log('Found:', matches ? matches.length : 0, 'matches');
if (matches) matches.forEach(m => console.log(' ', m));
content = content.replace(/tc\(([^,]+), lang\)/g, 'tc($1)');
fs.writeFileSync(file, content);
console.log('Done');

const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'routes', 'customers.js');
let s = fs.readFileSync(file, 'utf8');
// Strip template literals, single and double quoted strings to reduce false positives
s = s.replace(/`[^`]*`/gs, '')
     .replace(/'[^']*'/g, '')
     .replace(/"[^\"]*"/g, '');
let counts = {curlyOpen:0,curlyClose:0,parenOpen:0,parenClose:0,brackOpen:0,brackClose:0};
for (let i = 0; i < s.length; i++) {
  const ch = s[i];
  if (ch === '{') counts.curlyOpen++;
  else if (ch === '}') counts.curlyClose++;
  else if (ch === '(') counts.parenOpen++;
  else if (ch === ')') counts.parenClose++;
  else if (ch === '[') counts.brackOpen++;
  else if (ch === ']') counts.brackClose++;
}
const out = 'counts: ' + JSON.stringify(counts) + '\n' + 'diffs: ' + JSON.stringify({curly: counts.curlyOpen - counts.curlyClose, paren: counts.parenOpen - counts.parenClose, brack: counts.brackOpen - counts.brackClose}) + '\n';
fs.writeFileSync(path.join(__dirname, 'brace_result.txt'), out);
console.log(out);
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'routes', 'customers.js');
let s = fs.readFileSync(file, 'utf8');
// Strip template literals, single and double quoted strings to reduce false positives
s = s.replace(/`[^`]*`/gs, '')
     .replace(/'[^']*'/g, '')
     .replace(/"[^\"]*"/g, '');
const lines = s.split(/\r?\n/);
let stackCurly = [];
let stackParen = [];
for (let lineNo = 1; lineNo <= lines.length; lineNo++) {
  const line = lines[lineNo-1];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '{') stackCurly.push({line: lineNo, col: i});
    else if (ch === '}') stackCurly.pop();
    else if (ch === '(') stackParen.push({line: lineNo, col: i});
    else if (ch === ')') stackParen.pop();
  }
}
const unmatchedCurly = stackCurly[stackCurly.length-1];
const unmatchedParen = stackParen[stackParen.length-1];
console.log('Unmatched curly at:', unmatchedCurly, '\nLine:', lines[unmatchedCurly.line-1]);
console.log('Unmatched paren at:', unmatchedParen, '\nLine:', lines[unmatchedParen.line-1]);
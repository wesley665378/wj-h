const fs = require('fs');
let code = fs.readFileSync('views/Evaluation.tsx', 'utf8');
code = code.replace(
  'className="[&_tr:last-child_td]:border-b-0 [&_tr:last-child]:border-b-0"',
  'className="[&_tr:last-child>td]:border-b-0 [&_tr:last-child]:border-b-0"'
);
fs.writeFileSync('views/Evaluation.tsx', code);

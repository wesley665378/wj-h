const fs = require('fs');
let code = fs.readFileSync('views/Distribution.tsx', 'utf-8');

const regex = /{\/\* Column 4: 积分额度\/当月结余 \*\/}[\s\S]*?{\/\* Column 4: 积分额度\/当月结余 \*\//;
if (regex.test(code)) {
  code = code.replace(regex, '{/* Column 4: 积分额度/当月结余 */');
  fs.writeFileSync('views/Distribution.tsx', code, 'utf-8');
  console.log("Fixed!");
}

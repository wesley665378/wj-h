const fs = require('fs');

const files = fs.readdirSync('views').filter(f => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = 'views/' + file;
  let code = fs.readFileSync(filePath, 'utf-8');
  let originalCode = code;

  let needsImport = false;
  
  // Replace in template strings: `something rounded-[3rem] something`
  // We can just replace 'rounded-[2.5rem]', 'rounded-[3rem]', 'rounded-[3.5rem]' with '${UI_TOKENS.RADIUS_PANEL}'
  // BUT we must differentiate if they are in normal strings or template strings!
  
  // Actually, replacing all occurrences:
  code = code.replace(/className=(["'])(.*?)(rounded-\[2\.5rem\]|rounded-\[3rem\]|rounded-\[3\.5rem\])(.*?)\1/g, (match, quote, before, rounded, after) => {
    needsImport = true;
    return `className={\`${before}\${UI_TOKENS.RADIUS_PANEL}${after}\`}`;
  });

  // What if it's already in a template string? `className={\`something rounded-[3rem]\`}`
  code = code.replace(/(rounded-\[2\.5rem\]|rounded-\[3rem\]|rounded-\[3\.5rem\])/g, (match) => {
    needsImport = true;
    return '${UI_TOKENS.RADIUS_PANEL}';
  });

  if (needsImport) {
    if (!code.includes('import { UI_TOKENS }')) {
      code = code.replace(/import React/, "import { UI_TOKENS } from '../src/constants/uiTokens';\nimport React");
    }
    fs.writeFileSync(filePath, code, 'utf-8');
    console.log("Updated", filePath);
  }
}

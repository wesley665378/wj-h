const fs = require('fs');
let code = fs.readFileSync('views/Dashboard.tsx', 'utf-8');

code = code.replace(/w-\[24%\] py-4/g, 'w-[24%] aspect-[5/3]');
code = code.replace(/w-\[28%\] py-4/g, 'w-[28%] aspect-[2/1]');

fs.writeFileSync('views/Dashboard.tsx', code, 'utf-8');
console.log('Fixed aspect ratios');

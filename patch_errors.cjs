const fs = require('fs');
let code = fs.readFileSync('views/ValueCreation.tsx', 'utf8');

code = code.replace(
  'cClassCost: cClassCostStr,',
  'cClassCost: getCClassCostForCollector(collector.id),'
);

code = code.replace(
  "confirmationType: category === RefineCategory.Value ? '联动确权' : '收款确权',",
  "confirmationType: (category === RefineCategory.Value ? '联动确权' : '收款确权') as any,"
);

code = code.replace(/window\.toast/g, 'toast');

fs.writeFileSync('views/ValueCreation.tsx', code);
console.log('done');

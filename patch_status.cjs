const fs = require('fs');
let code = fs.readFileSync('src/utils/projectStatus.ts', 'utf8');

code = code.replace(
`  if (isMineralArchived(resource)) {
    return { status: ProjectStatus.Archived };
  }

  const reachedMs = toReachedMs(resource);
  const isCapped = isMineralCapReached(resource) && reachedMs > 0;
  const isStockIn = resource.status === ResourceStatus.StockIn;

  if (isCapped || isStockIn) {
    return { 
       status: ProjectStatus.Capping, 
       remainingDays: getSettlingDaysLeft(resource) 
     };
  }`,
`  const lifecycle = (resource.lifecycleStatus || '').toLowerCase();
  
  if (lifecycle === 'archived' || isMineralArchived(resource)) {
    return { status: ProjectStatus.Archived };
  }

  const reachedMs = toReachedMs(resource);
  const isCapped = isMineralCapReached(resource) && reachedMs > 0;

  if (lifecycle === 'settling' || isCapped) {
    return { 
       status: ProjectStatus.Capping, 
       remainingDays: getSettlingDaysLeft(resource) 
     };
  }`
);

fs.writeFileSync('src/utils/projectStatus.ts', code);
console.log('done');

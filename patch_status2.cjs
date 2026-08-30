const fs = require('fs');
let code = fs.readFileSync('src/utils/projectStatus.ts', 'utf8');

const regex = /export function deriveProjectStatus\([\s\S]*?return \{ status: ProjectStatus\.InProgress \};\n\}/;

const newFunc = `export function deriveProjectStatus(resource?: MiningResource | null): { status: ProjectStatus; remainingDays?: number } {
  if (!resource) {
    return { status: ProjectStatus.InProgress };
  }

  const lifecycle = (resource.lifecycleStatus || '').toLowerCase();
  
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
  }

  return { status: ProjectStatus.InProgress };
}`;

if (regex.test(code)) {
    code = code.replace(regex, newFunc);
    fs.writeFileSync('src/utils/projectStatus.ts', code);
    console.log("Success");
} else {
    console.log("Failed to match deriveProjectStatus");
}

import re

file_path = 'views/ValueCreation.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Fix import
content = content.replace(
    "import { centerMatch } from '@/utils/centerScope';",
    "import { centerMatch, isGlobalReader } from '@/utils/centerScope';"
)

# Fix submit payload
target = r"""    if (logsToSubmit.length > 0) {
      onLogSubmit(logsToSubmit);
      try {
        if (!persistWorkspaceWithOverrides) {
          toast.error('工作区同步未就绪，请刷新后重试');
          return;
        }
        await persistWorkspaceWithOverrides({ logs: logsToSubmit }, { loadingMessage: '提报落库中…', successMessage: '已落库' });
      } catch (err) {
        // Handled inside persistWorkspaceWithOverrides via toast
      }
    }"""

replacement = r"""    if (logsToSubmit.length > 0) {
      onLogSubmit(logsToSubmit);
      try {
        if (!persistWorkspaceWithOverrides) {
          toast.error('工作区同步未就绪，请刷新后重试');
          return;
        }
        const jzczLogs = logs.filter(l => l.confirmationType !== '手动确权');
        const payloadLogs = isGlobalReader(user) ? [...jzczLogs, ...logsToSubmit] : logsToSubmit;
        await persistWorkspaceWithOverrides({ logs: payloadLogs }, { loadingMessage: '提报落库中…', successMessage: '已落库' });
      } catch (err) {
        // Handled inside persistWorkspaceWithOverrides via toast
      }
    }"""

content = content.replace(target, replacement)

with open(file_path, 'w') as f:
    f.write(content)


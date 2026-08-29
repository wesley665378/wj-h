import re

file_path = 'views/DynamicConsumption.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Replace handleOffsetSubmit persist logic
offset_old = r"""        const toastId = toast\.loading\('申报保存中…'\);\s*try \{\s*const res = await persistDtcbLogs\(\[newLog\]\);\s*if \(res && res\.workspaceVersion !== undefined\) \{\s*\(window as any\)\.workspaceVersion = res\.workspaceVersion;\s*\}\s*if \(updateLastSyncedFingerprint\) \{\s*setTimeout\(\(\) => \{\s*updateLastSyncedFingerprint\(\);\s*\}, 0\);\s*\}\s*toast\.success\('已落库', \{ id: toastId \}\);\s*\} catch \(err: any\) \{\s*toastApiError\(err, '申报落库失败'\);\s*\}"""

offset_new = r"""        try {
          const nextDtcb = [...dtcbLogsToUse, newLog];
          const payload = isGlobalReader(user) ? nextDtcb : [newLog];
          if (persistWorkspaceWithOverrides) {
            await persistWorkspaceWithOverrides({ logs: payload }, { loadingMessage: '申报保存中…', successMessage: '已落库' });
          } else {
            const toastId = toast.loading('申报保存中…');
            const res = await persistDtcbLogs(payload);
            if (res && res.workspaceVersion !== undefined) {
              (window as any).workspaceVersion = res.workspaceVersion;
            }
            if (updateLastSyncedFingerprint) {
              setTimeout(() => updateLastSyncedFingerprint(), 0);
            }
            toast.success('已落库', { id: toastId });
          }
        } catch (err: any) {
          // Handled inside persistWorkspaceWithOverrides via toast
        }"""

content = re.sub(offset_old, offset_new, content, count=1)

# Replace handleDeductionSubmit persist logic
deduction_old = r"""        const toastId = toast\.loading\('对冲申请提交中…'\);\s*try \{\s*const res = await persistDtcbLogs\(\[deductionLog\]\);\s*if \(res && res\.workspaceVersion !== undefined\) \{\s*\(window as any\)\.workspaceVersion = res\.workspaceVersion;\s*\}\s*if \(updateLastSyncedFingerprint\) \{\s*setTimeout\(\(\) => \{\s*updateLastSyncedFingerprint\(\);\s*\}, 0\);\s*\}\s*toast\.success\('已落库', \{ id: toastId \}\);\s*\} catch \(err: any\) \{\s*toastApiError\(err, '对冲申请提交失败'\);\s*\}"""

deduction_new = r"""        try {
          const nextDtcb = [...dtcbLogsToUse, deductionLog];
          const payload = isGlobalReader(user) ? nextDtcb : [deductionLog];
          if (persistWorkspaceWithOverrides) {
            await persistWorkspaceWithOverrides({ logs: payload }, { loadingMessage: '对冲申请提交中…', successMessage: '已落库' });
          } else {
            const toastId = toast.loading('对冲申请提交中…');
            const res = await persistDtcbLogs(payload);
            if (res && res.workspaceVersion !== undefined) {
              (window as any).workspaceVersion = res.workspaceVersion;
            }
            if (updateLastSyncedFingerprint) {
              setTimeout(() => updateLastSyncedFingerprint(), 0);
            }
            toast.success('已落库', { id: toastId });
          }
        } catch (err: any) {
          // Handled inside persistWorkspaceWithOverrides via toast
        }"""

content = re.sub(deduction_old, deduction_new, content, count=1)

with open(file_path, 'w') as f:
    f.write(content)


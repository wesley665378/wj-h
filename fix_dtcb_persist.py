import re

file_path = 'views/DynamicConsumption.tsx'
with open(file_path, 'r') as f:
    content = f.read()

target1 = r"""        try {
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

replace1 = r"""        try {
          const nextDtcb = [...dtcbLogsToUse, newLog];
          const payload = isGlobalReader(user) ? nextDtcb : [newLog];
          const toastId = toast.loading('申报保存中…');
          const res = await persistDtcbLogs(payload);
          if (res && res.workspaceVersion !== undefined) {
            (window as any).workspaceVersion = res.workspaceVersion;
          }
          if (updateLastSyncedFingerprint) {
            setTimeout(() => updateLastSyncedFingerprint(), 0);
          }
          toast.success('已落库', { id: toastId });
        } catch (err: any) {
          toastApiError(err, '申报保存失败');
        }"""

content = content.replace(target1, replace1)

target2 = r"""        try {
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

replace2 = r"""        try {
          const nextDtcb = [...dtcbLogsToUse, deductionLog];
          const payload = isGlobalReader(user) ? nextDtcb : [deductionLog];
          const toastId = toast.loading('对冲申请提交中…');
          const res = await persistDtcbLogs(payload);
          if (res && res.workspaceVersion !== undefined) {
            (window as any).workspaceVersion = res.workspaceVersion;
          }
          if (updateLastSyncedFingerprint) {
            setTimeout(() => updateLastSyncedFingerprint(), 0);
          }
          toast.success('已落库', { id: toastId });
        } catch (err: any) {
          toastApiError(err, '对冲申请提交失败');
        }"""

content = content.replace(target2, replace2)

with open(file_path, 'w') as f:
    f.write(content)


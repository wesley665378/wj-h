file_path = 'App.tsx'
with open(file_path, 'r') as f:
    content = f.read()

target = """  const getWorkspaceFingerprint = React.useCallback(() => {
    return [
      managedUsers.length, managedUsers[managedUsers.length - 1]?.id, managedUsers[managedUsers.length - 1]?.category,
      logs.length, logs[logs.length - 1]?.id, logs[logs.length - 1]?.status, logs[logs.length - 1]?.dynamicCost,
      transactions.length, transactions[transactions.length - 1]?.id, transactions[transactions.length - 1]?.status,
      miningResources.length, miningResources[miningResources.length - 1]?.id, miningResources[miningResources.length - 1]?.version,
      circuitBreakers.length, circuitBreakers[circuitBreakers.length - 1]?.id, circuitBreakers[circuitBreakers.length - 1]?.status,
      systemLogs.length,
      meetingSamples.length,
      acceptanceRecords.length,
      filterMonth
    ].join('|');
  }, [managedUsers, logs, transactions, miningResources, circuitBreakers, systemLogs, meetingSamples, acceptanceRecords, filterMonth]);

  const updateLastSyncedFingerprint = React.useCallback(() => {
    lastSyncedFingerprintRef.current = getWorkspaceFingerprint();
  }, [getWorkspaceFingerprint]);"""

replacement = """  const getWorkspaceFingerprint = React.useCallback((overrides?: any) => {
    const currentUsers = overrides?.users ?? managedUsers;
    const currentLogs = overrides?.logs ?? logs;
    const currentTxs = overrides?.transactions ?? transactions;
    const currentRes = overrides?.miningResources ?? miningResources;
    const currentCBs = overrides?.circuitBreakers ?? circuitBreakers;
    const currentSamples = overrides?.meetingSamples ?? meetingSamples;
    const currentRecords = overrides?.acceptanceRecords ?? acceptanceRecords;

    return [
      currentUsers.length, currentUsers[currentUsers.length - 1]?.id, currentUsers[currentUsers.length - 1]?.category,
      currentLogs.length, currentLogs[currentLogs.length - 1]?.id, currentLogs[currentLogs.length - 1]?.status, currentLogs[currentLogs.length - 1]?.dynamicCost,
      currentTxs.length, currentTxs[currentTxs.length - 1]?.id, currentTxs[currentTxs.length - 1]?.status,
      currentRes.length, currentRes[currentRes.length - 1]?.id, currentRes[currentRes.length - 1]?.version,
      currentCBs.length, currentCBs[currentCBs.length - 1]?.id, currentCBs[currentCBs.length - 1]?.status,
      systemLogs.length,
      currentSamples.length,
      currentRecords.length,
      filterMonth
    ].join('|');
  }, [managedUsers, logs, transactions, miningResources, circuitBreakers, systemLogs, meetingSamples, acceptanceRecords, filterMonth]);

  const updateLastSyncedFingerprint = React.useCallback((overrides?: any) => {
    lastSyncedFingerprintRef.current = getWorkspaceFingerprint(overrides);
  }, [getWorkspaceFingerprint]);"""

content = content.replace(target, replacement)

target2 = """      updateLastSyncedFingerprint();"""
replace2 = """      updateLastSyncedFingerprint(overrides);"""

content = content.replace(target2, replace2)

with open(file_path, 'w') as f:
    f.write(content)


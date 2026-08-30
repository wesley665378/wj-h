const fs = require('fs');
let code = fs.readFileSync('views/ValueCreation.tsx', 'utf8');

const importLogic = `
  const handleDownloadTemplate = () => {
    const templateData = [{
      '矿山编号': 'R001',
      '类别': '收款', // 或 产值
      '业务日期': new Date().toISOString().slice(0, 10),
      '采集主体': '工号或姓名(张三)',
      '注入金额': 10000,
      '提炼类型': '企业项目',
      '成本档位': 'T1',
      '操作员': '当前登入账号(可选)'
    }];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "导入模板");
    exportWorkbook(workbook, "价值创造批量导入模板.xlsx");
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > EXCEL_IMPORT_MAX_BYTES) {
      toast.error(\`文件大小不能超过 \${EXCEL_IMPORT_MAX_BYTES / 1024 / 1024}MB\`);
      return;
    }

    setImportLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet);

      if (rows.length > EXCEL_IMPORT_MAX_ROWS) {
        toast.error(\`一次最多导入 \${EXCEL_IMPORT_MAX_ROWS} 行\`);
        return;
      }

      const logsToSubmit: ValueCreationLog[] = [];
      const errorLines: string[] = [];
      const miningTotalMap = new Map<string, { [RefineCategory.Value]: number, [RefineCategory.Revenue]: number }>();

      let lineNum = 1;
      for (const row of rows) {
        lineNum++;
        
        const miningId = row['矿山编号']?.toString().trim();
        const categoryStr = row['类别']?.toString().trim();
        const businessDateStr = row['业务日期']?.toString().trim();
        const collectorStr = row['采集主体']?.toString().trim();
        const rawAmount = parseFloat(row['注入金额']);
        const refineTypeStr = row['提炼类型']?.toString().trim();
        const tierStr = row['成本档位']?.toString().trim() || 'T1';
        const operatorStr = row['操作员']?.toString().trim();

        if (!miningId || !categoryStr || !businessDateStr || !collectorStr || isNaN(rawAmount) || rawAmount <= 0) {
          errorLines.push(\`第 \${lineNum} 行: 缺少必填字段或金额格式不正确\`);
          continue;
        }
        
        const bDate = new Date(businessDateStr);
        if (isNaN(bDate.getTime())) {
            errorLines.push(\`第 \${lineNum} 行: 业务日期格式错误\`);
            continue;
        }

        const resource = resources.find(r => r.id === miningId);
        if (!resource) {
          errorLines.push(\`第 \${lineNum} 行: 找不到矿山 [\${miningId}]\`);
          continue;
        }
        if (!isProjectWritable(resource)) {
          errorLines.push(\`第 \${lineNum} 行: 矿山 [\${miningId}] 状态不可提报\`);
          continue;
        }

        const { status } = deriveProjectStatus(resource);
        if (status !== ProjectStatus.InProgress) {
          errorLines.push(\`第 \${lineNum} 行: 矿山 [\${miningId}] 处于\${status}状态\`);
          continue;
        }

        const category = categoryStr === '产值' ? RefineCategory.Value : (categoryStr === '收款' ? RefineCategory.Revenue : null);
        if (!category) {
          errorLines.push(\`第 \${lineNum} 行: 类别必须是 收款 或 产值\`);
          continue;
        }
        
        if (category === RefineCategory.Value && resource.valueDepleted) {
          errorLines.push(\`第 \${lineNum} 行: 矿山产出已满，无法继续提报产值\`);
          continue;
        }

        const collector = managedUsers.find(u => u.id === collectorStr || u.name === collectorStr);
        if (!collector) {
          errorLines.push(\`第 \${lineNum} 行: 找不到采集主体 [\${collectorStr}]\`);
          continue;
        }

        if (category === RefineCategory.Revenue) {
           if (!centerMatch(resource.assignedToRevenue, collector.center) && !centerMatch(resource.assignedTo, collector.center)) {
              errorLines.push(\`第 \${lineNum} 行: 采集主体不具备该矿山的收款权限\`);
              continue;
           }
        } else {
           if (!centerMatch(resource.assignedToValue, collector.center) && !centerMatch(resource.assignedTo, collector.center)) {
              errorLines.push(\`第 \${lineNum} 行: 采集主体不具备该矿山的产值权限\`);
              continue;
           }
        }

        const operatorObj = operatorStr ? managedUsers.find(u => u.id === operatorStr || u.name === operatorStr) : user;
        const operatorIdToUse = operatorObj?.id || user.id;

        let refineType = refineTypeStr as RefineType;
        if (!refineType) {
           if (miningId.startsWith('A')) refineType = RefineType.Enterprise;
           else if (miningId.startsWith('B')) refineType = RefineType.Bidding;
           else if (miningId.startsWith('C')) refineType = RefineType.SafetyEval;
           else refineType = resource.types?.[0] || RefineType.Enterprise;
        }
        
        let factor = 0;
        if (category === RefineCategory.Value) {
          if (refineType && resource.refineTypeFactors?.[refineType]?.customValueFactor !== undefined) factor = resource.refineTypeFactors[refineType]!.customValueFactor;
          else if (resource.customValueFactor !== undefined) factor = resource.customValueFactor;
        } else {
          if (refineType && resource.refineTypeFactors?.[refineType]?.customRevenueFactor !== undefined) factor = resource.refineTypeFactors[refineType]!.customRevenueFactor;
          else if (resource.customRevenueFactor !== undefined) factor = resource.customRevenueFactor;
        }

        if (factor === 0) {
          const isHighValueExpert = (collector.category || '').includes('高产专') || (collector.secondaryRoles || []).includes('高产专');
          const isHighRevenueExpert = (collector.category || '').includes('高款专') || (collector.secondaryRoles || []).includes('高款专');
          const vCoeffs = isHighValueExpert ? TIER_COEFFICIENTS.VALUE_MANAGER : TIER_COEFFICIENTS.VALUE_CHAN;
          const rCoeffs = isHighRevenueExpert ? TIER_COEFFICIENTS.REVENUE_HIGH : TIER_COEFFICIENTS.REVENUE_MID_INITIAL;
          const tier = normalizeRefineTier(tierStr);

          if (category === RefineCategory.Value) {
            if (tier === 'T1') factor = vCoeffs.Enterprise;
            else if (tier === 'T2') factor = vCoeffs.Bidding;
            else if (tier === 'T3') factor = vCoeffs.SafetyEval;
            else factor = vCoeffs.OccHealth;
          } else {
            if (tier === 'T1') factor = rCoeffs.Enterprise;
            else if (tier === 'T2') factor = rCoeffs.Bidding;
            else if (tier === 'T3') factor = rCoeffs.SafetyEval;
            else factor = rCoeffs.SafetyEval;
          }
        }

        const allResourceLogs = logs.filter(l => l && l.miningId === miningId && (l.status === AuditStatus.Confirmed || l.status === AuditStatus.Approved));
        const hedgeInfo = calculateHedgeCapacitiesAndWeights(resource, allResourceLogs);
        const cWeight = hedgeInfo.cWeightRev;
        const b2Weight = hedgeInfo.b2Weight;

        const isHighExpert = isValueExpert(collector) || isRevenueExpert(collector);
        let pPre = 0;
        if (category === RefineCategory.Value) {
            pPre = calculateT1PlusValue(rawAmount, !!isHighExpert, tierStr as any, cWeight, b2Weight);
        } else {
            pPre = calculateT1PlusRevenue(rawAmount, !!isHighExpert, tierStr as any, cWeight);
        }
        
        const currentCap = getCurrentValueCapacity(resource) || 0;
        const kFactor = (category === RefineCategory.Value && pPre > currentCap)
           ? (currentCap / pPre)
           : 1.0;
        
        const netValue = pPre * kFactor;

        let cClassCostStr = '';
        if (collector.category) {
          const parts = collector.category.split('/');
          cClassCostStr = parts[parts.length - 1] || 'C0';
        } else {
          cClassCostStr = 'C0';
        }

        const mStr = \`\${bDate.getFullYear()}-\${String(bDate.getMonth() + 1).padStart(2, '0')}\`;

        if (!miningTotalMap.has(miningId)) {
            miningTotalMap.set(miningId, { [RefineCategory.Value]: 0, [RefineCategory.Revenue]: 0 });
        }
        miningTotalMap.get(miningId)![category] += rawAmount;

        if (category === RefineCategory.Value && refineType === RefineType.Outsourced && resource.monthlyQuota !== undefined) {
            const monthlyUsed = resource.monthlyUsed || 0;
            if (monthlyUsed + miningTotalMap.get(miningId)![category] > resource.monthlyQuota + 0.01) {
                errorLines.push(\`第 \${lineNum} 行: 矿山 [\${miningId}] 本月外派额度不足\`);
                miningTotalMap.get(miningId)![category] -= rawAmount;
                continue;
            }
        }

        logsToSubmit.push({
            id: \`\${category === RefineCategory.Revenue ? 'J' : 'M'}\${(Date.now() % 100000000 + lineNum).toString().padStart(8, '0')}\`,
            miningId: miningId,
            rankId: operatorIdToUse,
            recordedCollectorId: collector.id,
            category: category,
            type: refineType,
            costCategory: tierStr as any,
            amount: rawAmount,
            rawAmount: rawAmount,
            dynamicCost: 0,
            cClassCost: cClassCostStr,
            cClassRatio: cWeight,
            b2ClassRatio: b2Weight,
            netValue: netValue,
            timestamp: Date.now(),
            status: AuditStatus.Pending,
            confirmationType: category === RefineCategory.Value ? '联动确权' : '收款确权',
            month: mStr,
            businessDate: businessDateStr
        });
      }

      if (errorLines.length > 0) {
        const errorText = errorLines.slice(0, 5).join('\\n') + (errorLines.length > 5 ? '\\n...' : '');
        if (window.toast) window.toast.error(\`部分数据导入失败，共 \${errorLines.length} 条:\\n\${errorText}\`, { duration: 5000 });
        else alert(\`部分数据导入失败，共 \${errorLines.length} 条:\\n\${errorText}\`);
      }

      if (logsToSubmit.length > 0) {
        onLogSubmit(logsToSubmit);
        if (typeof persistWorkspaceWithOverrides === "function") {
          const jzczLogs = logs.filter(l => l.confirmationType !== '手动确权');
          const payloadLogs = isGlobalReader(user) ? [...jzczLogs, ...logsToSubmit] : logsToSubmit;
          await persistWorkspaceWithOverrides({ logs: payloadLogs }, { loadingMessage: '批量导入落库中…', successMessage: \`成功导入 \${logsToSubmit.length} 条确权记录\` });
        }
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      if (window.toast) window.toast.error('导入失败：' + (err as Error).message);
      else alert('导入失败：' + (err as Error).message);
    } finally {
      setImportLoading(false);
    }
  };

  const exportToExcel = () => {
`;

code = code.replace('  const exportToExcel = () => {', importLogic);
fs.writeFileSync('views/ValueCreation.tsx', code);
console.log('done');

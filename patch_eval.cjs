const fs = require('fs');
let code = fs.readFileSync('views/Evaluation.tsx', 'utf8');

// 1. Add ChevronDown, ChevronUp to imports
if (!code.includes('ChevronDown')) {
  code = code.replace("import { Search } from 'lucide-react';", "import { Search, ChevronDown, ChevronUp } from 'lucide-react';");
}

// 2. Add state for expandedCosts
const stateLine = "const [selectedCategory, setSelectedCategory] = useState<string>('ALL');";
if (!code.includes('expandedCosts')) {
  code = code.replace(stateLine, stateLine + "\n  const [expandedCosts, setExpandedCosts] = useState<Set<string>>(new Set());\n  const toggleCost = (id: string) => {\n    setExpandedCosts(prev => {\n      const next = new Set(prev);\n      if (next.has(id)) next.delete(id);\n      else next.add(id);\n      return next;\n    });\n  };");
}

// 3. Replace cost td in two-row layout (rowSpan={2})
const prodCostRegex = /<td rowSpan={2} className="py-2\.5 px-3 text-right whitespace-nowrap font-mono text-xs font-semibold text-slate-800 align-middle border-b border-slate-200 border-x border-slate-100 bg-white">\s*\{maskMoney\(e\.monthlyCost\)\}\s*<\/td>/;
const prodCostReplacement = `<td rowSpan={2} className="py-2.5 px-3 text-right whitespace-nowrap align-middle border-b border-slate-200 border-x border-slate-100 bg-white">
                            <div className="flex flex-col items-end w-full min-w-[120px]">
                              <div className="flex items-center justify-end space-x-2 w-full">
                                <span className="font-mono text-xs font-semibold text-slate-800">{maskMoney(e.monthlyCost)}</span>
                                <button onClick={() => toggleCost(e.userId)} className="text-slate-400 hover:text-slate-600 transition-colors flex items-center text-[9px] bg-slate-50 px-1 py-0.5 rounded border border-slate-200">
                                  明细 {expandedCosts.has(e.userId) ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                                </button>
                              </div>
                              {expandedCosts.has(e.userId) && (
                                <div className="mt-2 w-full bg-slate-50/80 border border-slate-100 rounded p-1.5 space-y-1 text-[10px] text-slate-500 font-mono text-right">
                                  <div className="flex justify-between items-center">
                                    <span>工资</span>
                                    <span className="text-slate-700">{maskMoney(e.baseSalary || 0)}</span>
                                  </div>
                                  {e.isRevenueExpert && (
                                    <div className="flex justify-between items-center">
                                      <span>A类</span>
                                      <span className="text-slate-700">{maskMoney(e.aCost || 0)}</span>
                                    </div>
                                  )}
                                  {e.isProdExpert && (
                                    <div className="flex justify-between items-center">
                                      <span>B1类</span>
                                      <span className="text-slate-700">{maskMoney(e.b1Cost || 0)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center text-slate-400">
                                      D类
                                      <InfoTip title="D类成本" content="经营单元开支，无项目。按实际发生月人员平均分摊" className="ml-1 opacity-70 hover:opacity-100" />
                                    </span>
                                    <span className="text-slate-700">{maskMoney(e.dCost || 0)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="flex items-center text-slate-400">
                                      FXDC
                                      <InfoTip title="FXDC" content="非有效工时对冲，冲抵刚性工资包" className="ml-1 opacity-70 hover:opacity-100" />
                                    </span>
                                    <span className="text-emerald-600">-{maskMoney(e.nonEffectiveDeduction || 0)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>`;

code = code.replace(prodCostRegex, prodCostReplacement);

// 4. Replace cost td in single-row layout
const singleCostRegex = /<td className="py-2\.5 px-3 text-right whitespace-nowrap font-mono text-xs font-semibold text-slate-800 align-middle border-x border-slate-100">\s*\{maskMoney\(e\.monthlyCost\)\}\s*<\/td>/;
const singleCostReplacement = `<td className="py-2.5 px-3 text-right whitespace-nowrap align-middle border-x border-slate-100">
                        <div className="flex flex-col items-end w-full min-w-[120px]">
                          <div className="flex items-center justify-end space-x-2 w-full">
                            <span className="font-mono text-xs font-semibold text-slate-800">{maskMoney(e.monthlyCost)}</span>
                            <button onClick={() => toggleCost(e.userId)} className="text-slate-400 hover:text-slate-600 transition-colors flex items-center text-[9px] bg-slate-50 px-1 py-0.5 rounded border border-slate-200">
                              明细 {expandedCosts.has(e.userId) ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                            </button>
                          </div>
                          {expandedCosts.has(e.userId) && (
                            <div className="mt-2 w-full bg-slate-50/80 border border-slate-100 rounded p-1.5 space-y-1 text-[10px] text-slate-500 font-mono text-right">
                              <div className="flex justify-between items-center">
                                <span>工资</span>
                                <span className="text-slate-700">{maskMoney(e.baseSalary || 0)}</span>
                              </div>
                              {e.isRevenueExpert && (
                                <div className="flex justify-between items-center">
                                  <span>A类</span>
                                  <span className="text-slate-700">{maskMoney(e.aCost || 0)}</span>
                                </div>
                              )}
                              {e.isProdExpert && (
                                <div className="flex justify-between items-center">
                                  <span>B1类</span>
                                  <span className="text-slate-700">{maskMoney(e.b1Cost || 0)}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center">
                                <span className="flex items-center text-slate-400">
                                  D类
                                  <InfoTip title="D类成本" content="经营单元开支，无项目。按实际发生月人员平均分摊" className="ml-1 opacity-70 hover:opacity-100" />
                                </span>
                                <span className="text-slate-700">{maskMoney(e.dCost || 0)}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="flex items-center text-slate-400">
                                  FXDC
                                  <InfoTip title="FXDC" content="非有效工时对冲，冲抵刚性工资包" className="ml-1 opacity-70 hover:opacity-100" />
                                </span>
                                <span className="text-emerald-600">-{maskMoney(e.nonEffectiveDeduction || 0)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>`;

code = code.replace(singleCostRegex, singleCostReplacement);

fs.writeFileSync('views/Evaluation.tsx', code);
console.log('done');

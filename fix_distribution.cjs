const fs = require('fs');
let code = fs.readFileSync('views/Distribution.tsx', 'utf-8');

const badPart = `                      {/* Column 4: 积分额度/当月结余 */}
                      <td className="p-0 border border-slate-200">
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-bold text-slate-700 whitespace-nowrap relative group">
                              <div 
                                className="flex items-center gap-1.5 cursor-pointer transition-all hover:text-blue-600 px-2 py-0.5 rounded hover:bg-blue-50"
                                title={isCostVisible ? \`刚性工资包(\${formatAmount(data.salaryPackage)}) + 浮动成本(\${formatAmount(data.isRevenueExpert ? (data.aCostApproved || 0) : (data.bCostApproved || 0))})\` : "点击查看数值"}
                                onClick={toggleCostVisibility}
                              >
                                <span>
                                  {isCostVisible ? (
                                    <>
                                      {fmtAmount(data.salaryPackage + (data.isRevenueExpert ? (data.aCostApproved || 0) : (data.bCostApproved || 0)))}
                                    </>
                                  ) : (
                                    <span className="text-slate-300">********</span>
                                  )}
                                </span>
                                {isCostVisible ? (
                                  <Eye size={12} className="text-slate-300 invisible group-hover:visible" />
                                ) : (
                                  <EyeOff size={12} className="text-slate-300 invisible group-hover:visible" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>`;

if (code.includes(badPart)) {
  code = code.replace(badPart, '');
  fs.writeFileSync('views/Distribution.tsx', code, 'utf-8');
  console.log("Fixed Distribution.tsx");
} else {
  console.log("Bad part not found");
}

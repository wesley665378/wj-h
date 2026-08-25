const fs = require('fs');
let code = fs.readFileSync('views/Distribution.tsx', 'utf-8');

// The marker for Column 1 end:
// It looks like this:
//                      </td>
//                      {/* Column 2: 产兑包/收款包 */}

// Or in my broken code:
//                      </td>
//                      {/* Column 2: 产兑包/收款包 */}
// Wait, let's just find the first `{/* Column 2: 产兑包/收款包 */}` and the FIRST `{/* Column 4: 积分额度/当月结余 */}` after it, and REPLACE EVERYTHING in between.

const startMarker = '{/* Column 2: 产兑包/收款包 */}';
const endMarker = '{/* Column 4: 积分额度/当月结余 */}';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const badPart = code.substring(startIndex, endIndex);

  const fixed = `{/* Column 2: 产兑包/收款包 */}
                      <td className="p-0 border border-slate-200">
                        <div className="flex flex-col divide-y divide-slate-200 h-full w-full">
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              已确权：
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-slate-800 whitespace-nowrap">
                              {fmtAmount(data.baseValueConfirmed)}
                            </div>
                          </div>
                          <div className="flex items-stretch flex-1 min-h-[38px]">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              入库：
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-black text-slate-800 whitespace-nowrap">
                              {fmtAmount(data.baseValueApproved)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 3: 总成本对冲 */}
                      <td className="p-0 border border-slate-200">
                        <div className="flex flex-col divide-y divide-slate-200 h-full w-full">
                          <div className="flex items-stretch flex-1 min-h-[38px] group/cost">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              已确权
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-bold text-slate-700 whitespace-nowrap relative group">
                              <span title={\`刚性工资包(\${formatAmount(data.salaryPackage)}) + 浮动成本(\${formatAmount(data.isRevenueExpert ? (data.aCostConfirmed || 0) : (data.bCostConfirmed || 0))})\`}>
                                {maskMoney(data.salaryPackage + (data.isRevenueExpert ? (data.aCostConfirmed || 0) : (data.bCostConfirmed || 0)), fmtAmount)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-stretch flex-1 min-h-[38px] group/cost">
                            <div className="flex items-center justify-center w-[76px] flex-none border-r border-slate-200 bg-slate-50/35 group-hover/tr:bg-slate-50/60 text-[#64748b] text-[11px] font-normal tracking-tight px-2 py-1.5 whitespace-nowrap">
                              入库
                            </div>
                            <div className="flex-1 px-3 py-1.5 flex items-center justify-end font-mono text-[11px] font-bold text-slate-700 whitespace-nowrap relative group">
                              <span title={\`刚性工资包(\${formatAmount(data.salaryPackage)}) + 浮动成本(\${formatAmount(data.isRevenueExpert ? (data.aCostApproved || 0) : (data.bCostApproved || 0))})\`}>
                                {maskMoney(data.salaryPackage + (data.isRevenueExpert ? (data.aCostApproved || 0) : (data.bCostApproved || 0)), fmtAmount)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      `;

  code = code.replace(badPart, fixed);
  
  // Wait, I might have multiple occurrences because of mapping?
  // Let's check how many times Column 2 occurs.
}
fs.writeFileSync('views/Distribution.tsx', code, 'utf-8');

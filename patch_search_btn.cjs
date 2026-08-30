const fs = require('fs');
let code = fs.readFileSync('views/ValueCreation.tsx', 'utf8');

const oldInput = `<input 
                  type="text" 
                  placeholder="搜索编号..." 
                  title="输入矿山编号进行快速搜索"
                  value={miningSearchTerm}
                  onChange={(e) => {
                    const term = e.target.value;
                    setMiningSearchTerm(term);
                    if ((term || '').trim() === '') return;
                    const match = availableResources.find(r => 
                      r.id?.toLowerCase().includes((term || '').toLowerCase())
                    );
                    if (match) {
                      setSelectedMiningId(match.id);
                    }
                  }}
                  className="w-full min-w-48 bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all font-bold text-slate-800 h-10"
                />`;

const newInput = `<div className="flex items-center space-x-2 w-full">
                  <input 
                    type="text" 
                    placeholder="搜索编号..." 
                    title="输入矿山编号进行快速搜索"
                    value={miningSearchTerm}
                    onChange={(e) => setMiningSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const term = miningSearchTerm;
                        if ((term || '').trim() === '') return;
                        const match = availableResources.find(r => 
                          r.id?.toLowerCase().includes((term || '').toLowerCase())
                        );
                        if (match) {
                          setSelectedMiningId(match.id);
                        } else {
                          if (window.toast) window.toast.error('未找到对应矿山编号');
                        }
                      }
                    }}
                    className="flex-1 w-full min-w-[120px] bg-white border border-[#b8d0f7] rounded-[4px] px-3 py-2 text-[13px] outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/10 transition-all font-bold text-slate-800 h-10"
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      const term = miningSearchTerm;
                      if ((term || '').trim() === '') return;
                      const match = availableResources.find(r => 
                        r.id?.toLowerCase().includes((term || '').toLowerCase())
                      );
                      if (match) {
                        setSelectedMiningId(match.id);
                      } else {
                        if (window.toast) window.toast.error('未找到对应矿山编号');
                      }
                    }}
                    className="h-10 px-3 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-[4px] text-[12px] font-bold transition-colors whitespace-nowrap flex items-center shrink-0"
                  >
                    搜索
                  </button>
                </div>`;

if (code.includes(oldInput)) {
    code = code.replace(oldInput, newInput);
    fs.writeFileSync('views/ValueCreation.tsx', code);
    console.log("Successfully replaced");
} else {
    console.log("oldInput not found, trying regex...");
    const regex = /<input\s+type="text"\s+placeholder="搜索编号\.\.\."[\s\S]*?className="[^"]*w-full min-w-48 bg-white[^"]*"\s*\/>/;
    if (regex.test(code)) {
        code = code.replace(regex, newInput);
        fs.writeFileSync('views/ValueCreation.tsx', code);
        console.log("Successfully replaced via regex");
    } else {
        console.log("Regex not matched either");
    }
}


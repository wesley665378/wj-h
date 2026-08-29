import re

file = 'views/Distribution.tsx'
with open(file, 'r') as f:
    content = f.read()
    
content = re.sub(
    r'<div className="p-20 text-center">\s*<Calculator size=\{48\} className="mx-auto text-slate-200 mb-6" />\s*<p className="text-sm font-black text-slate-900 uppercase mb-2">\s*未发现本月分配数据\s*</p>\s*<p className="text-\[10px\] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">\s*请确认已完成该月份的价值提炼记录审核，或切换其它业务月份。\s*</p>\s*</div>',
    '<div className="px-6 py-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_DEFAULT}</div>',
    content
)

with open(file, 'w') as f:
    f.write(content)

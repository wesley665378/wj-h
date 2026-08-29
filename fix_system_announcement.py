import re
with open('src/components/SystemAnnouncement.tsx', 'r') as f:
    content = f.read()

content = re.sub(
    r'<div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-4">.*?</div>',
    '<div className="px-6 py-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">暂无数据</div>',
    content,
    flags=re.DOTALL
)

with open('src/components/SystemAnnouncement.tsx', 'w') as f:
    f.write(content)

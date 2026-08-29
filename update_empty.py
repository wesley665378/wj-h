import re

files = [
    'views/PersonnelPool.tsx',
    'views/Reservoir.tsx',
    'views/TradingTab.tsx',
    'views/Auditing.tsx',
    'views/InternalTransactions.tsx',
    'views/Evaluation.tsx',
    'views/MyAccount.tsx',
    'views/ResourceManagement.tsx',
    'src/components/MiningResourceQueryView.tsx',
    'src/components/SystemAnnouncement.tsx',
    'src/components/BusinessUnitProfitRankingTable.tsx'
]

table_class = 'px-6 py-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest'
card_class = 'px-6 py-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest'

for file in files:
    with open(file, 'r') as f:
        content = f.read()
        
    has_ui_labels = 'UI_LABELS' in content
    empty_text = "{UI_LABELS.EMPTY_DEFAULT}" if has_ui_labels else "暂无数据"

    # PersonnelPool.tsx
    if file == 'views/PersonnelPool.tsx':
        content = re.sub(
            r'<td colSpan=\{7\} className="py-6 text-slate-400 text-center font-bold">\{UI_LABELS.EMPTY_MEMBERS\}</td>',
            f'<td colSpan={{7}} className="{table_class}">{{UI_LABELS.EMPTY_MEMBERS}}</td>',
            content
        )
        content = re.sub(
            r'<div className="py-12 text-center text-slate-400 font-bold text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">\s*未找到符合条件的成员\s*</div>',
            f'<div className="{card_class}">{{UI_LABELS.EMPTY_DEFAULT}}</div>',
            content
        )
        
    # Reservoir.tsx
    elif file == 'views/Reservoir.tsx':
        content = re.sub(
            r'<td colSpan=\{7\} className="py-16 text-center">\s*<div className="flex flex-col items-center justify-center text-slate-400 space-y-2">\s*<Activity className="w-8 h-8 stroke-1 text-slate-300" />\s*<p className="text-xs font-black uppercase tracking-widest">暂无活跃水库单元</p>\s*</div>\s*</td>',
            f'<td colSpan={{7}} className="{table_class}">{empty_text}</td>',
            content
        )
        
    # TradingTab.tsx
    elif file == 'views/TradingTab.tsx':
        content = re.sub(
            r'<td colSpan=\{5\} className="px-10 py-20 text-center">\s*<div className="flex flex-col items-center justify-center space-y-4">\s*<div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-2xl">✨</div>\s*<p className="text-slate-400 text-xs font-black uppercase tracking-\[0\.2em\]">暂无待处理的流转指令</p>\s*</div>\s*</td>',
            f'<td colSpan={{5}} className="{table_class}">{empty_text}</td>',
            content
        )

    # Auditing.tsx
    elif file == 'views/Auditing.tsx':
        content = re.sub(
            r'<td colSpan=\{activeTab === "consumption" \? 18 : 17\} className="py-20 text-center opacity-20 text-xs font-black uppercase tracking-widest">\s*当前结算周期内无任何\{activeTab === "consumption" \? "消耗确权任务" : "成本审计记录"\}\s*</td>',
            f'<td colSpan={{activeTab === "consumption" ? 18 : 17}} className="{table_class}">{{UI_LABELS.EMPTY_DEFAULT}}</td>',
            content
        )

    # InternalTransactions.tsx
    elif file == 'views/InternalTransactions.tsx':
        content = re.sub(
            r'<td colSpan=\{7\} className="py-20 text-center text-slate-400 font-black uppercase tracking-widest">暂无熔断记录</td>',
            f'<td colSpan={{7}} className="{table_class}">{empty_text}</td>',
            content
        )
        content = re.sub(
            r'<td colSpan=\{5\} className="px-10 py-20 text-center text-slate-400 font-black uppercase tracking-widest">暂无资源交易记录</td>',
            f'<td colSpan={{5}} className="{table_class}">{empty_text}</td>',
            content
        )
        
    # Evaluation.tsx
    elif file == 'views/Evaluation.tsx':
        content = re.sub(
            r'<td colSpan=\{7\} className="py-12 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">\s*没有匹配该查询条件的审计记录\s*</td>',
            f'<td colSpan={{7}} className="{table_class}">{empty_text}</td>',
            content
        )

    # MyAccount.tsx
    elif file == 'views/MyAccount.tsx':
        content = re.sub(
            r'<td colSpan=\{7\} className="text-center py-16 text-slate-400">\s*<p className="text-sm font-bold">暂无流水</p>\s*</td>',
            f'<td colSpan={{7}} className="{table_class}">{empty_text}</td>',
            content
        )

    # ResourceManagement.tsx
    elif file == 'views/ResourceManagement.tsx':
        content = re.sub(
            r'<div className="text-center py-20 text-slate-300 font-black uppercase text-xs tracking-widest">暂无矿山资源</div>',
            f'<div className="{card_class}">{{UI_LABELS.EMPTY_MINING}}</div>',
            content
        )
        
    # MiningResourceQueryView.tsx
    elif file == 'src/components/MiningResourceQueryView.tsx':
        content = re.sub(
            r'<td colSpan=\{10\} className="py-8 text-center text-slate-400 font-medium">\s*\{UI_LABELS.EMPTY_LIST\}\s*</td>',
            f'<td colSpan={{10}} className="{table_class}">{{UI_LABELS.EMPTY_LIST}}</td>',
            content
        )
        content = re.sub(
            r'<td colSpan=\{9\} className="py-8 text-center text-slate-400 font-medium">\s*\{UI_LABELS.EMPTY_LIST\}\s*</td>',
            f'<td colSpan={{9}} className="{table_class}">{{UI_LABELS.EMPTY_LIST}}</td>',
            content
        )
        
    # SystemAnnouncement.tsx
    elif file == 'src/components/SystemAnnouncement.tsx':
        content = re.sub(
            r'<div className="text-center py-20 text-slate-400 font-medium">\s*\{filterMode === \'unread\'\s*\? \'当前没有未读信息\'\s*: filterMode === \'read\'\s*\? \'暂无已读历史记录\'\s*: \'暂无站内信息\'\}\s*</div>',
            f'<div className="{card_class}">{empty_text}</div>',
            content
        )

    # BusinessUnitProfitRankingTable.tsx
    elif file == 'src/components/BusinessUnitProfitRankingTable.tsx':
        content = re.sub(
            r'<td colSpan=\{12\} className="py-12 text-center text-slate-400 font-bold">\s*\{UI_LABELS.EMPTY_DEFAULT\}\s*</td>',
            f'<td colSpan={{12}} className="{table_class}">{{UI_LABELS.EMPTY_DEFAULT}}</td>',
            content
        )

    with open(file, 'w') as f:
        f.write(content)


import re

files_to_fix = [
    'views/TradingTab.tsx',
    'views/Evaluation.tsx',
    'views/MyAccount.tsx',
    'views/Reservoir.tsx',
    'src/components/SystemAnnouncement.tsx'
]

for file in files_to_fix:
    with open(file, 'r') as f:
        content = f.read()

    # check if UI_LABELS is imported
    if 'UI_LABELS' not in content:
        # insert import after last import
        import_stmt = "import { UI_LABELS } from '../src/constants/uiLabels';\n"
        if file.startswith('src/'):
            import_stmt = "import { UI_LABELS } from '../constants/uiLabels';\n"
            
        last_import_idx = content.rfind('import ')
        if last_import_idx != -1:
            end_of_line = content.find('\n', last_import_idx)
            content = content[:end_of_line+1] + import_stmt + content[end_of_line+1:]
        else:
            content = import_stmt + content

    content = content.replace('>暂无数据<', '>{UI_LABELS.EMPTY_DEFAULT}<')
    
    with open(file, 'w') as f:
        f.write(content)

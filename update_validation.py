import re

file_path = 'views/DynamicConsumption.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add validation to handleSubmit
old_validation = r"if \(\(!isD && !selectedMiningId\) \|\| !selectedType \|\| \(!recordedCollectorId && !isB2 && !isD\) \|\| dynamicCost <= 0\) \{"
new_validation = r"""if (selectedType !== RefineType.NonEffectiveHours && !costCategory) {
      showAlert('请选择消耗类别（A/B1/B2/C/D）。');
      return;
    }

    if ((!isD && !selectedMiningId) || !selectedType || (!recordedCollectorId && !isB2 && !isD) || dynamicCost <= 0) {"""

content = re.sub(old_validation, new_validation, content, count=1)

# Modify payload to conditionally omit costCategory
old_payload = r"costCategory: costCategory,"
new_payload = r"costCategory: selectedType === RefineType.NonEffectiveHours ? undefined : costCategory,"

content = re.sub(old_payload, new_payload, content, count=1)

with open(file_path, 'w') as f:
    f.write(content)


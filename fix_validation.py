import re

file_path = 'views/DynamicConsumption.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the first replacement
content = content.replace("costCategory: selectedType === RefineType.NonEffectiveHours ? undefined : costCategory,", "costCategory: costCategory,")

# Now apply it to the actual field
target_str = r"""          type: selectedType as RefineType,
          costCategory: costCategory,"""

new_str = r"""          type: selectedType as RefineType,
          costCategory: selectedType === RefineType.NonEffectiveHours ? undefined : costCategory,"""

content = content.replace(target_str, new_str)

with open(file_path, 'w') as f:
    f.write(content)


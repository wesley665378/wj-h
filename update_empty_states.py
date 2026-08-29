import os
import re

UI_LABELS_DEFAULT = "UI_LABELS.EMPTY_DEFAULT"

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find table empty states
    # This might look like: <td colSpan={X} className="...">...</td>
    # or <div className="...">暂无...</div>
    # Let's just do it manually for accuracy or use regex for the specific lines.
    pass

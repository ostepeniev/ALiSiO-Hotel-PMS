import os
import re

brain_dir = r'C:\Users\stepe\.gemini\antigravity\brain'
pattern = re.compile(r'[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}', re.IGNORECASE)

for root, dirs, files in os.walk(brain_dir):
    for file in files:
        if file == 'overview.txt':
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    matches = pattern.findall(content)
                    if matches:
                        print(f"Found in {path}:")
                        for m in matches:
                            print(f"  - {m}")
            except Exception as e:
                pass

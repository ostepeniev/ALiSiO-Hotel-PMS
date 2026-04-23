import os
import re

brain_dir = r'C:\Users\stepe\.gemini\antigravity\brain'
# Looking for 16-character strings that aren't common words
pattern = re.compile(r'\b[a-z]{16}\b', re.IGNORECASE)

for root, dirs, files in os.walk(brain_dir):
    for file in files:
        if file == 'overview.txt':
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    matches = pattern.findall(content)
                    if matches:
                        # Filter out common false positives if any
                        for m in matches:
                            if m.lower() not in ['organizationid', 'classification', 'identifications', 'authentication']:
                                print(f"Found {m} in {path}")
            except Exception as e:
                pass

import re
with open('/root/projects/alisio-bot/src/bot/config.py', 'r') as f:
    content = f.read()

# Add extra='ignore' to model_config
old = """    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )"""

new = """    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra='ignore',
    )"""

content = content.replace(old, new)

with open('/root/projects/alisio-bot/src/bot/config.py', 'w') as f:
    f.write(content)

print('Added extra=ignore to config.py')

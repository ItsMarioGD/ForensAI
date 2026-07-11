import re
with open(r'C:\Users\explo\Downloads\forensia\frontend\app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove single-line comments
content = re.sub(r'//.*', '', content)
# Remove multi-line comments
content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
# Remove template literals
content = re.sub(r'`[^`]*`', '', content)
# Remove single-quoted strings
content = re.sub(r"'[^']*'", '', content)
# Remove double-quoted strings
content = re.sub(r'"[^"]*"', '', content)
# Remove regex literals (simplified)
content = re.sub(r'/[^/]*/[gimsuy]*', '', content)

opens = content.count('{')
closes = content.count('}')
print(f'Clean braces: {opens} open, {closes} close, diff={opens-closes}')

# Now check parens too
opens_p = content.count('(')
closes_p = content.count(')')
print(f'Clean parens: {opens_p} open, {closes_p} close, diff={opens_p-closes_p}')

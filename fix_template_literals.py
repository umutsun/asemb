import os
import re

# Dashboard directory
dashboard_dir = r"C:\xampp\htdocs\alice-semantic-bridge\frontend\src\app\dashboard"

# Pattern to find incorrect template literals
pattern = r"'(http://localhost:3001[^']*\$\{[^}]*\}[^']*)'"

def fix_template_literals(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace single quotes with backticks for template literals and update port
    def replacer(match):
        url = match.group(1)
        # Update port from 3001 to 3003
        url = url.replace('http://localhost:3001', 'http://localhost:3003')
        return f"`{url}`"
    
    new_content = re.sub(pattern, replacer, content)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Fixed: {filepath}")

# Walk through all TSX files in dashboard
for root, dirs, files in os.walk(dashboard_dir):
    for file in files:
        if file.endswith('.tsx'):
            filepath = os.path.join(root, file)
            fix_template_literals(filepath)

print("Done!")
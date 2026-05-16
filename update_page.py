
import sys

path = r'c:\Users\Pryclova\.gemini\antigravity\scratch\katalog-opatreni-app\src\app\page.tsx'

with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = 0
for i, line in enumerate(lines):
    if skip > 0:
        skip -= 1
        continue
    
    # Check for the student count input div to insert after it
    if 'value={studentCount}' in line and i + 5 < len(lines) and '/>' in lines[i+3] and '</div>' in lines[i+4]:
        new_lines.append(line)
        new_lines.append(lines[i+1])
        new_lines.append(lines[i+2])
        new_lines.append(lines[i+3])
        new_lines.append(lines[i+4])
        
        # Insert the new field
        new_lines.append('\n')
        new_lines.append('                  <div className="space-y-2">\n')
        new_lines.append('                    <label className="text-sm font-black text-brand-navy/60 uppercase ml-2">Účel práce s katalogem</label>\n')
        new_lines.append('                    <select \n')
        new_lines.append('                      value={purpose}\n')
        new_lines.append('                      onChange={(e) => setPurpose(e.target.value)}\n')
        new_lines.append('                      className="w-full px-6 py-4 rounded-2xl border-4 border-brand-surface/50 focus:border-brand-yellow focus:ring-8 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-bold appearance-none bg-white"\n')
        new_lines.append('                    >\n')
        new_lines.append('                      <option value="">Vyberte účel...</option>\n')
        new_lines.append('                      <option value="Pro potřeby školy">Pro potřeby školy</option>\n')
        new_lines.append('                      <option value="Test pro AFREŠ">Test pro AFREŠ</option>\n')
        new_lines.append('                    </select>\n')
        new_lines.append('                  </div>\n')
        
        skip = 4
        continue
    
    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Successfully updated page.tsx")

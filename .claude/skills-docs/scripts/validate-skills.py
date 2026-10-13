#!/usr/bin/env python3
from pathlib import Path
import re, sys

root = Path(__file__).resolve().parents[1]
skills_root = root / '.claude' / 'skills'
errors=[]; warnings=[]
expected = {'production-orchestrator','product-discovery','business-analysis','ui-ux-design','frontend-engineering','backend-engineering','system-architecture','testing-engineering','devops-engineering','security-engineering','research-and-evidence'}
actual={p.name for p in skills_root.iterdir() if p.is_dir() and (p/'SKILL.md').exists()}
for p in sorted(skills_root.iterdir()):
    if not p.is_dir(): continue
    f=p/'SKILL.md'
    if not f.exists(): errors.append(f'{p}: missing SKILL.md'); continue
    text=f.read_text(encoding='utf-8')
    if not text.startswith('---\n'): errors.append(f'{f}: missing frontmatter')
    else:
        fm=text.split('---\n',2)[1] if text.count('---\n')>=2 else ''
        if not re.search(r'^name:\s*[^\n]+$',fm,re.M): errors.append(f'{f}: missing name')
        if not re.search(r'^description:\s*',fm,re.M): errors.append(f'{f}: missing description')
        m=re.search(r'^name:\s*([^\n]+)$',fm,re.M)
        if m and m.group(1).strip()!=p.name: errors.append(f'{f}: directory/name mismatch')
    if len(text.splitlines()) > 260: warnings.append(f'{f}: >260 lines; consider progressive disclosure')
    if '/teachscript' in text.lower() or 'teachscript' in text.lower(): errors.append(f'{f}: project-specific TeachScript reference')
    if re.search(r'next\.js|tailwind|prisma|zustand|ecs|eks|aws', text, re.I):
        warnings.append(f'{f}: contains technology names; confirm they are framed as examples/evidence, not requirements')
    if re.search(r'100\s*%\s*coverage', text, re.I): errors.append(f'{f}: absolute coverage rule detected')
registry=(root/'references/source-registry.md').read_text(encoding='utf-8')
for p in skills_root.glob('*/SKILL.md'):
    text=p.read_text(encoding='utf-8')
    ids=re.findall(r'Source IDs used for this skill: ([^\.]+)\.', text)
    if not ids: errors.append(f'{p}: missing explicit source IDs')
skill_names = actual
for a in (root/'.claude/agents').glob('*.md'):
    t=a.read_text(encoding='utf-8')
    if not t.startswith('---\n'): errors.append(f'{a}: missing frontmatter')
    if re.search(r'^skills:\s*$', t, re.M):
        for ref in re.findall(r'^  - (.+)$', t, re.M):
            if ref.strip() not in skill_names: errors.append(f'{a}: unknown preloaded skill {ref.strip()}')
    mtools = re.search(r'^tools:\s*(.+)$', t, re.M)
    if mtools and any(x.strip() in {'Bash','Write','Edit'} for x in mtools.group(1).split(',')):
        warnings.append(f'{a}: reviewer has write/command-capable tools; confirm this is intentional')
if actual != expected: errors.append(f'skill set mismatch: expected {sorted(expected)}, found {sorted(actual)}')
print(f'Skills: {len(actual)}')
print(f'Agents: {len(list((root/".claude/agents").glob("*.md")))}')
for w in warnings: print('WARNING:',w)
for e in errors: print('ERROR:',e)
if errors: sys.exit(1)
print('VALIDATION PASSED')

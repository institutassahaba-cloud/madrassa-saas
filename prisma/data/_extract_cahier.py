#!/usr/bin/env python3
"""Parse un cahier de cours prof (markdown caché) → JSON sessions/cours par élève.
Usage: python3 _extract_cahier.py <cache_prof.txt> <profCode> <output.json>"""
import json, re, sys

CACHE, PROFCODE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

def cells_of(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]

def presence(v):
    v = (v or "").strip().lower()
    if v.startswith("prés") or v.startswith("pres"): return "PRESENT"
    if v.startswith("abs"): return "ABSENT"
    return "PENDING"

def parse_date(raw):
    raw = (raw or "").strip()
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", raw)
    if m:
        d,mo,y = int(m.group(1)),int(m.group(2)),int(m.group(3))
        if y<100: y+=2000
        if 1<=mo<=12 and 1<=d<=31: return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.match(r"(\d{1,2})/(\d{1,2})$", raw)  # jj/mm sans année
    if m:
        d,mo = int(m.group(1)),int(m.group(2))
        if 1<=mo<=12 and 1<=d<=31: return f"2026-{mo:02d}-{d:02d}"
    return None

content = json.load(open(CACHE))["fileContent"]
lines = content.splitlines()

students = {}   # ELid -> {name, sessions:{num:{lessons:{}}}}
cur_el = None
cur_session = None
date_idx = pres_idx = content_idx = None

for line in lines:
    if not line.startswith("|"): continue
    # Entête d'un onglet élève
    if "Partie professeur/Cours" in line and "ID élève" in line:
        cells = cells_of(line)
        m = re.search(r"ID élève\s*:\s*(EL\d+)", line)
        cur_el = m.group(1) if m else None
        nm = re.search(r"professeur/(?:Élève\s*\d+&#10;)?(.+?)(?:&#10;)?\s*\(ID élève", line)
        name = nm.group(1).strip() if nm else ""
        # indices
        date_idx = next((i for i,c in enumerate(cells) if "Dates" in c), 1)
        content_idx = next((i for i,c in enumerate(cells) if "Contenu" in c), 3)
        pres_idx = date_idx + 1
        cur_session = None
        if cur_el and cur_el not in students:
            students[cur_el] = {"name": name, "sessions": {}}
        continue
    if cur_el is None: continue
    cells = cells_of(line)
    c0 = cells[0] if cells else ""
    ms = re.match(r"SESSION\s*0*(\d+)", c0, re.I)
    if ms:
        cur_session = int(ms.group(1))
        students[cur_el]["sessions"].setdefault(cur_session, {"lessons": {}})
        continue
    mc = re.match(r"Cours\s*0*(\d+)", c0, re.I)
    if mc and cur_session is not None:
        lnum = int(mc.group(1))
        date = parse_date(cells[date_idx]) if len(cells)>date_idx else None
        pres = presence(cells[pres_idx]) if len(cells)>pres_idx else "PENDING"
        cont = cells[content_idx] if len(cells)>content_idx else ""
        students[cur_el]["sessions"][cur_session]["lessons"][lnum] = {
            "date": date, "status": pres, "content": cont or None,
        }

# Mise en forme
out = {"profCode": PROFCODE, "students": {}}
for el, data in students.items():
    sessions = []
    for snum in sorted(data["sessions"]):
        lessons = [{"number": ln, **data["sessions"][snum]["lessons"][ln]}
                   for ln in sorted(data["sessions"][snum]["lessons"])]
        if lessons:
            sessions.append({"number": snum, "lessons": lessons})
    if sessions:
        out["students"][el] = {"name": data["name"], "sessions": sessions}

json.dump(out, open(OUT,"w"), ensure_ascii=False, indent=2)
nl = sum(len(s["lessons"]) for st in out["students"].values() for s in st["sessions"])
ns = sum(len(st["sessions"]) for st in out["students"].values())
print(f"Élèves: {len(out['students'])} | Sessions: {ns} | Cours: {nl}")
# Échantillon
for el in list(out["students"])[:1]:
    st = out["students"][el]
    print(f"  {el} {st['name']}: {len(st['sessions'])} sessions, ex session {st['sessions'][0]['number']} -> {len(st['sessions'][0]['lessons'])} cours")
    print("   1er cours:", st["sessions"][0]["lessons"][0])

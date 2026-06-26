#!/usr/bin/env python3
"""Parse un cahier prof directement depuis un .xlsx (chemin) → cahier-PRxxx.json.
Identique à _extract_cahier_xlsx.py mais lit le fichier .xlsx directement
(au lieu d'un JSON base64 du connecteur Drive).
Usage: python3 _extract_cahier_path.py <fichier.xlsx> <profCode> <out.json>"""
import json, re, sys, unicodedata, datetime
import openpyxl

SRC, PROFCODE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
wb = openpyxl.load_workbook(SRC, data_only=True, read_only=True)

def norm(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii","ignore").decode().lower().strip()

SKIP_TABS = {"sommaire","contact","tableau de bord","emploi du temps","edt","dt",""}

def presence(v):
    v = norm(v)
    if v.startswith("pres"): return "PRESENT"
    if v.startswith("abs"): return "ABSENT"
    return "PENDING"

def parse_date(v):
    if isinstance(v,(datetime.datetime,datetime.date)): return v.strftime("%Y-%m-%d")
    raw = str(v or "").strip()
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", raw)
    if m:
        d,mo,y=int(m.group(1)),int(m.group(2)),int(m.group(3))
        if y<100: y+=2000
        if 1<=mo<=12 and 1<=d<=31: return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.match(r"(\d{1,2})/(\d{1,2})$", raw)
    if m:
        d,mo=int(m.group(1)),int(m.group(2))
        if 1<=mo<=12 and 1<=d<=31: return f"2026-{mo:02d}-{d:02d}"
    return None

out = {"profCode": PROFCODE, "enrollments": []}

for ws in wb.worksheets:
    if "⚫" in ws.title: break
    if norm(ws.title) in SKIP_TABS: continue

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 4: continue

    header_idx = None
    for i in range(min(6, len(rows))):
        joined = norm(" ".join(str(c) for c in rows[i] if c is not None))
        if "dates" in joined and "id eleve" in joined:
            header_idx = i; break
    if header_idx is None: continue
    header = rows[header_idx]

    date_idx = next((j for j,c in enumerate(header) if c and "dates" in norm(c)), 1)
    content_idx = next((j for j,c in enumerate(header) if c and "contenu" in norm(c)), None)
    matiere_idx = next((j for j,c in enumerate(header) if c and "matiere" in norm(c)), None)
    students_cols = []
    for j,c in enumerate(header):
        if not c: continue
        m = re.search(r"id eleve\s*:?\s*(el\d+)", norm(c))
        if m and (content_idx is None or j < content_idx):
            students_cols.append((j, m.group(1).upper()))
    if not students_cols: continue

    sessions_by_el = {el: {} for _,el in students_cols}
    subject_raw = None
    cur = None
    for r in range(header_idx+1, len(rows)):
        row = rows[r]
        if matiere_idx is not None and subject_raw is None and len(row) > matiere_idx and row[matiere_idx]:
            subject_raw = str(row[matiere_idx]).strip()
        a = norm(row[0]) if row and len(row)>0 and row[0] is not None else ""
        mc = re.match(r"cours\s*0*(\d+)", a)
        if mc:
            # Ligne de cours (colonne A). On lit dates/présence/contenu par index d'en-tête.
            if cur is not None:
                lnum = int(mc.group(1))
                date = parse_date(row[date_idx]) if len(row)>date_idx else None
                content = (str(row[content_idx]).strip() if content_idx is not None and len(row)>content_idx and row[content_idx] else None)
                for col, el in students_cols:
                    pres = presence(row[col]) if len(row)>col else "PENDING"
                    sessions_by_el[el].setdefault(cur, {})[lnum] = {"date": date, "status": pres, "content": content}
            continue
        # Sinon : cherche un marqueur "Session NN". Selon le format il est en colonne A
        # (nouveaux tableaux depuis avril) ou en colonne B/E (anciens tableaux).
        for cell in row[:6]:
            if cell is None: continue
            ms = re.match(r"session\s*0*(\d+)\s*$", norm(cell))
            if ms: cur = int(ms.group(1)); break

    # 1 enrollment par (onglet, élève) avec la matière de l'onglet
    for _, el in students_cols:
        sess = sessions_by_el[el]
        arr = []
        for snum in sorted(sess):
            lessons = [{"number": ln, **sess[snum][ln]} for ln in sorted(sess[snum])]
            if lessons: arr.append({"number": snum, "lessons": lessons})
        if arr:
            out["enrollments"].append({"el": el, "subject": subject_raw, "tab": ws.title, "sessions": arr})

json.dump(out, open(OUT,"w"), ensure_ascii=False, indent=2)
nl = sum(len(s["lessons"]) for e in out["enrollments"] for s in e["sessions"])
ns = sum(len(e["sessions"]) for e in out["enrollments"])
print(f"{PROFCODE}: enrollments {len(out['enrollments'])} | sessions {ns} | cours {nl}")

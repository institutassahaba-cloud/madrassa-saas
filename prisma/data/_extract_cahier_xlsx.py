#!/usr/bin/env python3
"""Parse un cahier prof (.xlsx, tous onglets) → cahier-PRxxx.json.
Usage: python3 _extract_cahier_xlsx.py <download_json.txt> <profCode> <out.json>"""
import json, re, sys, base64, io, unicodedata, datetime
import openpyxl

SRC, PROFCODE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
raw = json.load(open(SRC))["content"]
wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(raw)), data_only=True, read_only=True)

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

out = {"profCode": PROFCODE, "students": {}}

for ws in wb.worksheets:
    if "⚫" in ws.title: break  # ⚫️ séparateur : on s'arrête (élèves actifs avant)
    if norm(ws.title) in SKIP_TABS: continue

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 4: continue

    # Trouver la ligne d'en-tête (contient "Dates" + "ID élève")
    header_idx = None
    for i in range(min(6, len(rows))):
        joined = norm(" ".join(str(c) for c in rows[i] if c is not None))
        if "dates" in joined and "id eleve" in joined:
            header_idx = i; break
    if header_idx is None: continue
    header = rows[header_idx]

    date_idx = next((j for j,c in enumerate(header) if c and "dates" in norm(c)), 1)
    content_idx = next((j for j,c in enumerate(header) if c and "contenu" in norm(c)), None)
    # Colonnes élèves (partie professeur uniquement : avant "contenu")
    students_cols = []
    for j,c in enumerate(header):
        if not c: continue
        m = re.search(r"id eleve\s*:?\s*(el\d+)", norm(c))
        if m and (content_idx is None or j < content_idx):
            students_cols.append((j, m.group(1).upper()))
    if not students_cols: continue

    # Parcours des lignes de données
    sessions_by_el = {el: {} for _,el in students_cols}
    cur = None
    for r in range(header_idx+1, len(rows)):
        a = norm(rows[r][0]) if rows[r] and rows[r][0] is not None else ""
        ms = re.match(r"session\s*0*(\d+)", a)
        if ms: cur = int(ms.group(1)); continue
        mc = re.match(r"cours\s*0*(\d+)", a)
        if mc and cur is not None:
            lnum = int(mc.group(1))
            row = rows[r]
            date = parse_date(row[date_idx]) if len(row)>date_idx else None
            content = (str(row[content_idx]).strip() if content_idx is not None and len(row)>content_idx and row[content_idx] else None)
            for col, el in students_cols:
                pres = presence(row[col]) if len(row)>col else "PENDING"
                sessions_by_el[el].setdefault(cur, {})[lnum] = {"date": date, "status": pres, "content": content}

    for _, el in students_cols:
        sess = sessions_by_el[el]
        arr = []
        for snum in sorted(sess):
            lessons = [{"number": ln, **sess[snum][ln]} for ln in sorted(sess[snum])]
            if lessons: arr.append({"number": snum, "lessons": lessons})
        if arr:
            # fusionne si l'élève apparaît dans plusieurs onglets
            if el in out["students"]:
                out["students"][el]["sessions"].extend(arr)
            else:
                out["students"][el] = {"name": "", "sessions": arr}

json.dump(out, open(OUT,"w"), ensure_ascii=False, indent=2)
nl = sum(len(s["lessons"]) for st in out["students"].values() for s in st["sessions"])
ns = sum(len(st["sessions"]) for st in out["students"].values())
print(f"{PROFCODE}: élèves {len(out['students'])} | sessions {ns} | cours {nl}")

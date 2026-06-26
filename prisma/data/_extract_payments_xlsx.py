#!/usr/bin/env python3
"""Parse le RECAP complet (.xlsx, tous onglets) → recap-payments.json.
Usage: python3 _extract_payments_xlsx.py <download_json.txt>"""
import json, re, sys, base64, io, unicodedata
import openpyxl

SRC = sys.argv[1]
raw = json.load(open(SRC))["content"]
wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(raw)), data_only=True, read_only=True)

def norm(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii","ignore").decode().lower().strip()

PROF_NAMES = [
    ("samia umm abderrahmen","PR001"),("samia umm haroun","PR002"),
    ("asmaa","PR003"),("asma","PR003"),("fatima oum abdirrahmane","PR004"),
    ("lilia","PR005"),("maria","PR006"),("sarah lamari","PR007"),
    ("sirine","PR008"),("rahma housni","PR009"),("djouher","PR010"),
]
def find_prof_name(cells):
    n = norm(" ".join(str(c) for c in cells if c is not None))
    for name,code in PROF_NAMES:
        if name in n: return code
    return None

def detect_prof(cells):
    # En-tête prof = nom de prof présent ET pas de montant en colonne C (lien facultatif)
    code = find_prof_name(cells)
    if not code: return None
    amount_cell = cells[2] if len(cells) > 2 else None
    has_amount = isinstance(amount_cell,(int,float)) or (amount_cell and re.search(r"\d", str(amount_cell)))
    if has_amount: return None  # c'est une ligne de paiement, pas un en-tête
    return code

def parse_amount(raw):
    if isinstance(raw,(int,float)): return float(raw)
    s = re.sub(r"[^\d.]","", str(raw or "").replace("\xa0","").replace(",", "."))
    try: return float(s) if s else None
    except: return None

def parse_payer(raw):
    raw = re.sub(r"\s+"," ", str(raw or "")).strip()
    if not raw: return (None,None)
    low = norm(raw)
    if re.match(r"^p\s*[:.=]", low) or low.startswith(("paypal","payp","payr","payal")) or raw.startswith("P "):
        return ("PAYPAL", re.sub(r"^(p\s*[:.=]?\s*|pay\w*\s*[:.=]?\s*)","",raw,flags=re.I).strip() or None)
    if re.match(r"^v\s*[:.=]", low) or low.startswith(("vir","virement")) or raw.startswith("V "):
        return ("WISE", re.sub(r"^(virement\s*[:.=]?\s*|vir\s*[:.=]?\s*|v\s*[:.=]\s*)","",raw,flags=re.I).strip() or None)
    return (None, raw)

def parse_eleve_session(raw):
    raw = re.sub(r"\s+"," ", str(raw or "")).strip()
    m = re.search(r"session", raw, re.I)
    if m:
        student = raw[:m.start()].rstrip(" -/").strip()
        snum = re.search(r"\d+", raw[m.end():])
        return (student, int(snum.group()) if snum else None)
    return (raw, None)

def parse_date(v):
    import datetime
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    raw = re.sub(r"^(fait le|fait)\s*","",str(v or "").strip(),flags=re.I).strip()
    m = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})", raw)
    if m:
        y,mo,d=int(m.group(1)),int(m.group(2)),int(m.group(3))
        if 1<=mo<=12 and 1<=d<=31: return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", raw)
    if m:
        d,mo,y=int(m.group(1)),int(m.group(2)),int(m.group(3))
        if y<100: y+=2000
        if 1<=mo<=12 and 1<=d<=31: return f"{y:04d}-{mo:02d}-{d:02d}"
    return None

payments=[]; current=None; skipped=0; seen=set()
for ws in wb.worksheets:
    if norm(ws.title) in ("modele","modèle","template"): continue
    current=None
    for row in ws.iter_rows(values_only=True):
        cells=list(row)
        p=detect_prof(cells)
        if p: current=p; continue
        if not cells or cells[0] is None: continue
        c0=cells[0]; nc0=norm(c0)
        if nc0 in ("date","total","part","") or nc0.startswith("total"): continue
        date=parse_date(c0)
        if not date: continue
        eleve=cells[1] if len(cells)>1 else ""
        if not eleve or norm(eleve).startswith("eleve"): continue
        student,snum=parse_eleve_session(eleve)
        if "nouvel eleve" in norm(student):
            student=re.sub(r".*nouvel\s+eleve\s*:?\s*","",student,flags=re.I).strip()
        amount=parse_amount(cells[2]) if len(cells)>2 else None
        ptype,payer=parse_payer(cells[3]) if len(cells)>3 else (None,None)
        note=cells[4] if len(cells)>4 and cells[4] else None
        if not student or amount is None: skipped+=1; continue
        key=(date,norm(student),snum,amount,current)
        if key in seen: continue  # dédoublonnage inter-onglets
        seen.add(key)
        payments.append({"date":date,"profCode":current,"studentRaw":student,
            "sessionNumber":snum,"amount":amount,"paymentType":ptype,
            "payerName":payer,"note":str(note) if note else None})

json.dump(payments, open("/Users/idriss/Desktop/madrassa-saas/prisma/data/recap-payments.json","w"), ensure_ascii=False, indent=2)
from collections import Counter
print(f"Onglets: {len(wb.worksheets)} | Paiements: {len(payments)} (ignorés {skipped})")
print("Par prof:", dict(sorted(Counter(x['profCode'] for x in payments).items(), key=lambda kv:str(kv[0]))))
print("Sans prof:", sum(1 for x in payments if not x['profCode']))
print("Total:", round(sum(x['amount'] for x in payments),2),"€")
print("Période:", min(x['date'] for x in payments), "→", max(x['date'] for x in payments))

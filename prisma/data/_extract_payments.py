#!/usr/bin/env python3
"""Extrait l'historique des paiements du RECAP (CSV décodé) vers JSON.
Usage: python3 _extract_payments.py recap.csv"""
import json, re, sys, csv, unicodedata

CSV_PATH = sys.argv[1]

def norm(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii","ignore").decode().lower().strip()

PROF_NAMES = [
    ("samia umm abderrahmen", "PR001"),
    ("samia umm haroun",      "PR002"),
    ("asmaa",                 "PR003"),
    ("asma",                  "PR003"),
    ("fatima oum abdirrahmane","PR004"),
    ("lilia",                 "PR005"),
    ("maria",                 "PR006"),
    ("sarah lamari",          "PR007"),
    ("sirine",                "PR008"),
    ("rahma housni",          "PR009"),
    ("djouher",               "PR010"),
]

def detect_prof(row):
    joined = " ".join(row)
    if "docs.google.com/spreadsheets" not in joined: return None
    n = norm(joined)
    for name, code in PROF_NAMES:
        if name in n: return code
    return None

def parse_amount(raw):
    s = str(raw or "").replace(" ","").replace("\xa0","").replace(" ","").replace(",", ".")
    s = re.sub(r"[^\d.]", "", s)
    try: return float(s) if s else None
    except: return None

def parse_payer(raw):
    raw = re.sub(r"\s+"," ", str(raw or "")).strip()
    if not raw: return (None, None)
    low = norm(raw)
    if re.match(r"^p\s*[:.=]", low) or low.startswith("paypal") or low.startswith("payp") or low.startswith("payr") or low.startswith("payal") or raw.startswith("P "):
        name = re.sub(r"^(p\s*[:.=]?\s*|paypal\s*[:.=]?\s*|payp\w*\s*[:.=]?\s*|payr\w*\s*[:.=]?\s*|payal\s*[:.=]?\s*)", "", raw, flags=re.I).strip()
        return ("PAYPAL", name or None)
    if re.match(r"^v\s*[:.=]", low) or low.startswith("vir") or low.startswith("virement") or raw.startswith("V "):
        name = re.sub(r"^(virement\s*[:.=]?\s*|vir\s*[:.=]?\s*|v\s*[:.=]\s*)", "", raw, flags=re.I).strip()
        return ("WISE", name or None)
    return (None, raw)

def parse_eleve_session(raw):
    raw = re.sub(r"\s+"," ", str(raw or "")).strip()
    m = re.search(r"session", raw, re.I)
    if m:
        student = raw[:m.start()].rstrip(" -/").strip()
        snum = re.search(r"\d+", raw[m.end():])
        return (student, int(snum.group()) if snum else None)
    return (raw, None)

def parse_date(raw):
    raw = re.sub(r"^(fait le|fait)\s*", "", str(raw or "").strip(), flags=re.I).strip()
    m = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})", raw)
    if m:
        y,mo,d = int(m.group(1)),int(m.group(2)),int(m.group(3))
        if 1<=mo<=12 and 1<=d<=31: return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", raw)
    if m:
        d,mo,y = int(m.group(1)),int(m.group(2)),int(m.group(3))
        if y < 100: y += 2000
        if 1<=mo<=12 and 1<=d<=31: return f"{y:04d}-{mo:02d}-{d:02d}"
    return None

payments = []
current = None
skipped = 0
with open(CSV_PATH, newline="", encoding="utf-8") as f:
    for row in csv.reader(f):
        if not row: continue
        p = detect_prof(row)
        if p: current = p; continue
        c0 = row[0] if len(row)>0 else ""
        nc0 = norm(c0)
        if nc0 in ("date","total","part","") or nc0.startswith("total"): continue
        date = parse_date(c0)
        if not date: continue
        eleve_raw = row[1] if len(row)>1 else ""
        if not eleve_raw or norm(eleve_raw).startswith("eleve"): continue
        student, snum = parse_eleve_session(eleve_raw)
        if norm(student).startswith("nouvel eleve") or "nouvel eleve" in norm(student):
            student = re.sub(r".*nouvel\s+eleve\s*:?\s*", "", student, flags=re.I).strip()
        amount = parse_amount(row[2]) if len(row)>2 else None
        ptype, payer = parse_payer(row[3]) if len(row)>3 else (None,None)
        note = row[4] if len(row)>4 else ""
        if not student or amount is None: skipped += 1; continue
        payments.append({
            "date": date, "profCode": current, "studentRaw": student,
            "sessionNumber": snum, "amount": amount,
            "paymentType": ptype, "payerName": payer, "note": note or None,
        })

json.dump(payments, open("/Users/idriss/Desktop/madrassa-saas/prisma/data/recap-payments.json","w"), ensure_ascii=False, indent=2)
from collections import Counter
print(f"Paiements: {len(payments)} (ignorés: {skipped})")
print("Par prof:", dict(sorted(Counter(x['profCode'] for x in payments).items())))
print("Sans prof:", sum(1 for x in payments if not x['profCode']))
print("Total €:", round(sum(x['amount'] for x in payments),2))

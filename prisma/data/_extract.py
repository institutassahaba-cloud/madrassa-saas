#!/usr/bin/env python3
"""Extrait les inscriptions du NEW TDB (markdown mis en cache) vers JSON normalisé.
Usage: python3 _extract.py <chemin_cache_tdb.txt>"""
import json, re, sys, unicodedata

CACHE = sys.argv[1] if len(sys.argv) > 1 else None

# Mapping PR -> prof (CONFIG_PAIEMENTS, format PR00x = source de vérité du TDB)
TEACHERS = [
    {"code": "PR001", "name": "Samia Umm Abderrahmen", "emoji": "🍀", "whatsapp": "21621940107",  "tz": "Africa/Tunis"},
    {"code": "PR002", "name": "Samia umm Haroun",       "emoji": "🌷", "whatsapp": "21692360228",  "tz": "Africa/Tunis"},
    {"code": "PR003", "name": "Asma",                   "emoji": "📔", "whatsapp": "21658154714",  "tz": "Africa/Tunis"},
    {"code": "PR004", "name": "Fatima Oum abdirrahmane","emoji": "📒", "whatsapp": "213559934734", "tz": "Africa/Algiers"},
    {"code": "PR005", "name": "Lilia",                  "emoji": "📘", "whatsapp": "21624328540",  "tz": "Africa/Tunis"},
    {"code": "PR006", "name": "Maria",                  "emoji": "🌻", "whatsapp": "213562956931", "tz": "Africa/Algiers"},
    {"code": "PR007", "name": "Sarah Lamari",           "emoji": "🌸", "whatsapp": "21692294624",  "tz": "Africa/Tunis"},
    {"code": "PR008", "name": "Sirine",                 "emoji": "📓", "whatsapp": "213672327152", "tz": "Africa/Algiers"},
    {"code": "PR009", "name": "Rahma Housni",           "emoji": "🥀", "whatsapp": "212610495952", "tz": "Africa/Casablanca"},
    {"code": "PR010", "name": "Djouher",                "emoji": "🪶", "whatsapp": "213775772624", "tz": "Africa/Algiers"},
]
PROF_BY_CODE = {t["code"]: t for t in TEACHERS}

def normalize_subject(raw):
    if not raw: return None
    t = unicodedata.normalize("NFD", str(raw)).encode("ascii","ignore").decode().lower().strip()
    if "coran" in t or "quran" in t: return "Coran"
    if "tajwid" in t or "tajweed" in t: return "Tajwid"
    if "nourani" in t or "nurani" in t: return "Nouraniyah"
    if "moutoun" in t or "matn" in t or "mutun" in t: return "Moutoun"
    if "anglais" in t or "english" in t: return "Anglais"
    if "arabe" in t: return "Arabe"
    return None

def phone_intl(raw):
    if raw is None: return ""
    s = re.sub(r"[^\d+]", "", str(raw).strip())
    s = re.sub(r"(?!^)\+", "", s)
    if not s: return ""
    if s.startswith("00"): s = "+" + s[2:]
    if s.startswith("+"): return "+" + re.sub(r"\D","",s[1:])
    if (s.startswith("06") or s.startswith("07")) and len(s)==10: return "+33"+s[1:]
    if (s.startswith("6") or s.startswith("7")) and len(s)==9: return "+33"+s
    if s.startswith("33"): return "+"+s
    if s.startswith("04") and len(s)==10: return "+32"+s[1:]
    if s.startswith("4") and len(s)==9: return "+32"+s
    if s.startswith("32"): return "+"+s
    for ind in ("253","212","213","216"):
        if s.startswith(ind): return "+"+s
    return s

def to_num(raw):
    if raw is None or raw == "": return None
    s = str(raw).replace(",", ".")
    s = re.sub(r"[^\d.]", "", s)
    try: return float(s) if s else None
    except: return None

def parse_payer(raw):
    raw = (raw or "").strip()
    if not raw: return (None, None)
    if re.match(r"^P\s*[:.]?\s*", raw, re.I):
        return ("PAYPAL", re.sub(r"^P\s*[:.]?\s*", "", raw, flags=re.I).strip())
    if re.match(r"^V\s*[:.]?\s*", raw, re.I):
        return ("WISE", re.sub(r"^V\s*[:.]?\s*", "", raw, flags=re.I).strip())
    return (None, raw)

def split_name(full):
    full = re.sub(r"\s+", " ", (full or "").strip())
    parts = full.split(" ")
    if len(parts) <= 1: return (full, "")
    return (parts[0], " ".join(parts[1:]))

content = json.load(open(CACHE))["fileContent"]
students = []
for line in content.splitlines():
    if not re.match(r"^\| PR\d+ \|", line): continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    # A..M : 0=PR,1=Ggroup,2=onglet,3=EL,4=nom,5=matiere,6=nbcours,7=duree,8=tarif,9=montant,10=tel,11=mail,12=payeur
    if len(cells) < 13: continue
    prof_code = cells[0]
    prof = PROF_BY_CODE.get(prof_code)
    if not prof: continue
    el = cells[3]
    name = cells[4]
    if not name or not el: continue
    ptype, payer = parse_payer(cells[12])
    fn, ln = split_name(name)
    # tél : retirer l'échappement markdown \+ \(
    tel_raw = cells[10].replace("\\", "")
    students.append({
        "legacyId": el,
        "displayName": name,
        "firstName": fn,
        "lastName": ln,
        "profCode": prof_code,
        "groupCode": cells[1],
        "groupName": cells[2],
        "subject": normalize_subject(cells[5]),
        "subjectRaw": cells[5],
        "lessonsPerWeek": int(to_num(cells[6])) if to_num(cells[6]) else None,
        "duration": cells[7],
        "hourlyRate": to_num(cells[8]),
        "monthlyFee": to_num(cells[9]) or 0,
        "phone": phone_intl(tel_raw),
        "email": cells[11].lower() if cells[11] else None,
        "payerName": payer,
        "paymentType": ptype,
    })

json.dump(TEACHERS, open("/Users/idriss/Desktop/madrassa-saas/prisma/data/teachers.json","w"), ensure_ascii=False, indent=2)
json.dump(students, open("/Users/idriss/Desktop/madrassa-saas/prisma/data/tdb-students.json","w"), ensure_ascii=False, indent=2)

# Stats
groups = {}
for s in students: groups[s["groupCode"]] = s["groupName"]
print(f"Élèves (inscriptions): {len(students)}")
print(f"Groupes distincts: {len(groups)}")
print(f"Profs: {len(TEACHERS)}")
nosub = [s for s in students if not s['subject']]
print(f"Matières non reconnues: {len(nosub)} -> {sorted(set(s['subjectRaw'] for s in nosub))[:10]}")
print(f"Sans email: {sum(1 for s in students if not s['email'])}")

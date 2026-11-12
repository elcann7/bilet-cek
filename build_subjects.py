"""Fənləri (sual + etalon cavab) mənbə fayllarından oxuyub subjects.js və api/_data.js-ə çevirir.

İşə sal:  python build_subjects.py
Mənbələr (yollar mühit dəyişənləri ilə dəyişdirilə bilər):
  ADIAK_BASE      ADİAK qovluğu (Kollokvium-Suallari.docx + Kollokvium-Cavablar.md)
  KOLLEKVIUM_DIR  Downloads\\kollekvium (fizika və XDİAK faylları)
Yeni fənn əlavə etmək: aşağıda bir build_xxx() funksiyası yaz, SUBJECTS siyahısına qoş.
Çıxış faylları (subjects.js, api/_data.js, answers/) etalon cavab saxlayır, gitignore-dadır.
"""
import json
import os
import re
import sys
from pathlib import Path

import docx
import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
HOME = Path.home()
ADIAK = Path(os.environ.get("ADIAK_BASE") or HOME / "OneDrive" / "Documents" / "AzTU-1-Semestr" / "05-ADIAK-Azerbaycan-Dili")
KOL = Path(os.environ.get("KOLLEKVIUM_DIR") or HOME / "Downloads" / "kollekvium")
HERE = Path(__file__).parent
ANS = HERE / "answers"
ANS.mkdir(exist_ok=True)


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- ADİAK
def build_adiak():
    official = {}
    for table in docx.Document(ADIAK / "Kollokvium-Suallari.docx").tables:
        for row in table.rows:
            cells = [clean(c.text) for c in row.cells]
            m = re.match(r"^(\d+)\.$", cells[0])
            if m and len(cells) > 1:
                official[int(m.group(1))] = cells[1]
    md = (ADIAK / "Kollokvium-Cavablar.md").read_text(encoding="utf-8")
    parts = re.split(r"^## (\d+)\. (✅|🟡|🔵) (.+)$", md, flags=re.M)
    answers = {}
    for i in range(1, len(parts), 4):
        answers[int(parts[i])] = {
            "src": {"✅": "vesait", "🔵": "kurs"}.get(parts[i + 1], "umumi"),
            "answer": parts[i + 3].split("\n---")[0].strip(),
        }
    assert sorted(official) == list(range(1, 31)) == sorted(answers)
    qs = []
    for n in range(1, 31):
        qs.append({"n": n, "q": official[n], "kind": "theory", "group": "a" if n <= 10 else "b" if n <= 20 else "c", **answers[n]})
    return {
        "id": "adiak",
        "short": "ADİAK",
        "name": "Azərbaycan dilində işgüzar və akademik kommunikasiya",
        "exam": "Kollokvium",
        "lang": "az",
        "answer": "voice",
        "ticket": ["a", "b", "c"],
        "ticketNote": "30 sualdan 3-ü düşür: hər onluqdan bir sual.",
        "questions": qs,
    }


# ---------------------------------------------------------------- Fizika
# Rəsmi sual → etalon fayldakı bölmə nömrələri (fayl 30 bölmədən ibarətdir, nömrələmə fərqlidir)
FIZ_MAP = {1: [1, 2], 2: [], 3: [3], 4: [4], 5: [5], 6: [6, 7], 7: [8], 8: [9], 9: [9], 10: [10],
           11: [11], 12: [12], 13: [13], 14: [14], 15: [14, 15], 16: [16], 17: [17], 18: [18], 19: [18]}

NEWTON = """**Nyuton qanunları.** I qanun (ətalət qanunu): cisimə başqa cisimlər təsir etmirsə və ya təsirlər tarazlaşırsa, cisim sükunətdə qalır və ya düzxətli bərabərsürətli hərəkət edir. II qanun: cismin təcili ona təsir edən nəticəvi qüvvə ilə düz, kütləsi ilə tərs mütənasibdir, a = F/m; ümumi şəkildə F = dp/dt. III qanun: iki cismin bir-birinə təsir qüvvələri qiymətcə bərabər, istiqamətcə əks olur, F12 = −F21, və müxtəlif cisimlərə tətbiq edilir.

**Təbiətdə qüvvələr.** Qravitasiya (ümumdünya cazibə) F = G·m1·m2/r², ağırlıq qüvvəsi F = mg, elastiklik qüvvəsi F = −kx (Huk qanunu), sürtünmə qüvvəsi F = μN, elektrik (Kulon) və maqnit qüvvələri.

**İmpuls.** p = m·v vektorial kəmiyyətdir. Nyutonun II qanunu impulsla belə yazılır: F = dp/dt. **İmpulsun saxlanma qanunu:** qapalı sistemdə (xarici qüvvələr yoxdur və ya tarazlaşıb) cisimlərin impulslarının vektorial cəmi sabit qalır: Σ m_i·v_i = const."""


def build_fizika():
    d = docx.Document(KOL / "fizika kollek resmi.docx")
    ps = [clean(p.text) for p in d.paragraphs if clean(p.text)]
    start = next(i for i, t in enumerate(ps) if t.startswith("İrəliləmə"))
    items = ps[start:]
    theory, problems = items[:19], items[19:]
    assert len(theory) == 19 and len(problems) == 11, (len(theory), len(problems))

    # etalon PDF: 30 bölmə, səhifələr şəkil kimi də saxlanır (düsturlar mətndə pozulur)
    pdf = pymupdf.open(KOL / "Fizika Kollekvium 27noyabr tam pdf.pdf")
    pages = [pdf[i].get_text() for i in range(pdf.page_count)]
    full, offs = "", []
    for t in pages:
        offs.append(len(full)); full += t + "\n"
    pos, heads, expect = [], {}, 1
    for m in re.finditer(r"(?m)^\s*(\d{1,2})\)", full):
        if int(m.group(1)) == expect and expect <= 18:
            heads[expect] = m.start(); expect += 1
    assert len(heads) == 18, heads
    order = sorted(heads)
    sect, span = {}, {}
    page_of = lambda off: max(i for i, o in enumerate(offs) if o <= off) + 1
    for k, n in enumerate(order):
        a = heads[n]
        b = heads[order[k + 1]] if k + 1 < len(order) else len(full)
        if n == 18:  # 18-ci bölmə (dielektriklər) 19-a qədər davam edir
            m19 = re.search(r"(?m)^\s*19\)", full)
            b = m19.start() if m19 else b
        txt = full[a:b]
        txt = re.sub(r"[⃐-⃿]", "", txt)           # vektor oxları
        txt = re.sub(r"(?<=\w) (?=ə)", "", txt)               # "qüvv ə" → "qüvvə"
        sect[n] = clean(txt)
        span[n] = list(range(page_of(a), page_of(b - 1) + 1))

    for p in set(sum(span.values(), [])):
        pdf[p - 1].get_pixmap(dpi=105).pil_save(ANS / f"fizika-p{p:02d}.webp", quality=72)

    qs = []
    for i, t in enumerate(theory, 1):
        secs = FIZ_MAP[i]
        if secs:
            body = "\n\n".join(sect[s] for s in secs)
            imgs = sorted({p for s in secs for p in span[s]})
            q = {"src": "kurs", "answer": body, "images": [f"answers/fizika-p{p:02d}.webp" for p in imgs]}
        else:
            q = {"src": "umumi", "answer": NEWTON}
        qs.append({"n": i, "q": t, "kind": "theory", "group": "a" if i <= 10 else "b", **q})

    sol = json.loads((HERE / "content" / "fizika-meseleler.json").read_text(encoding="utf-8"))
    uniq = [p for k, p in enumerate(problems) if k != 8]  # 29-cu və 32-ci eynidir, biri atılır
    assert len(uniq) == len(sol) == 10, (len(uniq), len(sol))
    for j, (t, s) in enumerate(zip(uniq, sol)):
        qs.append({"n": 20 + j, "q": t, "kind": "problem", "group": "p", "src": "hesab", "answer": s["answer"]})
    return {
        "id": "fizika",
        "short": "Fizika",
        "name": "Fizika: mexanika, molekulyar fizika, elektrostatika",
        "exam": "Kollokvium",
        "lang": "az",
        "answer": "text",
        "ticket": ["a", "b", "p"],
        "ticketNote": "Təxmini tərtib: 2 nəzəri sual (mexanika/molekulyar, sonra termodinamika/elektrik) və 1 məsələ. Real biletin tərtibini yoxla.",
        "questions": qs,
    }


# ---------------------------------------------------------------- XDİAK
def build_xdiak():
    d = docx.Document(KOL / "XDİAK kollekvium sualları.docx")
    ps = [clean(p.text) for p in d.paragraphs if clean(p.text)]
    i = ps.index("Speaking")
    prompts = ps[i + 1:]
    groups = ["places"] * 10 + ["help"] * 8 + ["senses"] * 6 + ["places"]
    assert len(prompts) == len(groups) == 25, len(prompts)
    qs = [{"n": k + 1, "q": p, "kind": "speaking", "group": g, "src": "umumi", "answer": ""} for k, (p, g) in enumerate(zip(prompts, groups))]
    return {
        "id": "xdiak",
        "short": "XDİAK",
        "name": "Xarici dildə işgüzar və akademik kommunikasiya (İngilis dili)",
        "exam": "Kollokvium · Speaking",
        "lang": "en",
        "answer": "voice",
        "levels": [
            {"id": "elementary", "label": "Elementary (A1–A2)",
             "desc": "very basic: simple present/past, be/have, can, there is/are, basic everyday words, short simple sentences. Do NOT expect or reward advanced vocabulary (B2–C2 words) or complex grammar; an elementary student who speaks clearly in short correct sentences deserves a high score."},
            {"id": "preint", "label": "Pre-Intermediate (A2–B1)",
             "desc": "past simple/continuous, future (will/going to), comparatives, basic connectors (because, but, so, when), everyday and topic vocabulary. Do not expect advanced idioms or C-level vocabulary."},
            {"id": "inter", "label": "Intermediate (B1–B2)",
             "desc": "a range of tenses incl. present perfect, conditionals 1–2, relative clauses, linking words, opinions with reasons, topic vocabulary with some collocations. Occasional errors are acceptable if meaning is clear."},
            {"id": "upper", "label": "Upper-Intermediate and above (B2–C1)",
             "desc": "accurate, varied grammar, wide vocabulary, idiomatic and precise word choice, natural linking and development of ideas. Errors in basic grammar weigh heavily; expect precise lexis."},
        ],
        "ticket": ["places", "help", "senses"],
        "ticketNote": "Speaking: 25 mövzudan 3-ü düşür (yer və səyahət, kömək, hisslər). İngilis dilində cavab verirsən.",
        "questions": qs,
    }


SUBJECTS = [build_adiak(), build_fizika(), build_xdiak()]
(HERE / "subjects.js").write_text("window.SUBJECTS = " + json.dumps(SUBJECTS, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
api = HERE / "api"
api.mkdir(exist_ok=True)
slim = {s["id"]: {"short": s["short"], "name": s["name"], "lang": s["lang"], "levels": s.get("levels", []), "q": {q["n"]: {k: q[k] for k in ("n", "q", "kind", "src", "answer")} for q in s["questions"]}} for s in SUBJECTS}
(api / "_data.js").write_text("export default " + json.dumps(slim, ensure_ascii=False) + ";\n", encoding="utf-8")
for s in SUBJECTS:
    print(s["id"], len(s["questions"]), "sual", {k: sum(1 for q in s["questions"] if q["src"] == k) for k in {q["src"] for q in s["questions"]}})

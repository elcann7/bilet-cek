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
# Suallar: yalnız müəllimin rəsmi faylından (fizika kollek resmi.docx).
# Etalon cavablar: müəllimin mühazirə materialına əsasən (mühazirə 1 və 2 slaydları) Claude tərəfindən yazılıb,
# content/fizika-nezeri.txt faylındadır. Böyük kursların PDF-i və slayd şəkilləri istifadə edilmir.
# Mühazirə 3 (elektrostatika, suallar 14–19) materialı yoxdur: bu cavablar ümumi fizika biliyinə əsasən yazılıb.
NO_LECTURE = "\n\n**Qeyd:** bu cavab ümumi fizika biliyinə əsasən yazılıb, çünki müəllimin mühazirə 3 materialı əlimdə yoxdur. Mühazirə slaydı ilə tutuşdur."


def build_fizika():
    d = docx.Document(KOL / "fizika kollek resmi.docx")
    ps = [clean(p.text) for p in d.paragraphs if clean(p.text)]
    start = next(i for i, t in enumerate(ps) if t.startswith("İrəliləmə"))
    items = ps[start:]
    theory, problems = items[:19], items[19:]
    assert len(theory) == 19 and len(problems) == 11, (len(theory), len(problems))

    for old in ANS.glob("fizika-*.webp"):   # köhnə PDF səhifə və slayd şəkilləri
        old.unlink()
    txt = (HERE / "content" / "fizika-nezeri.txt").read_text(encoding="utf-8")
    answers = {int(m.group(1)): m.group(2).strip() for m in re.finditer(r"(?ms)^### (\d+)\n(.*?)(?=^### |\Z)", txt)}
    assert sorted(answers) == list(range(1, 20)), sorted(answers)

    qs = []
    for i, t in enumerate(theory, 1):
        if i <= 13:
            q = {"src": "muhazire", "answer": answers[i]}
        else:
            q = {"src": "umumi", "answer": answers[i] + NO_LECTURE}
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
KOICA = KOL / "Koica - Elementary Kollokvium ( 2026) (1 semestr) (1).docx"
# Müəllimin faylındakı oxşar mövzu mətni (nümunə kimi göstərilir): speaking sualı → "N) Başlıq"
READ_MAP = {
    "describe your best friend.": 6,
    "describe your family.": 10,
    "describe a person in your family you admire the most.": 10,
    "describe your favourite food.": 3,
    "describe what you usually do in your free time.": 7,
    "what are your biggest dreams for the future?": 19,
}


def build_koica():
    """Müəllimin rəsmi Elementary faylı: Reading mətnləri, Grammar mövzuları, Speaking sualları."""
    ps = [clean(p.text) for p in docx.Document(KOICA).paragraphs if clean(p.text)]
    r0, g0, s0 = ps.index("Reading"), ps.index("Grammar Topics"), ps.index("Speaking")
    reads, cur = {}, None
    for t in ps[r0 + 1:g0]:
        m = re.match(r"^(\d+)\) (.+)$", t)
        if m:
            cur = int(m.group(1)); reads[cur] = {"title": m.group(2).strip(" ."), "text": []}
        elif cur:
            reads[cur]["text"].append(t)
    grammar = ps[g0 + 1:s0]
    seen, prompts = set(), []
    for t in ps[s0 + 1:]:
        if t.lower() not in seen:          # "Describe your best friend." faylda iki dəfə yazılıb
            seen.add(t.lower()); prompts.append(t)
    qs = []
    for k, p in enumerate(prompts):
        q = {"n": 201 + k, "q": p, "kind": "speaking", "group": "all", "set": "koica", "src": "umumi", "answer": ""}
        rid = READ_MAP.get(p.lower())
        if rid:
            q["ref"] = "\n\n".join(reads[rid]["text"]); q["refTitle"] = reads[rid]["title"]
        qs.append(q)
    texts = [{"n": k, "title": v["title"], "text": "\n\n".join(v["text"])} for k, v in sorted(reads.items())]
    return qs, grammar, texts


def build_xdiak():
    src = KOL / "XDİAK kollekvium sualları.docx"
    if not src.exists():   # mənbə fayl köçürülüb: son qurulmuş nüsxədən götür
        print("XDİAK mənbə faylı yoxdur, content/xdiak-snapshot.json istifadə olunur")
        return json.loads((HERE / "content" / "xdiak-snapshot.json").read_text(encoding="utf-8"))
    d = docx.Document(src)
    ps = [clean(p.text) for p in d.paragraphs if clean(p.text)]
    i = ps.index("Speaking")
    prompts = ps[i + 1:]
    assert len(prompts) == 25, len(prompts)
    qs = [{"n": k + 1, "q": p, "kind": "speaking", "group": "all", "set": "other", "src": "umumi", "answer": ""} for k, p in enumerate(prompts)]
    koica, grammar, texts = build_koica()
    qs = koica + qs
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
        "limit": 240,
        "sets": [
            {"id": "koica", "label": "Elementary · Koica (2026, 1 semestr)", "level": "elementary", "grammar": grammar, "texts": texts},
            {"id": "other", "label": "Digər qrup (ayrı sual siyahısı)", "level": None},
        ],
        "ticket": ["all"],
        "ticketNote": "Speaking: siyahıdan 1 sual düşür və ona uzun, ətraflı cavab verirsən (2–4 dəqiqə). İngilis dilində danışırsan.",
        "questions": qs,
    }


# ---------------------------------------------------------------- Python (Proqramlaşdırmanın əsasları)
def build_python():
    """Rəsmi sual faylı: 20 nəzəri mövzu + "Misallar" (10 kod izləmə tapşırığı, N hər tələbədə fərqlidir)."""
    d = docx.Document(KOL / "proqramasdirma esaslari kollek suallari.docx")
    ps = [clean(p.text) for p in d.paragraphs if clean(p.text)]
    theory = ps[: ps.index("Misallar.")]
    assert len(theory) == 20, len(theory)
    txt = (HERE / "content" / "python-nezeri.txt").read_text(encoding="utf-8")
    ans = {int(m.group(1)): m.group(2).strip() for m in re.finditer(r"(?ms)^### (\d+)\n(.*?)(?=^### |\Z)", txt)}
    assert sorted(ans) == list(range(1, 21)), sorted(ans)
    tasks = json.loads((HERE / "content" / "python-meseleler.json").read_text(encoding="utf-8"))
    assert len(tasks) == 10
    qs = [{"n": i, "q": t, "kind": "theory", "group": "a" if i <= 10 else "b", "src": "umumi", "answer": ans[i]} for i, t in enumerate(theory, 1)]
    qs += [{"n": 20 + j, "q": t["q"], "kind": "problem", "group": "p", "src": "hesab", "answer": t["answer"]} for j, t in enumerate(tasks, 1)]
    return {
        "id": "python", "short": "Python", "name": "Proqramlaşdırmanın əsasları-1 (Python)",
        "exam": "Kollokvium", "lang": "az", "answer": "text", "ticket": ["a", "b", "p"],
        "ticketNote": "Təxmini tərtib: 2 nəzəri sual və 1 kod tapşırığı. Real biletin tərtibini yoxla. Tapşırıqlarda N variantdan variantadır: cavab cədvəli bütün N üçün verilib.",
        "questions": qs,
    }


# ---------------------------------------------------------------- Riyazi analiz
def build_riyazi():
    """Rəsmi suallar (şəkillərdən Gemini oxuyub): 10 nəzəri + 20 çalışma. Etalonlar ümumi biliyə əsasən yazılıb, çalışmalar sympy ilə yoxlanıb."""
    d = docx.Document(KOL.parent / "Riyazi_analiz_1_kollokvium_suallari.docx") if (KOL.parent / "Riyazi_analiz_1_kollokvium_suallari.docx").exists() else docx.Document(KOL / "riyazi analiz" / "Riyazi_analiz_1_kollokvium_suallari.docx")
    items = {}
    for p in d.paragraphs:
        m = re.match(r"^(\d+)\) (.+)$", clean(p.text))
        if m:
            items[int(m.group(1))] = m.group(2)
    assert sorted(items) == list(range(1, 31)), sorted(items)
    txt = (HERE / "content" / "riyazi-nezeri.txt").read_text(encoding="utf-8")
    ans = {int(m.group(1)): m.group(2).strip() for m in re.finditer(r"(?ms)^### (\d+)\n(.*?)(?=^### |\Z)", txt)}
    assert sorted(ans) == list(range(1, 11)), sorted(ans)
    sol = {r["n"]: r["answer"] for r in json.loads((HERE / "content" / "riyazi-calismalar.json").read_text(encoding="utf-8"))}
    assert sorted(sol) == list(range(11, 31)), sorted(sol)
    qs = []
    for i in range(1, 31):
        if i <= 10:
            qs.append({"n": i, "q": items[i], "kind": "theory", "group": "a" if i <= 5 else "b", "src": "umumi", "answer": ans[i]})
        else:
            qs.append({"n": i, "q": items[i], "kind": "problem", "group": "p", "src": "hesab", "answer": sol[i]})
    return {
        "id": "riyazi", "short": "Riyazi analiz", "name": "Riyazi analiz-1: limit, kəsilməzlik, törəmə",
        "exam": "Kollokvium", "lang": "az", "answer": "text", "ticket": ["a", "b", "p"],
        "ticketNote": "Təxmini tərtib: 2 nəzəri sual və 1 çalışma. Real biletin tərtibini yoxla. Suallar şəkillərdən oxunub: düsturları rəsmi siyahı ilə yoxla.",
        "questions": qs,
    }


SUBJECTS = [build_adiak(), build_fizika(), build_xdiak(), build_python(), build_riyazi()]
for _s in SUBJECTS:
    _s.setdefault("max", 10)  # kollokvium cəmi 10 baldır
(HERE / "subjects.js").write_text("window.SUBJECTS = " + json.dumps(SUBJECTS, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
api = HERE / "api"
api.mkdir(exist_ok=True)
slim = {s["id"]: {"short": s["short"], "name": s["name"], "lang": s["lang"], "levels": s.get("levels", []), "sets": [{"id": x["id"], "grammar": x.get("grammar", [])} for x in s.get("sets", [])], "q": {q["n"]: {k: q[k] for k in ("n", "q", "kind", "src", "answer")} for q in s["questions"]}} for s in SUBJECTS}
(api / "_data.js").write_text("export default " + json.dumps(slim, ensure_ascii=False) + ";\n", encoding="utf-8")
for s in SUBJECTS:
    print(s["id"], len(s["questions"]), "sual", {k: sum(1 for q in s["questions"] if q["src"] == k) for k in {q["src"] for q in s["questions"]}})

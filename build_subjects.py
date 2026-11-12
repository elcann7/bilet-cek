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
# Suallar: yalnız müəllimin rəsmi faylından (fizika kollek resmi.docx). Etalon cavablar: müəllimin mühazirə slaydlarından
# (04-Fizika/Muhazireler). Böyük kursların PDF cavabları İSTİFADƏ EDİLMİR.
# Rəsmi sual № → (mühazirə, slayd nömrələri). Mühazirə 3 (elektrostatika) faylı yoxdur: 14–19 etalonsuz qalır.
LECT = Path(os.environ.get("LECTURES_DIR") or HOME / "OneDrive" / "Documents" / "AzTU-1-Semestr" / "04-Fizika" / "Muhazireler")
LECT_FILES = {"m1": "Fizika - Giris ve movzular (51 slayd).pptx", "m2": "M02 - Molekulyar fizika ve termodinamika.pptx"}
FIZ_SLIDES = {
    1: ("m1", [11, 12, 21, 24, 25, 26, 28]),
    2: ("m1", [6, 7, 13, 14, 15, 16, 18, 20, 21, 23]),
    3: ("m1", [33, 34, 35, 36, 48]),
    4: ("m1", [37, 38, 39, 40, 41, 42, 43, 44, 45, 47]),
    5: ("m1", [28, 29, 30, 31, 32]),
    6: ("m1", [25, 26, 27, 46]),
    7: ("m2", [6, 7, 8, 9, 10, 11, 12]),
    8: ("m2", [13, 14, 15, 16]),
    9: ("m2", [17, 18, 19, 20, 21]),
    10: ("m2", [22, 23]),
    11: ("m2", [28, 29]),
    12: ("m2", [32, 33, 34]),
    13: ("m2", [24, 25, 26, 30, 31, 35]),
}
# Mühazirə 2-nin 22–37-ci slaydları tam şəkildir (mətn çıxmır): məzmunu slayddan oxuyub yazmışam
FIZ_TEXT_FIX = {
    10: """Sərbəstlik dərəcələrinin sayı (i): cismin fəzada vəziyyətini təyin edən müstəqil koordinatların sayı. Maddi nöqtə i=3, birnöqtəli molekul i=3, sərt ikiatomlu molekul i=5 (3 irəliləmə + 2 fırlanma), üç və çoxatomlu molekul i=6. Ümumi halda i = i_irəl + i_fırl + 2·i_rəqs.
Enerjinin sərbəstlik dərəcələrinə görə bərabər paylanması (Bolsman) qanunu: termodinamik tarazlıqda hər bir sərbəstlik dərəcəsinə orta hesabla eyni enerji düşür: ε₁ = kT/2. Molekulun orta kinetik enerjisi ⟨ε⟩ = (i/2)·kT.""",
    11: """Termodinamikada iş: porşenin altındakı qaz genişlənərkən görülən elementar iş dA = p·dV, qazın həcmi V₁-dən V₂-yə dəyişəndə A₁₂ = ∫p dV.
İzobarik proses (p=const): A = p(V₂−V₁) = (m/M)·R(T₂−T₁). İzoxorik proses (V=const): iş görülmür, A=0. İzotermik proses (T=const): p = (m/M)RT/V əvəz edilir, A = (m/M)RT·ln(V₂/V₁) = (m/M)RT·ln(p₁/p₂). Adiabatik proses: A = −ΔU.""",
    12: """İstilik tutumu: cismin 1 K qızdırmaq üçün lazım olan istilik miqdarı, C = dQ/dT. Xüsusi istilik tutumu c = dQ/(m·dT) (1 kq maddəni 1 K qızdırmaq üçün), molyar istilik tutumu C_m = dQ/(ν·dT) (1 mol maddə üçün), C_m = M·c.
Sabit həcmdə C_V = (i/2)·R, sabit təzyiqdə C_p = ((i+2)/2)·R. Mayer düsturu: C_p − C_V = R. Adiabat əmsalı (Puasson əmsalı) γ = C_p/C_V = (i+2)/i.""",
    13: """Termodinamikanın I qanunu: sistemə verilən istilik miqdarı (dQ) onun daxili enerjisinin dəyişməsinə (dU) və xarici qüvvələrə qarşı görülən işə (dA) sərf olunur: dQ = dU + dA. Daxili enerji U = (i/2)·(m/M)·R·T.
İzoxorik proses: dA=0, dQ = dU. İzotermik proses: dU=0, dQ = dA. İzobarik proses: dQ = dU + p·dV. Adiabatik proses (istilik mübadiləsi yoxdur): dQ=0, dA = −dU; hal tənliyi (Puasson): p·V^γ = const, T·V^(γ−1) = const.
Termodinamikanın II qanunu: istilik özbaşına soyuq cisimdən isti cismə keçə bilməz; bütün istilik mühərrikləri üçün f.i.ə. 1-dən kiçikdir; qapalı sistemdə entropiya azalmır. (Mühazirə slaydlarında II qanun yoxdur, bu hissəni müəllimdən dəqiqləşdir.)""",
}


def slide_texts(pptx_path, nums):
    from pptx import Presentation
    prs = Presentation(pptx_path)
    out = []
    for n in nums:
        parts = []
        for sh in prs.slides[n - 1].shapes:
            if sh.has_text_frame and sh.text_frame.text.strip():
                parts.append(clean(sh.text_frame.text))
        if parts:
            out.append(" ".join(parts))
    return "\n\n".join(out)


def build_fizika():
    d = docx.Document(KOL / "fizika kollek resmi.docx")
    ps = [clean(p.text) for p in d.paragraphs if clean(p.text)]
    start = next(i for i, t in enumerate(ps) if t.startswith("İrəliləmə"))
    items = ps[start:]
    theory, problems = items[:19], items[19:]
    assert len(theory) == 19 and len(problems) == 11, (len(theory), len(problems))

    # köhnə (böyük kurs PDF) səhifə şəkillərini təmizlə, mühazirə slaydlarını şəklə çevir
    for old in ANS.glob("fizika-p*.webp"):
        old.unlink()
    import importlib.util
    spec = importlib.util.spec_from_file_location("render_slides", HERE / "content" / "render_slides.py")
    rs = importlib.util.module_from_spec(spec); spec.loader.exec_module(rs)
    for lec, nums in {k: sorted({n for kk, (l, ns) in FIZ_SLIDES.items() if l == k for n in ns}) for k in LECT_FILES}.items():
        rs.render(LECT / LECT_FILES[lec], nums, ANS, f"fizika-{lec}-")

    qs = []
    for i, t in enumerate(theory, 1):
        if i in FIZ_SLIDES:
            lec, nums = FIZ_SLIDES[i]
            text = FIZ_TEXT_FIX.get(i) or slide_texts(LECT / LECT_FILES[lec], nums)
            q = {"src": "muhazire", "answer": text, "images": [f"answers/fizika-{lec}-{n:02d}.webp" for n in nums]}
        else:
            q = {"src": "umumi", "answer": ""}  # mühazirə 3 (elektrostatika) faylı yoxdur
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
    d = docx.Document(KOL / "XDİAK kollekvium sualları.docx")
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


SUBJECTS = [build_adiak(), build_fizika(), build_xdiak()]
for _s in SUBJECTS:
    _s.setdefault("max", 20)  # kollokvium cəmi 20 baldır
(HERE / "subjects.js").write_text("window.SUBJECTS = " + json.dumps(SUBJECTS, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
api = HERE / "api"
api.mkdir(exist_ok=True)
slim = {s["id"]: {"short": s["short"], "name": s["name"], "lang": s["lang"], "levels": s.get("levels", []), "sets": [{"id": x["id"], "grammar": x.get("grammar", [])} for x in s.get("sets", [])], "q": {q["n"]: {k: q[k] for k in ("n", "q", "kind", "src", "answer")} for q in s["questions"]}} for s in SUBJECTS}
(api / "_data.js").write_text("export default " + json.dumps(slim, ensure_ascii=False) + ";\n", encoding="utf-8")
for s in SUBJECTS:
    print(s["id"], len(s["questions"]), "sual", {k: sum(1 for q in s["questions"] if q["src"] == k) for k in {q["src"] for q in s["questions"]}})

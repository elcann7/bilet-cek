"""Kollokvium suallarını (docx) və etalon cavabları (md) questions.js-ə çevirir.
İşə sal: python build_questions.py  (cavablar dəyişəndə yenidən işə sal)"""
import json
import re
import sys
from pathlib import Path

import docx

sys.stdout.reconfigure(encoding="utf-8")
BASE = Path.home() / "Documents" / "AzTU-1-Semestr" / "05-ADIAK-Azerbaycan-Dili"

official = {}
for table in docx.Document(BASE / "Kollokvium-Suallari.docx").tables:
    for row in table.rows:
        cells = [re.sub(r"\s+", " ", c.text).strip() for c in row.cells]
        m = re.match(r"^(\d+)\.$", cells[0])
        if m and len(cells) > 1:
            official[int(m.group(1))] = cells[1]

md = (BASE / "Kollokvium-Cavablar.md").read_text(encoding="utf-8")
parts = re.split(r"^## (\d+)\. (✅|🟡) (.+)$", md, flags=re.M)
answers = {}
for i in range(1, len(parts), 4):
    answers[int(parts[i])] = {
        "src": "vesait" if parts[i + 1] == "✅" else "umumi",
        "answer": parts[i + 3].split("\n---")[0].strip(),
    }

assert sorted(official) == list(range(1, 31)), sorted(official)
assert sorted(answers) == list(range(1, 31)), sorted(answers)
data = [{"n": n, "q": official[n], **answers[n]} for n in range(1, 31)]
out = Path(__file__).with_name("questions.js")
out.write_text("window.QUESTIONS = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
# server üçün eyni məlumat (Vercel funksiyası prompt-u burada qurur)
api = out.with_name("api") / "_data.js"
api.parent.mkdir(exist_ok=True)
api.write_text("export default " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
print(f"{len(data)} sual yazıldı -> {out.name}")
for x in data[:8]:
    print(x["n"], "|", x["q"][:50], "|", x["answer"][:50].replace("\n", " "))

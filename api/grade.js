// Vercel funksiyası: tələbənin cavabını Gemini ilə qiymətləndirir.
// Açar serverdə saxlanır (GEMINI_API_KEY). İstifadəçi öz açarını "x-user-key" başlığı ilə göndərsə, o istifadə olunur.
// POST /api/grade?n=5&kind=audio   body: audio/wav (xam bayt)
// POST /api/grade?n=5&kind=text    body: mətn (text/plain)
// POST /api/grade?ping=1           açarın işlədiyini yoxlayır
import QUESTIONS from "./_data.js";

const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const MAX_BYTES = 4_400_000; // Vercel sorğu limiti 4.5 MB

const SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 10 },
    covered: { type: "array", items: { type: "string" } },
    missed: { type: "array", items: { type: "string" } },
    feedback: { type: "string" },
    speech: { type: "string" },
  },
  required: ["transcript", "score", "covered", "missed", "feedback", "speech"],
};

const PROMPT = (q, kind) => `Sən Azərbaycan Texniki Universitetində "Azərbaycan dilində işgüzar və akademik kommunikasiya" (ADİAK) fənnindən kollokvium qəbul edən müəllimsən. Tələbə biletdəki suala ${kind === "audio" ? "şifahi" : "yazılı"} cavab verib.

SUAL №${q.n}: ${q.q}

ETALON CAVAB (${q.src === "vesait" ? "dərs vəsaitindən" : "fənnin ümumi məzmunundan"}):
"""
${q.answer}
"""

Tapşırıq:
1. transcript: ${kind === "audio" ? "Səs yazısını Azərbaycan dilində olduğu kimi, sözbəsöz mətnə çevir. Eşitmədiyin heç nəyi əlavə etmə və düzəltmə. Yazı boşdursa və ya anlaşılmırsa, bunu qeyd et." : "Tələbənin mətnini olduğu kimi qaytar."}
2. Cavabı etalonla müqayisə et. Etalon yalnız istiqamətdir: tələbə öz sözləri ilə, başqa düzgün misallarla danışa bilər; mənaca doğru olan hər fikri say. Sual bir neçə hissədən ibarətdirsə, hər hissənin cavablandırılıb-cavablandırılmadığını yoxla. Faktiki səhvləri "missed" bölməsində qeyd et.
3. score (0–10): 9–10 = əsas fikirlərin demək olar hamısı, məntiqi ardıcıllıq və terminlərlə; 7–8 = əsas fikirlər var, bir-iki boşluq; 5–6 = mövzunun yarısı, səthi; 3–4 = bir neçə doğru fikir; 1–2 = çox az və ya ümumi sözlər; 0 = cavab yoxdur və ya mövzudan kənardır. Ədalətli ol, amma uzun danışmağı məzmun kimi qiymətləndirmə.
4. covered: tələbənin düzgün dediyi əsas fikirlər (hər biri qısa ifadə). missed: etalonda olub deyilməyən ən vacib fikirlər (ən çox 5, qısa).
5. feedback: tələbəyə "sən" deyə müraciət edən 2–3 cümləlik konkret rəy: nə yaxşı idi, balı artırmaq üçün nə əlavə etməli idi.
6. speech: ${kind === "audio" ? "nitq mədəniyyəti barədə 1 cümlə (ardıcıllıq, parazit sözlər, terminlərin işlənməsi, ədəbi dil normaları)." : "yazı mədəniyyəti barədə 1 cümlə."}
Bütün mətnlər Azərbaycan dilində olsun.`;

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const cleanKey = (k) => String(k || "").replace(/[^\x21-\x7e]/g, "");

async function callGemini(key, parts, schema) {
  let last = { status: 502, error: "Model cavab vermədi" };
  for (const model of MODELS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 55_000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0.2 },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error?.message || `HTTP ${res.status}`;
        if ((res.status === 400 && /api key/i.test(msg)) || res.status === 403) return { status: 401, error: "API açarı yanlışdır və ya icazəsi yoxdur" };
        last = res.status === 429
          ? { status: 429, error: "Hazırda çox adam yoxlayır (limit doldu). 1 dəqiqə sonra yenidən cəhd et." }
          : { status: 502, error: `${model}: ${msg}` };
        continue;
      }
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      try { return { ok: JSON.parse(text) }; } catch { last = { status: 502, error: "Model düzgün JSON qaytarmadı" }; }
    } catch (e) {
      last = { status: 504, error: ctl.signal.aborted ? "Vaxt bitdi (model cavab vermədi)" : String(e.message || e) };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

// GET /api/grade → serverdə ümumi açar varmı? (yoxdursa, hər kəs öz açarını daxil edir)
export function GET() {
  return json(200, { shared: !!cleanKey(process.env.GEMINI_API_KEY) });
}

export async function POST(request) {
  const url = new URL(request.url);
  const key = cleanKey(request.headers.get("x-user-key")) || cleanKey(process.env.GEMINI_API_KEY);
  if (!key) return json(401, { error: "API açarı yoxdur. Ayarlarda öz pulsuz açarını əlavə et.", needKey: true });

  if (url.searchParams.get("ping")) {
    const r = await callGemini(key, [{ text: 'Yalnız {"ok":true} qaytar.' }], { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] });
    return r.ok ? json(200, { ok: true, own: !!request.headers.get("x-user-key") }) : json(r.status, { error: r.error });
  }

  const n = Number(url.searchParams.get("n"));
  const kind = url.searchParams.get("kind");
  const q = QUESTIONS.find((x) => x.n === n);
  if (!q || !["audio", "text"].includes(kind)) return json(400, { error: "Yanlış sorğu" });

  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BYTES) return json(413, { error: "Səs yazısı çox böyükdür" });
  const body = Buffer.from(await request.arrayBuffer());
  if (!body.length || body.length > MAX_BYTES) return json(413, { error: "Cavab boşdur və ya çox böyükdür" });

  const parts = [{ text: PROMPT(q, kind) }];
  if (kind === "audio") {
    if (body.subarray(0, 4).toString("ascii") !== "RIFF") return json(400, { error: "Səs WAV formatında deyil" });
    parts.push({ inline_data: { mime_type: "audio/wav", data: body.toString("base64") } });
  } else {
    parts.push({ text: `TƏLƏBƏNİN CAVABI:\n"""\n${body.toString("utf8").slice(0, 20000)}\n"""` });
  }

  const r = await callGemini(key, parts, SCHEMA);
  if (!r.ok) return json(r.status, { error: r.error });
  const out = r.ok;
  out.score = Math.max(0, Math.min(10, Math.round(Number(out.score) || 0)));
  return json(200, out);
}

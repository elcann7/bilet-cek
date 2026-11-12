// Vercel funksiyası: tələbənin cavabını Gemini ilə qiymətləndirir (bütün fənlər: sual növünə görə prompt).
// Açar serverdə saxlanır (GEMINI_API_KEY). İstifadəçi öz açarını "x-user-key" başlığı ilə göndərsə, o istifadə olunur.
// POST /api/grade?s=fizika&n=5&kind=audio   body: audio/wav (xam bayt)
// POST /api/grade?s=adiak&n=5&kind=text     body: mətn (text/plain)
// POST /api/grade?ping=1           açarın işlədiyini yoxlayır
import DATA from "./_data.js";

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
    corrected: { type: "string" },
  },
  required: ["transcript", "score", "covered", "missed", "feedback", "speech"],
};

const SRC_LABEL = {
  vesait: "dərs vəsaitindən",
  kurs: "böyük kursların cavab faylından",
  umumi: "fənnin ümumi məzmunundan",
  hesab: "hesablanmış həll",
  muhazire: "müəllimin mühazirə slaydlarından (rəsmi)",
  user: "istifadəçinin özü yüklədiyi material",
};
const LANG_NAME = { az: "Azərbaycan", en: "ingilis", ru: "rus", tr: "türk" };

const OUT_RULES = (kind) => `transcript: ${kind === "audio" ? "Səs yazısını olduğu kimi, sözbəsöz mətnə çevir. Eşitmədiyin heç nəyi əlavə etmə və düzəltmə. Yazı boşdursa və ya anlaşılmırsa, bunu qeyd et." : "Tələbənin mətnini olduğu kimi qaytar."}`;

// Sual növünə görə prompt: nəzəri sual, məsələ, ingilis dilində speaking
// Qrupun müəllimi qrammatika mövzularını verirsə, şifahi cavabda məhz onlar yoxlanır
const GRAMMAR = (g) => (g && g.length ? `
TEACHER'S GRAMMAR TOPICS FOR THIS GROUP: ${g.join("; ")}.
These are the structures the teacher teaches and checks in speaking. When you look for grammar mistakes, give these topics the highest priority (tense forms of simple tenses and present continuous, articles, countable/uncountable nouns and quantifiers, prepositions, word order, adverbs/adjectives, pronouns, question words, conjunctions and time clauses, have got / has got). Name the topic in the correction, e.g. "[qrammatika: articles] dedin: ... → düzgünü: ...". Mistakes outside these topics still count, but less.` : "");

const PROMPT = (subj, q, kind, level, grammar) => {
  const how = kind === "audio" ? "şifahi" : "yazılı";
  if (q.kind === "speaking") {
    return `You are an English teacher examining a university student in a speaking colloquium (course: "${subj.name}"). The student answered the speaking task ${kind === "audio" ? "orally" : "in writing"}.

STUDENT'S COURSE LEVEL: ${level ? `${level.label}. Expectations at this level: ${level.desc}` : "about A2–B1"}
Different student groups study at different levels and their teachers expect different things, so grade RELATIVE TO THIS LEVEL: a 10 means "excellent for this level", not "native-like". Never ask for or penalise the absence of vocabulary or structures above this level. Do count every lexical and grammatical mistake that is visible in the transcript, because the transcript must be literal (see below): wrong tense, missing or wrong articles, subject–verb agreement, word order, plurals, prepositions, wrong word choice or collocation, Azerbaijani-English literal translations. Mistakes in structures the level should already control weigh more; mistakes in structures clearly beyond the level weigh less.${GRAMMAR(grammar)}

TASK ${q.n}: ${q.q}

Do this:
1. transcript: ${kind === "audio" ? "Transcribe the audio LITERALLY, word for word, in English, keeping the student's grammar and word-choice mistakes exactly as spoken (do not correct, smooth or complete anything; if a word was mispronounced so that it sounds like another word, write what was said and add [unclear] if unsure). If the recording is empty or unintelligible, say so." : "Return the student's text as it is, with all its mistakes."}
2. Judge the answer on: task fulfilment (did they answer the question and develop it at a reasonable length for the level), grammar accuracy, vocabulary range and accuracy, coherence, and fluency, all relative to the level above. Do NOT reward length alone; a long answer full of errors or off-topic is not a good one. In this colloquium the student gets ONE speaking task and is expected to give a long, developed answer (about 2–4 minutes of speech, i.e. a full paragraph or more: explanation, reasons, examples). An answer that is much too short for this (for example only 4–6 simple sentences, under about 100 words) must lose points under task fulfilment and development, even if it is correct. What counts as long enough depends on the level: roughly 200+ words (about 15 simple sentences) for elementary (the teacher's own model texts for this group are 250–330 words), 230+ for pre-intermediate, 270+ for intermediate, 320+ for upper-intermediate. Answers clearly below that lose points; well-developed answers at or above it do not lose points for length.
3. score (0–10): 9–10 = answers fully, well organised, few minor errors; 7–8 = answers clearly, some errors that do not block meaning; 5–6 = understandable but simple or with frequent errors; 3–4 = very limited, hard to follow; 1–2 = a few words/phrases; 0 = no answer or off-topic.
4. covered: what the student did well (short phrases, in Azerbaijani). missed: the mistakes found in the transcript, at most 8, most important first, each in the form: "[qrammatika] dedin: ... → düzgünü: ..." or "[leksika] dedin: ... → düzgünü: ..." (quote the student's exact words, give the correct English, add a very short explanation in Azerbaijani when needed). If there are no real mistakes, return an empty list.
5. feedback: 2–3 sentences in Azerbaijani addressed to the student ("sən"): what was good and what to do to raise the score.
6. speech: 1 sentence in Azerbaijani about fluency and pronunciation (hesitations, filler words, sentence variety).
7. corrected: rewrite the student's WHOLE answer as it should have been said: same ideas, same order and same structure, in the same spoken style and at the same level (use words and grammar the student could realistically use), but with EVERY grammar and vocabulary mistake fixed and obvious gaps in sentences completed. Do not add new ideas, do not make it fancier than the student's level, do not shorten it. Keep the student's correct sentences unchanged. Plain text, paragraphs separated by a blank line. If the transcript is empty, return an empty string.
Write covered/missed/feedback/speech in Azerbaijani; keep quoted English and the "corrected" text as English.`;
  }
  const problem = q.kind === "problem";
  const langNote = subj.lang && subj.lang !== "az" && LANG_NAME[subj.lang] ? ` Tələbə ${LANG_NAME[subj.lang]} dilində cavab verir; səs yazısını həmin dildə mətnə çevir.` : "";
  return `Sən ${subj.custom ? "bir universitetdə" : "Azərbaycan Texniki Universitetində"} "${subj.name}" fənnindən ${problem ? "kollokvium (məsələ hissəsi)" : "kollokvium"} qəbul edən müəllimsən. Tələbə biletdəki ${problem ? "məsələyə" : "suala"} ${how} cavab verib.${langNote}

${problem ? "MƏSƏLƏ" : "SUAL"} №${q.n}: ${q.q}

${q.answer ? `${problem ? "DÜZGÜN HƏLL VƏ CAVAB" : "ETALON CAVAB"} (${SRC_LABEL[q.src] || "etalon"}):
"""
${q.answer}
"""` : `ETALON CAVAB VERİLMƏYİB. Cavabı öz fənn biliyinə görə qiymətləndir: yalnız əmin olduğun faktiki səhvləri "missed"-ə yaz. Əmin olmadığın yerdə bunu rəydə qeyd et və balı ehtiyatla ver.`}

Tapşırıq:
1. ${OUT_RULES(kind)}
2. ${problem
    ? "Tələbənin həllini yoxla: düzgün düstur seçib, ədədləri düz əvəz edib və son cavabı (ölçü vahidi ilə) düz tapıbmı. Şifahi danışıqda ədədlərin eşidilməsi çətin ola bilər, əvəzetməni məntiqə görə yoxla. Son cavab düzdürsə, lakin həll yolu aydın deyilsə, balı bir az azalt. Cavab səhvdirsə, ara addımlara görə qismən bal ver və səhvin harada olduğunu göstər."
    : "Cavabı etalonla müqayisə et. Etalon yalnız istiqamətdir: tələbə öz sözləri ilə, başqa düzgün misallarla danışa bilər; mənaca doğru olan hər fikri say. Sual bir neçə hissədən ibarətdirsə, hər hissənin cavablandırılıb-cavablandırılmadığını yoxla. Faktiki səhvləri \"missed\" bölməsində qeyd et."}
3. score (0–10): 9–10 = ${problem ? "düzgün həll və düzgün cavab" : "əsas fikirlərin demək olar hamısı, məntiqi ardıcıllıq və terminlərlə"}; 7–8 = ${problem ? "yol düzdür, kiçik hesab və ya vahid səhvi" : "əsas fikirlər var, bir-iki boşluq"}; 5–6 = ${problem ? "yolun yarısı düzdür" : "mövzunun yarısı, səthi"}; 3–4 = ${problem ? "düstur var, həll yarımçıq" : "bir neçə doğru fikir"}; 1–2 = çox az və ya ümumi sözlər; 0 = cavab yoxdur və ya mövzudan kənardır. Ədalətli ol, amma uzun danışmağı məzmun kimi qiymətləndirmə.
4. covered: tələbənin düzgün dediyi əsas fikirlər${problem ? " və ya düzgün addımlar" : ""} (hər biri qısa ifadə). missed: ${problem ? "səhv və ya buraxılmış addımlar" : "etalonda olub deyilməyən ən vacib fikirlər"} (ən çox 5, qısa).
5. feedback: tələbəyə "sən" deyə müraciət edən 2–3 cümləlik konkret rəy: nə yaxşı idi, balı artırmaq üçün nə əlavə etməli idi.
6. speech: ${kind === "audio" ? "nitq mədəniyyəti barədə 1 cümlə (ardıcıllıq, parazit sözlər, terminlərin işlənməsi, ədəbi dil normaları)." : "yazı mədəniyyəti barədə 1 cümlə."}
Bütün mətnlər Azərbaycan dilində olsun.`;
};

// Nümunə cavab (yalnız speaking): istifadəçinin səviyyəsinə uyğun, səhvsiz, təbii danışıq tərzində
const SAMPLE_SCHEMA = {
  type: "object",
  properties: { sample: { type: "string" }, phrases: { type: "array", items: { type: "string" } } },
  required: ["sample", "phrases"],
};
// 2–4 dəqiqəlik danışıq ≈ 120–150 söz/dəq. Minimum söz sayı: bundan qısa gələrsə, nümunə bir dəfə yenidən yazdırılır.
// Müəllimin elementary nümunə mətnləri 245–330 sözdür (~2 dəq), buna uyğun
const WORDS = { elementary: [240, 300], preint: [260, 330], inter: [300, 400], upper: [350, 450] };
const wc = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).length;
const SAMPLE_PROMPT = (subj, q, level, v, grammar) => `You are an English teacher writing a MODEL ANSWER for a university speaking colloquium (course: "${subj.name}"). Students will read it to learn how such an answer sounds.

SPEAKING TASK: ${q.q}

STUDENT LEVEL: ${level ? `${level.label}. ${level.desc}` : "A2–B1"}

Write the model answer exactly as a student of THIS level could realistically say it out loud in about 2–3 minutes at a normal speaking pace (${(WORDS[level && level.id] || [250, 320]).join("–")} words, NEVER fewer than ${(WORDS[level && level.id] || [250, 320])[0]}; count them):
- natural spoken English, first person, with simple linking words (first of all, because, for example, also, in conclusion);
- use ONLY grammar and vocabulary appropriate for this level; no rare or C-level words for lower levels; absolutely no grammar or spelling mistakes;
- a clear structure: short opening, 2–3 developed ideas with reasons and a personal example each, short closing;
- answer the task directly; do not invent facts that sound unrealistic.${grammar && grammar.length ? `\n- build the answer mainly from the teacher's grammar topics: ${grammar.join("; ")} (for example simple present/past, present continuous, have got, articles, prepositions, time clauses, conjunctions).` : ""}
${v > 1 ? `This is variation #${v}: choose a DIFFERENT angle, different examples and different opening than a typical first answer.` : ""}

Return JSON: "sample" = the model answer as plain text (paragraphs separated by a blank line); "phrases" = 5–6 useful phrases or structures taken from the answer, each in the form "English phrase — qısa Azərbaycan tərcüməsi".`;

// ---- istifadəçinin öz fənni: fayl/mətndən sualların çıxarılması, materialdan sual və etalon cavab yaradılması
const PARSE_SCHEMA = {
  type: "object",
  properties: { questions: { type: "array", items: { type: "object", properties: { q: { type: "string" }, answer: { type: "string" }, kind: { type: "string", enum: ["theory", "problem", "speaking"] } }, required: ["q", "answer", "kind"] } } },
  required: ["questions"],
};
const ANSWERS_SCHEMA = {
  type: "object",
  properties: { answers: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, answer: { type: "string" } }, required: ["i", "answer"] } } },
  required: ["answers"],
};
const EXTRACT_PROMPT = (text, hint) => `Below is a document uploaded by a university student. It contains a list of exam / colloquium questions (it may also contain headers, instructions, page numbers or answers).

Extract the exam questions exactly as written, in the document's own language. Rules:
- one entry per question; if a question has several sub-parts on consecutive lines that belong together, keep them in one entry;
- ignore titles, instructions, group names, page numbers, signatures;
- "answer": if the document itself gives the answer or solution to that question right after it, copy it; otherwise return an empty string. Never invent answers here;
- "kind": "problem" for calculation/numeric tasks, "speaking" for tasks that ask the student to talk or write freely about a topic in English, otherwise "theory";
- keep the original order and do not skip questions.${hint ? `\nThe student says about the document: ${hint}` : ""}

DOCUMENT:
"""
${text}
"""`;
const GENERATE_PROMPT = (text, count, hint) => `Below is study material (lecture notes, textbook text) uploaded by a university student. Write ${count} exam questions that a teacher could realistically ask on this material, covering it evenly, ordered by topic. Write in the SAME language as the material. Each question must be self-contained.

For each question return "answer": a model answer of 3–8 sentences based STRICTLY on the material (no outside facts), and "kind": "theory" (or "problem" if the material contains calculation tasks).${hint ? `\nThe student says about the material: ${hint}` : ""}

MATERIAL:
"""
${text}
"""`;
const ANSWERS_PROMPT = (material, items) => `You are helping a university student prepare for an exam. For each question below, write a model answer of 3–8 sentences based STRICTLY on the MATERIAL. Write in the language of the question. If the material does not contain what is needed, start the answer with "(Materialda yoxdur) " and then give a brief answer from general knowledge.

QUESTIONS:
${items.map((x) => `${x.i}. ${x.q}`).join("\n")}

MATERIAL:
"""
${material}
"""

Return JSON with "answers": [{"i": question number, "answer": text}] for every question.`;

function fromCtx(request) {
  let c;
  try { c = JSON.parse(Buffer.from(request.headers.get("x-ctx") || "", "base64").toString("utf8")); } catch { return null; }
  if (!c || typeof c.q !== "string" || !c.q.trim()) return null;
  const kind = ["theory", "problem", "speaking"].includes(c.kind) ? c.kind : "theory";
  return {
    subj: { custom: true, short: "Custom", name: String(c.name || "Fənn").slice(0, 120), lang: String(c.lang || "az").slice(0, 3), levels: (DATA.xdiak && DATA.xdiak.levels) || [], sets: [] },
    q: { n: Number(c.n) || 1, q: c.q.slice(0, 1500), kind, src: c.answer ? "user" : "umumi", answer: String(c.answer || "").slice(0, 4000) },
  };
}

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const cleanKey = (k) => String(k || "").replace(/[^\x21-\x7e]/g, "");

async function callGemini(key, parts, schema, temperature = 0.2) {
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
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature },
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

  const kind = url.searchParams.get("kind");

  if (kind === "parse" || kind === "answers") {
    const raw = Buffer.from(await request.arrayBuffer());
    if (!raw.length || raw.length > 400_000) return json(413, { error: "Mətn boşdur və ya çox böyükdür" });
    let b;
    try { b = JSON.parse(raw.toString("utf8")); } catch { return json(400, { error: "Yanlış sorğu" }); }
    if (kind === "parse") {
      const text = String(b.text || "").slice(0, 60000);
      if (text.trim().length < 20) return json(400, { error: "Mətn çox qısadır" });
      const hint = String(b.hint || "").slice(0, 300);
      const count = Math.max(5, Math.min(40, Number(b.count) || 20));
      const prompt = b.mode === "generate" ? GENERATE_PROMPT(text, count, hint) : EXTRACT_PROMPT(text, hint);
      const r = await callGemini(key, [{ text: prompt }], PARSE_SCHEMA, b.mode === "generate" ? 0.5 : 0.1);
      if (!r.ok) return json(r.status, { error: r.error });
      const list = (r.ok.questions || []).map((x) => ({ q: String(x.q || "").trim().slice(0, 1500), answer: String(x.answer || "").trim().slice(0, 4000), kind: x.kind })).filter((x) => x.q.length > 3).slice(0, 100);
      return json(200, { questions: list });
    }
    const material = String(b.material || "").slice(0, 40000);
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 8).map((x) => ({ i: Number(x.i), q: String(x.q || "").slice(0, 1500) })).filter((x) => x.q);
    if (material.trim().length < 30 || !items.length) return json(400, { error: "Material və ya sual yoxdur" });
    const r = await callGemini(key, [{ text: ANSWERS_PROMPT(material, items) }], ANSWERS_SCHEMA, 0.2);
    if (!r.ok) return json(r.status, { error: r.error });
    return json(200, { answers: (r.ok.answers || []).map((x) => ({ i: Number(x.i), answer: String(x.answer || "").trim().slice(0, 4000) })) });
  }

  const n = Number(url.searchParams.get("n"));
  const sid = url.searchParams.get("s") || "adiak"; // köhnə müştərilər fənn göndərmir: ADİAK
  let subj, q;
  if (sid.startsWith("u_")) { const c = fromCtx(request); if (c) { subj = c.subj; q = c.q; } }   // istifadəçinin öz fənni: sual başlıqla gəlir
  else { subj = DATA[sid]; q = subj && subj.q[n]; }
  if (!q || !["audio", "text", "sample"].includes(kind)) return json(400, { error: "Yanlış sorğu" });

  if (kind === "sample") {
    if (q.kind !== "speaking") return json(400, { error: "Nümunə cavab yalnız speaking üçündür" });
    const lv = (subj.levels || []).find((l) => l.id === url.searchParams.get("lv")) || (subj.levels || [])[0];
    const v = Math.max(1, Math.min(20, Number(url.searchParams.get("v")) || 1));
    const min = (WORDS[lv && lv.id] || [250, 320])[0];
    const gr = ((subj.sets || []).find((x) => x.id === url.searchParams.get("st")) || {}).grammar;
    let rs = await callGemini(key, [{ text: SAMPLE_PROMPT(subj, q, lv, v, gr) }], SAMPLE_SCHEMA, 0.9);
    if (rs.ok && wc(rs.ok.sample) < min * 0.85) {  // model qısa yazdısa, bir dəfə uzun variant istə
      const short = wc(rs.ok.sample);
      const again = await callGemini(key, [{ text: SAMPLE_PROMPT(subj, q, lv, v, gr) + `

IMPORTANT: your previous attempt had only ${short} words, which is far too short (about ${Math.round(short / 2.2)} seconds of speech). Write at least ${min} words: develop every idea with a reason AND a concrete personal example, add more detail and linking sentences.` }], SAMPLE_SCHEMA, 0.9);
      if (again.ok && wc(again.ok.sample) > short) rs = again;
    }
    return rs.ok ? json(200, rs.ok) : json(rs.status, { error: rs.error });
  }

  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BYTES) return json(413, { error: "Səs yazısı çox böyükdür" });
  const body = Buffer.from(await request.arrayBuffer());
  if (!body.length || body.length > MAX_BYTES) return json(413, { error: "Cavab boşdur və ya çox böyükdür" });

  const lvId = url.searchParams.get("lv");
  const level = (subj.levels || []).find((l) => l.id === lvId) || (subj.levels || [])[0];
  const grammar = ((subj.sets || []).find((x) => x.id === url.searchParams.get("st")) || {}).grammar;
  const parts = [{ text: PROMPT(subj, q, kind, level, grammar) }];
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

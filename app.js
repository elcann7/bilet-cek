/* Bilet Çək — universitet kollokvium və imtahan simulyatoru (bütün fənlər).
   Axın: fənn seç → bilet çək → hazırlıq → suallara səsli cavab → Gemini (səs→mətn + qiymət) → nəticə.
   Fənlər subjects.js-dədir (build_subjects.py yaradır). */
(() => {
  "use strict";

  const NEW_HOST = "bilet-cek.vercel.app";
  const OLD_HOSTS = ["adiak-bilet.vercel.app", "biletcek.vercel.app"];
  const $app = document.getElementById("app");
  const BUILTIN = window.SUBJECTS;
  let SUBJECTS = BUILTIN;                                  // + istifadəçinin öz fənləri (brauzerdə saxlanır)
  if (!Array.isArray(BUILTIN) || !BUILTIN.length) {
    $app.innerHTML = `<section class="card" style="max-width:520px;margin:40px auto"><h2>Fənn məlumatı yüklənmədi</h2><p class="muted">Səhifəni yenilə (Ctrl+F5). Problem davam edərsə, bir azdan yenidən cəhd et.</p></section>`;
    return;
  }
  let subjectId = null;                                   // seçilmiş fənn
  const S = () => SUBJECTS.find((x) => x.id === subjectId);
  // fənnin bir neçə sual siyahısı (qrup) ola bilər: XDİAK-da hər qrupun müəllimi öz siyahısını verir
  const curSetId = (sub) => { sub = sub || S(); if (!sub.sets) return null; const v = store.get("set:" + sub.id, null); return sub.sets.some((x) => x.id === v) ? v : sub.sets[0].id; };
  const qsOf = (sub) => { sub = sub || S(); return sub.sets ? sub.questions.filter((q) => q.set === curSetId(sub)) : sub.questions; };
  const byNCache = {};
  const qOf = (n) => (byNCache[subjectId] || (byNCache[subjectId] = Object.fromEntries(S().questions.map((q) => [q.n, q]))))[n];
  const SRC = { vesait: "vəsait", kurs: "böyük kurs", umumi: "ümumi", hesab: "həll", user: "sənin" };
  const SRC_LONG = { vesait: "dərs vəsaitindən", kurs: "böyük kursların cavab faylından", umumi: "ümumi biliyə əsaslanır", hesab: "hesablanmış həll", user: "sənin yüklədiyin materialdan" };

  // ---------- saxlama ----------
  const PREFIX = "biletcek.";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* özəl rejim */ } },
    del(k) { try { localStorage.removeItem(PREFIX + k); } catch { /* */ } },
  };

  // Köhnə ünvandan (adiak-bilet.vercel.app) yeni ünvana keçid: profillər, açar və tarixçə hash ilə daşınır
  // (hash serverə göndərilmir). Açıldıqdan sonra ünvan sətirindən silinir.
  (function migrate() {
    try {
      if (OLD_HOSTS.includes(location.hostname)) {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("adiak.")) data[k] = localStorage.getItem(k); }
        location.replace(`https://${NEW_HOST}/` + (Object.keys(data).length ? "#m=" + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data))))) : ""));
        return;
      }
      const m = /^#m=(.+)$/.exec(location.hash);
      if (m) {
        const data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
        for (const [k, v] of Object.entries(data)) if (k.startsWith("adiak.") && localStorage.getItem(PREFIX + k.slice(6)) == null) localStorage.setItem(PREFIX + k.slice(6), v);
        history.replaceState(null, "", location.pathname);
      }
    } catch { /* köçürmə alınmadısa, istifadəçi sadəcə yenidən başlayır */ }
  })();
  // köhnə (tək fənli) tarixçə ADİAK-a aid olur: "history:<profil>" → "history:<profil>:adiak"
  store.get("profiles", []).forEach((p) => {
    const old = store.get("history:" + p.id, null);
    if (old && store.get("history:" + p.id + ":adiak", null) == null) { store.set("history:" + p.id + ":adiak", old); store.del("history:" + p.id); }
  });
  const DEFAULTS = { key: "", prep: 120, limit: 180, mode: "sections" };
  const settings = () => {
    const s = { ...DEFAULTS, ...store.get("settings", {}) };
    s.limit = Math.min(s.limit, 240); // server limiti: ən çox 4 dəqiqə
    return s;
  };
  // uzun cavab tələb edən fənlərdə (XDİAK) limit fənnin minimumundan az ola bilməz
  const limitFor = (s) => Math.max(s.limit, (S() && S().limit) || 0);
  const saveSettings = (s) => store.set("settings", s);

  // Profillər: eyni cihazda bir neçə nəfər işləsə, nəticələr ada görə ayrı saxlanır
  const profiles = () => store.get("profiles", []);
  const currentProfile = () => store.get("profile", null);
  const profileId = (name) => name.trim().toLocaleLowerCase("az").replace(/\s+/g, " ");
  function useProfile(name) {
    name = name.trim().replace(/\s+/g, " ");
    const id = profileId(name);
    const list = profiles();
    if (!list.some((p) => p.id === id)) {
      list.push({ id, name });
      store.set("profiles", list);
      // köhnə (profilsiz) tarixçə ilk profilə keçir
      const legacy = store.get("history", null);
      if (legacy && list.length === 1) { store.set("history:" + id + ":adiak", legacy); store.del("history"); }
    }
    store.set("profile", id);
    renderWho();
  }
  const profileName = () => (profiles().find((p) => p.id === currentProfile()) || {}).name || "";
  const history = () => store.get("history:" + currentProfile() + ":" + subjectId, []);
  const setHistory = (h) => store.set("history:" + currentProfile() + ":" + subjectId, h);
  // ---------- istifadəçinin öz fənləri (başqa universitet, başqa fənn): yalnız bu brauzerdə saxlanır ----------
  const KINDS = ["theory", "problem", "speaking"];
  const cut = (v, n) => String(v == null ? "" : v).slice(0, n);
  // hər mənbədən (saxlanmış, idxal) gələn fənni təmizləyir: yalnız tanınan sahələr və uzunluq limitləri
  function cleanSubject(x, id) {
    if (!x || !Array.isArray(x.questions)) return null;
    const qs = x.questions.slice(0, 300).map((q, i) => ({
      n: i + 1, q: cut(q && q.q, 1500).trim(), kind: KINDS.includes(q && q.kind) ? q.kind : "theory",
      group: "all", answer: cut(q && q.answer, 4000).trim(),
    })).filter((q) => q.q.length > 3);
    if (!qs.length) return null;
    qs.forEach((q, i) => { q.n = i + 1; q.src = q.answer ? "user" : "umumi"; });
    const main = KINDS.includes(x.kindDefault) ? x.kindDefault : qs[0].kind;
    const per = Math.max(1, Math.min(10, Math.min(Number(x.per) || 3, qs.length)));
    const lv = (BUILTIN.find((b) => b.id === "xdiak") || {}).levels || [];
    const name = cut(x.name, 120).trim() || "Fənn";
    return {
      id, custom: true, name, short: cut(x.short, 14).trim() || name.slice(0, 14), exam: cut(x.exam, 30) || "Kollokvium",
      lang: ["az", "en", "ru", "tr"].includes(x.lang) ? x.lang : "az", answer: x.answer === "text" ? "text" : "voice",
      kindDefault: main, per, max: [10, 20, 30, 50, 100].includes(Number(x.max)) ? Number(x.max) : 20,
      limit: [120, 180, 240].includes(Number(x.limit)) ? Number(x.limit) : 180,
      levels: qs.some((q) => q.kind === "speaking") ? lv : [], ticket: Array(per).fill("all"),
      ticketNote: `Biletdə ${per} sual düşür (${qs.length} sualdan, sənin yüklədiyin siyahıdan).`, questions: qs,
    };
  }
  const loadCustom = () => {
    const list = store.get("custom", []);
    SUBJECTS = BUILTIN.concat((Array.isArray(list) ? list : []).map((x) => (x && typeof x.id === "string" && x.id.startsWith("u_") ? cleanSubject(x, x.id) : null)).filter(Boolean));
  };
  const saveCustom = (list) => { store.set("custom", list); return JSON.stringify(store.get("custom", null)) === JSON.stringify(list); };
  loadCustom();
  const ctxOf = (q) => btoa(unescape(encodeURIComponent(JSON.stringify({ name: S().name, lang: S().lang, kind: q.kind, n: q.n, q: q.q.slice(0, 1500), answer: (q.answer || "").slice(0, 3500) }))));
  const apiExtra = (q) => (S().custom ? { "x-ctx": ctxOf(q) } : undefined);   // öz fənnində sual sorğu ilə gedir

  // fayldan mətn: .txt/.md birbaşa, .docx və .pdf brauzerdə oxunur (kitabxanalar yalnız lazım olanda yüklənir)
  const loadScript = (url) => new Promise((ok, no) => {
    if (document.querySelector(`script[src="${url}"]`)) return ok();
    const el = document.createElement("script"); el.src = url; el.onload = ok; el.onerror = () => no(new Error("Kitabxana yüklənmədi, internetə bax")); document.head.appendChild(el);
  });
  async function extractText(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
      return (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    }
    if (name.endsWith(".pdf")) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const doc = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let out = "";
      for (let p = 1; p <= doc.numPages; p++) {
        const items = (await (await doc.getPage(p)).getTextContent()).items;
        let y = null;
        for (const it of items) {
          const ny = it.transform[5];
          out += (y !== null && Math.abs(ny - y) > 2 ? "\n" : y !== null ? " " : "") + it.str; y = ny;
        }
        out += "\n\n";
      }
      return out;
    }
    if (/\.(txt|md|csv)$/.test(name) || file.type.startsWith("text/")) return file.text();
    throw new Error("Bu format dəstəklənmir. .pdf, .docx, .txt və ya mətni yapışdır.");
  }

  // XDİAK kimi fənlərdə qruplar fərqli səviyyədə oxuyur: səviyyə fənnə görə saxlanır
  const fixedLevelId = () => { const sub = S(); const st = sub.sets && sub.sets.find((x) => x.id === curSetId(sub)); return st && st.level ? st.level : null; };   // qrupun səviyyəsi sabitdirsə
  const levelOf = () => { const lv = (S().levels || []); return lv.length ? (lv.find((l) => l.id === (fixedLevelId() || store.get("level:" + subjectId, null))) || lv[0]) : null; };
  const historyCount = (pid) => SUBJECTS.reduce((a, x) => a + store.get("history:" + pid + ":" + x.id, []).length, 0);

  // ---------- köməkçilər ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  // etalon cavabın göstərilməsi: səhifə şəkilləri varsa (fizikada düsturlar), onlar; yoxsa mətn
  const refBody = (q) => !q.answer && !(q.images && q.images.length)
    ? `<div class="ref"><p class="muted small">Bu sual üçün etalon cavab yüklənməyib: qiymətləndirmə süni intellektin öz fənn biliyinə əsaslanır. Redaktədə etalon cavab əlavə edə bilərsən.</p></div>`
    : q.images && q.images.length
    ? `<div class="ref shots">${q.images.map((u) => `<img src="${u}" alt="Etalon cavab səhifəsi" loading="lazy">`).join("")}</div>`
    : `<div class="ref">${md(q.answer)}</div>`;
  // XDİAK: səviyyəyə uyğun nümunə cavab. İstifadəçi başqa nümunə də yarada bilər (Gemini ilə).
  const samples = {};                                   // "fənn:sual:səviyyə" → [{sample, phrases}]
  const sampleKey = (q) => `${subjectId}:${q.n}:${levelOf() ? levelOf().id : ""}`;
  const sampleHtml = (q) => {
    const list = samples[sampleKey(q)] || [];
    const cur = list[list.length - 1];
    const official = q.ref ? `<div class="ref official"><h4 style="margin:0 0 6px">Müəllimin faylındakı oxşar mətn: ${esc(q.refTitle || "")}</h4>${md(q.ref)}</div>` : "";
    return official + (cur
      ? `<div class="ref">${md(cur.sample)}${cur.phrases && cur.phrases.length ? `<h4 style="margin:14px 0 6px">Faydalı ifadələr</h4><ul>${cur.phrases.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<p class="muted small" style="margin:10px 0 0">Nümunə ${list.length} · ${esc(levelOf() ? levelOf().label : "")}. Əzbərləmə, strukturu və ifadələri götür.</p></div>`
      : `<p class="muted small" style="margin:${q.ref ? "10px 0 0" : "0"}">${q.ref ? "İstəsən, süni intellekt bu mövzuda səviyyənə uyğun başqa nümunə də yaza bilər." : "Hələ nümunə yoxdur. Düyməyə bas, süni intellekt səviyyənə uyğun nümunə cavab yazsın"} (${esc(levelOf() ? levelOf().label : "")}).</p>`);
  };
  const sampleBlock = (q) => `
    <details class="sample" data-n="${q.n}"><summary>Nümunə cavab (səviyyənə görə)</summary>
      <div class="sample-body">${sampleHtml(q)}</div>
      <div class="row" style="margin-top:12px"><button class="btn ghost" data-sample="${q.n}">${(samples[sampleKey(q)] || []).length ? "Başqa nümunə yarat" : "Nümunə cavab yarat"}</button></div>
    </details>`;
  function bindSamples(root) {
    root.querySelectorAll("[data-sample]").forEach((btn) => {
      btn.onclick = async () => {
        if (needKey()) { toast("Nümunə üçün əvvəlcə Gemini açarı əlavə et (Ayarlar)."); return; }
        const q = qOf(Number(btn.dataset.sample));
        const k = sampleKey(q), list = samples[k] || (samples[k] = []);
        const old = btn.textContent; btn.disabled = true; btn.textContent = "Yazılır…";
        try {
          const r = await api(`s=${subjectId}&n=${q.n}&kind=sample&lv=${levelOf() ? levelOf().id : ""}&st=${curSetId() || ""}&v=${list.length + 1}`, "", "text/plain", settings(), apiExtra(q));
          list.push(r);
          btn.closest(".sample").querySelector(".sample-body").innerHTML = sampleHtml(q);
          btn.textContent = "Başqa nümunə yarat";
        } catch (e) { toast("Xəta: " + e.message); btn.textContent = old; }
        finally { btn.disabled = false; }
      };
    });
  }
  const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const scoreColor = (s) => (s >= 8 ? "var(--green)" : s >= 5 ? "var(--amber)" : "var(--red)");
  const toast = (msg) => {
    document.querySelectorAll(".toast").forEach((x) => x.remove());
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  };

  // Kollokvium cəmi 20 baldır (fənn üzrə dəyişə bilər: subject.max). Hər sual 0–10 keyfiyyətlə qiymətləndirilir,
  // biletin balı keyfiyyətin ortalamasının 20-yə çevrilməsidir; hər sualın payı max / sual sayıdır.
  const maxOf = () => (S() && S().max) || 20;
  const pts = (q10) => (q10 / 10) * maxOf();                      // 0–10 keyfiyyət → kollokvium balı
  const one = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
  const answeredOf = (r) => r.items.filter((i) => !i.skipped);   // "etalona bax" seçilənlər balda sayılmır
  const examScore = (r) => { const a = answeredOf(r); return a.length ? r.total / a.length : 0; };   // 0–10 (dəqiq)
  const share = (score, count) => score / count;                // sualın 10 baldakı payı

  // ---------- naviqasiya ----------
  let exam = null;         // aktiv imtahan
  let cleanup = [];        // ekran dəyişəndə dayandırılacaq taymerlər və s.
  function go(view, ...args) {
    cleanup.forEach((f) => { try { f(); } catch { /* */ } });
    cleanup = [];
    window.scrollTo({ top: 0 });
    if (!currentProfile() && view !== "who") { VIEWS.who(view); return; }
    if (!subjectId && !["who", "key", "subjects", "settings", "create"].includes(view)) view = "subjects";
    renderTop();
    VIEWS[view](...args);
  }
  const $subj = document.getElementById("subj");
  function renderTop() {
    const sub = subjectId && S();
    $subj.hidden = !sub;
    $subj.textContent = sub ? `Fənn: ${sub.short}` : "";
  }
  const $who = document.getElementById("who");
  function renderWho() {
    const n = profileName();
    $who.hidden = !n;
    $who.textContent = n ? `${n} · dəyiş` : "";
  }
  $subj.addEventListener("click", () => {
    const inExam = exam && !exam.finished && exam.answers.some(Boolean);
    if (inExam && !confirm("Bilet yarımçıq qalacaq. Çıxmaq istəyirsən?")) return;
    exam = null;
    go("subjects");
  });
  $who.addEventListener("click", () => {
    const inExam = exam && !exam.finished && exam.answers.some(Boolean);
    if (inExam && !confirm("Bilet yarımçıq qalacaq. Çıxmaq istəyirsən?")) return;
    exam = null;
    go("who", "home");
  });
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
    const inExam = exam && !exam.finished && exam.answers.some(Boolean);
    if (inExam && !confirm("Bilet yarımçıq qalacaq. Çıxmaq istəyirsən?")) return;
    if (inExam) exam = null;
    go(b.dataset.go);
  }));

  // ---------- ekranlar ----------
  const VIEWS = {
    key(after = "home") {
      const s = settings();
      $app.innerHTML = `
        <section class="fade-in stack" style="max-width:640px;margin:0 auto">
          <div>
            <h2>Pulsuz API açarı al</h2>
            <p class="muted" style="margin:0">Cavablarını süni intellekt qiymətləndirir. Bunun üçün Google-un pulsuz Gemini açarı lazımdır. Açarı almaq 1 dəqiqə çəkir, kart tələb olunmur.</p>
          </div>
          <div class="card">
            <ol class="steps" style="margin:0">
              <li>Aşağıdakı düymə ilə <b>Google AI Studio</b>-nu aç.</li>
              <li>Gmail hesabınla daxil ol. İlk dəfədirsə, şərtləri qəbul et.</li>
              <li><b>Create API key</b> düyməsinə bas. Layihə soruşsa, olanı seç və ya yenisini yarat.</li>
              <li>Yaranan açarı kopyala. Açar uzun bir sətirdir, məsələn <code>AQ.Ab8…</code> və ya <code>AIza…</code> ilə başlayır. Kopyalama ikonuna basmaq ən rahat yoldur.</li>
              <li>Bura qayıt, açarı aşağıya yapışdır və <b>Yadda saxla</b> düyməsinə bas.</li>
            </ol>
            <a class="btn accent" style="margin-top:18px;width:100%;text-decoration:none" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio-nu aç ↗</a>
          </div>
          <div class="card stack">
            <label class="field"><span>Açarın</span>
              <div class="row" style="flex-wrap:nowrap">
                <input type="password" id="k" value="${esc(s.key)}" placeholder="AQ.… və ya AIza…" autocomplete="off" spellcheck="false">
                <button class="btn ghost" id="paste" type="button">Yapışdır</button>
              </div>
            </label>
            <button class="btn" id="save-key">Yadda saxla və yoxla</button>
            <p class="muted small" style="margin:0">Açar yalnız bu brauzerdə saxlanır və yalnız qiymətləndirmə üçün istifadə olunur. Onu heç kimə göndərmə. Pulsuz limit gündə yüzlərlə cavab üçün kifayətdir.</p>
          </div>
        </section>`;
      const input = $app.querySelector("#k");
      $app.querySelector("#paste").onclick = async () => {
        try { input.value = cleanKey(await navigator.clipboard.readText()); }
        catch { toast("Avtomatik yapışdırmaq olmadı. Xanaya basıb əl ilə yapışdır."); input.focus(); }
      };
      $app.querySelector("#save-key").onclick = async (e) => {
        const k = cleanKey(input.value);
        // Google açarları iki formatda olur: köhnə "AIza…" və yeni "AQ.…". Formatı server yoxlayır.
        if (k.length < 30) { toast("Açar çox qısadır. Tam kopyaladığına əmin ol."); return; }
        saveSettings({ ...settings(), key: k });
        const b = e.currentTarget; b.disabled = true; b.textContent = "Yoxlanılır…";
        try {
          await api("ping=1", "", "text/plain", settings());
          toast("Açar işləyir");
          go(after);
        } catch (err) {
          toast("Xəta: " + err.message);
          b.disabled = false; b.textContent = "Yadda saxla və yoxla";
        }
      };
    },

    who(after = "home") {
      const list = profiles();
      $app.innerHTML = `
        <section class="card fade-in stack" style="max-width:520px;margin:0 auto">
          <h2>Kimsən?</h2>
          <p class="muted" style="margin:0">Nəticələrin adına görə ayrıca saxlanır. Eyni telefondan bir neçə nəfər istifadə etsə də, qiymətlər qarışmır.</p>
          ${list.length ? `
            <div class="stack" style="margin-top:12px">
              ${list.map((p) => `
                <div class="row" style="flex-wrap:nowrap">
                  <button class="btn ghost" style="flex:1;justify-content:flex-start" data-pick="${esc(p.id)}">${esc(p.name)}
                    <span class="muted small" style="margin-left:auto">${historyCount(p.id)} bilet</span></button>
                  <button class="btn ghost" data-del="${esc(p.id)}" aria-label="Sil" title="Profili sil">✕</button>
                </div>`).join("")}
            </div>
            <p class="muted small" style="margin:8px 0 0">və ya yeni ad:</p>` : ""}
          <label class="field"><span>${list.length ? "Yeni profil" : "Adın və soyadın"}</span>
            <input type="text" id="name" placeholder="məs. Elcan Səfərli" maxlength="40" autocomplete="name"></label>
          <button class="btn accent" id="enter">Davam et</button>
        </section>`;
      const input = $app.querySelector("#name");
      const enter = () => {
        const v = input.value.trim();
        if (v.length < 2) { toast("Adını yaz"); input.focus(); return; }
        useProfile(v); go(after);
      };
      $app.querySelector("#enter").onclick = enter;
      input.onkeydown = (e) => { if (e.key === "Enter") enter(); };
      $app.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => { store.set("profile", b.dataset.pick); renderWho(); go(after); });
      $app.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
        const p = list.find((x) => x.id === b.dataset.del);
        if (!confirm(`"${p.name}" profili və bütün nəticələri silinsin?`)) return;
        store.set("profiles", list.filter((x) => x.id !== p.id));
        SUBJECTS.forEach((x) => store.del("history:" + p.id + ":" + x.id));
        if (currentProfile() === p.id) { store.del("profile"); renderWho(); }
        VIEWS.who(after);
      });
      if (!list.length) input.focus();
    },

    subjects() {
      const first = esc(profileName().split(" ")[0]);
      const card = (x) => {
        const h = store.get("history:" + currentProfile() + ":" + x.id, []);
        const best = h.length ? one((Math.max(...h.map(examScore)) / 10) * (x.max || 20)) : null;
        const inner = `
          <span class="subject-tag">${esc(x.short)}</span>
          <b class="subject-name">${esc(x.name)}</b>
          <span class="muted small">${qsOf(x).length} sual · ${esc(x.exam)}</span>
          <span class="subject-foot small">${h.length ? `${h.length} bilet · ən yaxşı ${best}/${x.max || 20}` : "Hələ bilet çəkməmisən"}</span>`;
        return x.custom
          ? `<div class="subject card custom"><button class="subject-open" data-sub="${x.id}">${inner}</button>
               <div class="row small subject-actions"><span class="tag">sənin fənnin</span><button class="link" data-cedit="${x.id}">Redaktə</button><button class="link" data-cexp="${x.id}">Paylaş</button><button class="link" data-cdel="${x.id}">Sil</button></div></div>`
          : `<button class="subject card" data-sub="${x.id}">${inner}</button>`;
      };
      $app.innerHTML = `
        <section class="fade-in">
          <h1 style="margin-bottom:6px">${first ? first + ", hansı" : "Hansı"} fənndən bilet çəkirsən?</h1>
          <p class="muted" style="margin:0 0 22px">Fənni seç. Hazır fənlərin suallar kafedranın siyahısından, etalon cavablar dərs materiallarındandır. Başqa universitetdənsən? Öz fənnini və suallarını özün yarada bilərsən.</p>
          <div class="subjects">
            ${SUBJECTS.map(card).join("")}
            <div class="subject card create">
              <button class="subject-open" data-new>
                <span class="subject-tag">+</span>
                <b class="subject-name">Öz sınağını yarat</b>
                <span class="muted small">Sual siyahını (PDF, Word, mətn) yüklə və ya yapışdır. Öz biletin, öz qiymətin.</span>
              </button>
              <div class="row small subject-actions"><label class="link" style="cursor:pointer">Dostun fənnini yüklə (.json)<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
            </div>
          </div>
        </section>`;
      $app.querySelectorAll("[data-sub]").forEach((b) => b.onclick = () => { subjectId = b.dataset.sub; store.set("subject", subjectId); go("home"); });
      $app.querySelector("[data-new]").onclick = () => go("create");
      $app.querySelectorAll("[data-cedit]").forEach((b) => b.onclick = () => go("create", b.dataset.cedit));
      $app.querySelectorAll("[data-cexp]").forEach((b) => b.onclick = () => {
        const x = SUBJECTS.find((y) => y.id === b.dataset.cexp);
        const data = { format: "biletcek-subject", v: 1, subject: { name: x.name, short: x.short, exam: x.exam, lang: x.lang, answer: x.answer, kindDefault: x.kindDefault, per: x.per, max: x.max, limit: x.limit, questions: x.questions.map((q) => ({ q: q.q, kind: q.kind, answer: q.answer })) } };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
        a.download = `${x.short.replace(/[^\w\u0080-\uffff-]+/g, "_")}.biletcek.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast("Fayl yükləndi. Dostuna göndər: o, 'Dostun fənnini yüklə' ilə açacaq.");
      });
      $app.querySelectorAll("[data-cdel]").forEach((b) => b.onclick = () => {
        const x = SUBJECTS.find((y) => y.id === b.dataset.cdel);
        if (!confirm(`"${x.name}" fənni və bütün nəticələri silinsin?`)) return;
        saveCustom(store.get("custom", []).filter((y) => y.id !== x.id));
        profiles().forEach((p) => store.del("history:" + p.id + ":" + x.id));
        delete byNCache[x.id];
        if (subjectId === x.id) { subjectId = null; store.del("subject"); }
        loadCustom(); VIEWS.subjects();
      });
      $app.querySelector("#imp").onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const obj = JSON.parse(await f.text());
          const sub = cleanSubject(obj && obj.subject, "u_" + Math.random().toString(36).slice(2, 9));
          if (!sub) throw new Error("fayl düzgün deyil");
          if (!saveCustom(store.get("custom", []).concat([sub]))) throw new Error("brauzer yaddaşı dolub");
          loadCustom(); toast(`"${sub.name}" əlavə olundu`); VIEWS.subjects();
        } catch (err) { toast("Yüklənmədi: " + err.message); }
      };
    },

    create(editId) {
      const ex = editId && SUBJECTS.find((x) => x.id === editId && x.custom);
      const d = ex
        ? { id: ex.id, name: ex.name, short: ex.short, exam: ex.exam, lang: ex.lang, answer: ex.answer, kindDefault: ex.kindDefault, per: ex.per, max: ex.max, limit: ex.limit, questions: ex.questions.map((q) => ({ q: q.q, kind: q.kind, answer: q.answer })) }
        : { id: "u_" + Math.random().toString(36).slice(2, 9), name: "", short: "", exam: "Kollokvium", lang: "az", answer: "voice", kindDefault: "theory", per: 3, max: 20, limit: 180, questions: [] };
      const opts = (list, cur) => list.map(([v, t]) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("");
      $app.innerHTML = `
        <section class="fade-in stack" style="max-width:820px;margin:0 auto">
          <div>
            <h2>${ex ? "Fənni redaktə et" : "Öz sınağını yarat"}</h2>
            <p class="muted" style="margin:0">Başqa universitetdən, başqa fəndənsən? Sualları yüklə və ya yapışdır, sonra öz biletini çək. Hər şey yalnız bu brauzerdə saxlanır.</p>
          </div>
          <div class="card stack">
            <h3 style="margin:0">1. Fənn haqqında</h3>
            <div class="grid2">
              <label class="field"><span>Fənnin adı</span><input type="text" id="c-name" maxlength="120" value="${esc(d.name)}" placeholder="məs. Mikroiqtisadiyyat"></label>
              <label class="field"><span>Qısa ad (kartda)</span><input type="text" id="c-short" maxlength="14" value="${esc(d.short)}" placeholder="məs. Mikro"></label>
              <label class="field"><span>İmtahan növü</span><select id="c-exam">${opts([["Kollokvium", "Kollokvium"], ["İmtahan", "İmtahan"], ["Sınaq", "Sınaq"]], d.exam)}</select></label>
              <label class="field"><span>Cavab dili</span><select id="c-lang">${opts([["az", "Azərbaycan"], ["en", "English"], ["ru", "Русский"], ["tr", "Türkçe"]], d.lang)}</select></label>
              <label class="field"><span>Sualların növü</span><select id="c-kind">${opts([["theory", "Nəzəri suallar"], ["problem", "Məsələlər (hesablama)"], ["speaking", "Speaking (ingilis dilində danışıq)"]], d.kindDefault)}</select></label>
              <label class="field"><span>Cavab forması</span><select id="c-answer">${opts([["voice", "Səslə (yazılı da olar)"], ["text", "Yazılı (səslə də olar)"]], d.answer)}</select></label>
              <label class="field"><span>Biletdə neçə sual</span><select id="c-per">${opts([1, 2, 3, 4, 5, 6, 8, 10].map((n) => [n, n]), d.per)}</select></label>
              <label class="field"><span>Maksimum bal</span><select id="c-max">${opts([10, 20, 30, 50, 100].map((n) => [n, n]), d.max)}</select></label>
              <label class="field"><span>Danışma limiti (suala)</span><select id="c-limit">${opts([[120, "2 dəqiqə"], [180, "3 dəqiqə"], [240, "4 dəqiqə"]], d.limit)}</select></label>
            </div>
          </div>
          <div class="card stack">
            <h3 style="margin:0">2. Suallar</h3>
            <p class="muted small" style="margin:0">Sual siyahını (PDF, Word, .txt) yüklə və ya mətni yapışdır. Fayl brauzerdə oxunur. Yalnız aşağıdakı "tap/yarat" düymələrinə basanda mətn sənin Gemini açarınla süni intellektə göndərilir. Etalon cavab məcburi deyil: olmasa, süni intellekt öz biliyinə görə yoxlayır.</p>
            <div class="row"><label class="btn ghost" style="cursor:pointer">Fayl seç (PDF, DOCX, TXT)<input type="file" id="c-file" accept=".pdf,.docx,.txt,.md,text/plain" hidden></label><span class="muted small" id="c-fname"></span></div>
            <textarea id="c-src" rows="7" placeholder="…və ya sual siyahısını / dərs materialını bura yapışdır">${esc(d.source || "")}</textarea>
            <label class="field"><span>İstəyə bağlı qeyd (süni intellektə kömək edir)</span><input type="text" id="c-hint" maxlength="300" placeholder="məs. 'bu, 2-ci kollokviumun suallarıdır, sonda cavablar da var'"></label>
            <div class="row">
              <button class="btn" id="c-extract">Sualları tap</button>
              <button class="btn ghost" id="c-lines">Hər sətir bir sual</button>
              <span class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn ghost" id="c-gen">Materialdan sual yarat</button><select id="c-count" style="width:auto">${opts([10, 15, 20, 30].map((n) => [n, n + " sual"]), 15)}</select></span>
            </div>
            <p class="small" id="c-status" style="margin:0"></p>
          </div>
          <div class="card stack">
            <div class="row" style="justify-content:space-between"><h3 style="margin:0">3. Siyahı <span class="muted small" id="c-count-label"></span></h3>
              <div class="row"><button class="btn ghost" id="c-add">+ Sual əlavə et</button><button class="btn ghost" id="c-mkans">Etalon cavabları materialdan yarat</button></div></div>
            <div id="c-list"></div>
          </div>
          <div class="row"><button class="btn accent" id="c-save">Yadda saxla</button><button class="btn ghost" id="c-cancel">Ləğv et</button></div>
        </section>`;
      const $ = (id) => $app.querySelector("#" + id);
      const ql = $("c-list"), st = $("c-status"), ta = $("c-src");
      const status = (m, bad) => { st.textContent = m; st.style.color = bad ? "var(--red)" : ""; st.className = "small" + (bad ? "" : " muted"); };
      const renderList = () => {
        $("c-count-label").textContent = d.questions.length ? `(${d.questions.length})` : "";
        ql.innerHTML = d.questions.length ? d.questions.map((x, i) => `
          <div class="qedit" data-i="${i}">
            <div class="row" style="justify-content:space-between"><b style="font-family:var(--serif);color:var(--accent)">${i + 1}.</b><button class="link" data-rm="${i}">Sil</button></div>
            <textarea data-f="q" rows="2" placeholder="Sual">${esc(x.q)}</textarea>
            <details ${x.answer ? "open" : ""}><summary class="small">Etalon cavab ${x.answer ? "" : "(yoxdur, istəyə bağlıdır)"}</summary><textarea data-f="answer" rows="4" placeholder="Etalon cavab (boş qala bilər)">${esc(x.answer)}</textarea></details>
          </div>`).join("") : `<p class="muted small" style="margin:0">Hələ sual yoxdur. Yuxarıdan əlavə et.</p>`;
      };
      ql.addEventListener("input", (e) => { const row = e.target.closest(".qedit"); if (row && e.target.dataset.f) d.questions[+row.dataset.i][e.target.dataset.f] = e.target.value; });
      ql.addEventListener("click", (e) => { const rm = e.target.closest("[data-rm]"); if (rm) { d.questions.splice(+rm.dataset.rm, 1); renderList(); } });
      const kindNow = () => $("c-kind").value;
      const addQuestions = (list) => {
        const room = 300 - d.questions.length;
        list.slice(0, room).forEach((x) => d.questions.push({ q: x.q, answer: x.answer || "", kind: KINDS.includes(x.kind) ? x.kind : kindNow() }));
        renderList();
      };
      const busy = (btn, label, fn) => async () => {
        if (btn.disabled) return;
        const old = btn.textContent; btn.disabled = true; btn.textContent = label;
        try { await fn(); } catch (err) { status("Xəta: " + (err.message || err), true); } finally { btn.disabled = false; btn.textContent = old; }
      };
      const needAI = () => { if (needKey()) { toast("Bu funksiya üçün Gemini açarı lazımdır (Ayarlar)."); throw new Error("Gemini açarı əlavə et (Ayarlar → açar)."); } };

      $("c-file").onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        $("c-fname").textContent = f.name; status("Fayl oxunur…");
        try {
          const t = (await extractText(f)).replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
          if (t.length < 20) throw new Error("Faylda mətn tapılmadı (skan olunmuş PDF ola bilər). Mətni əl ilə yapışdır.");
          ta.value = t.slice(0, 60000);
          status(`${t.length.toLocaleString("az")} simvol oxundu${t.length > 60000 ? " (ilk 60 000 simvol götürüldü)" : ""}. İndi "Sualları tap" bas.`);
        } catch (err) { status("Xəta: " + err.message, true); }
      };
      $("c-extract").onclick = busy($("c-extract"), "Tapılır…", async () => {
        needAI();
        if (ta.value.trim().length < 20) throw new Error("Əvvəlcə fayl yüklə və ya mətn yapışdır.");
        const r = await api("kind=parse", JSON.stringify({ text: ta.value, mode: "extract", hint: $("c-hint").value }), "text/plain", settings());
        if (!r.questions.length) throw new Error("Sual tapılmadı. 'Hər sətir bir sual' ilə cəhd et.");
        addQuestions(r.questions);
        status(`${r.questions.length} sual tapıldı${r.questions.some((x) => x.answer) ? " (bəzilərinin cavabı da fayldan götürüldü)" : ""}. Aşağıda yoxla, lazım olmayanı sil.`);
      });
      $("c-gen").onclick = busy($("c-gen"), "Yazılır…", async () => {
        needAI();
        if (ta.value.trim().length < 100) throw new Error("Material çox qısadır: dərs mətnini yapışdır.");
        const r = await api("kind=parse", JSON.stringify({ text: ta.value, mode: "generate", count: Number($("c-count").value), hint: $("c-hint").value }), "text/plain", settings());
        addQuestions(r.questions);
        status(`${r.questions.length} sual və etalon cavab yaradıldı (materialdan). Yoxla və lazım olduqda düzəlt.`);
      });
      $("c-lines").onclick = () => {
        const lines = ta.value.split("\n").map((l) => l.replace(/^\s*(\d+\s*[.)]|[-•*])\s*/, "").trim()).filter((l) => l.length > 8);
        if (!lines.length) { status("Mətn boşdur.", true); return; }
        addQuestions(lines.map((q) => ({ q, answer: "" })));
        status(`${lines.length} sual əlavə edildi (hər sətir bir sual).`);
      };
      $("c-add").onclick = () => { d.questions.push({ q: "", answer: "", kind: kindNow() }); renderList(); ql.querySelector(".qedit:last-child textarea").focus(); };
      $("c-mkans").onclick = busy($("c-mkans"), "Yazılır…", async () => {
        needAI();
        if (ta.value.trim().length < 30) throw new Error("Etalon cavab üçün material lazımdır: dərs mətnini yuxarıdakı xanaya yapışdır.");
        const todo = d.questions.map((x, i) => ({ i: i + 1, q: x.q, has: !!x.answer })).filter((x) => !x.has && x.q.trim().length > 3);
        if (!todo.length) throw new Error("Bütün suallarda artıq cavab var.");
        let done = 0;
        for (let k = 0; k < todo.length; k += 8) {
          const batch = todo.slice(k, k + 8);
          status(`Etalon cavablar yazılır… ${done}/${todo.length}`);
          const r = await api("kind=answers", JSON.stringify({ material: ta.value, items: batch.map((x) => ({ i: x.i, q: x.q })) }), "text/plain", settings());
          r.answers.forEach((a) => { if (d.questions[a.i - 1] && !d.questions[a.i - 1].answer) { d.questions[a.i - 1].answer = a.answer; done++; } });
          renderList();
        }
        status(`${done} sual üçün etalon cavab yazıldı (materialdan). "(Materialda yoxdur)" yazılanlara diqqət et.`);
      });
      $("c-cancel").onclick = () => go("subjects");
      $("c-save").onclick = () => {
        const name = $("c-name").value.trim();
        if (name.length < 2) { toast("Fənnin adını yaz"); $("c-name").focus(); return; }
        const qs = d.questions.filter((x) => x.q.trim().length > 3);
        if (!qs.length) { toast("Ən az bir sual əlavə et"); return; }
        const sub = cleanSubject({
          name, short: $("c-short").value.trim() || name, exam: $("c-exam").value, lang: $("c-lang").value, answer: $("c-answer").value,
          kindDefault: kindNow(), per: Number($("c-per").value), max: Number($("c-max").value), limit: Number($("c-limit").value), questions: qs,
        }, d.id);
        const list = store.get("custom", []).filter((x) => x.id !== d.id).concat([sub]);
        if (!saveCustom(list)) { toast("Brauzer yaddaşı doludur: bəzi fənləri sil və ya cavabları qısalt."); return; }
        delete byNCache[d.id];
        loadCustom();
        subjectId = d.id; store.set("subject", subjectId);
        toast(`"${sub.name}" saxlandı: ${sub.questions.length} sual`);
        go("home");
      };
      renderList();
    },

    home() {
      const sub = S(), N = qsOf(sub).length;
      const h = history();
      const best = h.length ? one(pts(Math.max(...h.map(examScore)))) : null;
      const avg = h.length ? one(pts(h.reduce((a, x) => a + examScore(x), 0) / h.length)) : null;
      const covered = new Set(h.flatMap((x) => x.items.map((i) => i.n))).size;
      const s = settings();
      $app.innerHTML = `
        <section class="hero fade-in">
          <div>
            <p class="muted small">${esc(sub.name)}</p>
            <h1>${esc(profileName().split(" ")[0])}, biletini çək və şifahi cavab ver.</h1>
            <ol class="steps">
              <li>Bilet çəkirsən. ${esc(sub.ticketNote)}</li>
              <li>${s.prep ? `${mmss(s.prep)} dəqiqə hazırlaşırsan.` : "Hazırlıq olmadan birbaşa başlayırsan."}</li>
              <li>${sub.answer === "text" ? "Hər suala yazılı cavab verirsən. İstəsən, səslə də cavab verə bilərsən." : `Hər suala ayrıca danışırsan (ən çox ${mmss(limitFor(s))}). İstəsən, yazılı da cavab verə bilərsən.`}</li>
              <li>${sub.questions.some((q) => q.kind === "speaking") ? "Süni intellekt nitqini mətnə çevirir, ingilis dili meyarları ilə yoxlayır və ${maxOf()} ballıq bal verir." : "Süni intellekt səsini mətnə çevirir, etalon cavabla müqayisə edir və ${maxOf()} ballıq kollokvium balı verir."}</li>
            </ol>
            ${sub.sets ? `
              <label class="field" style="max-width:420px;margin:0 0 14px"><span>Qrupun sual siyahısı</span>
                <select id="setsel">${sub.sets.map((x) => `<option value="${x.id}" ${curSetId(sub) === x.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
                <small>Müəllimin verdiyi siyahını seç. Suallar və səviyyə ona görə dəyişir.</small>
              </label>` : ""}
            ${(sub.levels || []).length && !fixedLevelId() ? `
              <label class="field" style="max-width:360px;margin:0 0 18px"><span>Qrupunun səviyyəsi</span>
                <select id="level">${sub.levels.map((l) => `<option value="${l.id}" ${levelOf().id === l.id ? "selected" : ""}>${esc(l.label)}</option>`).join("")}</select>
                <small>Cavabın bu səviyyəyə görə qiymətləndirilir: səviyyəndən yuxarı söz və qrammatika tələb olunmur, amma leksik və qrammatik səhvlər sayılır.</small>
              </label>` : ""}
            ${(() => { const st = sub.sets && sub.sets.find((x) => x.id === curSetId(sub)); return st && st.grammar && st.grammar.length ? `<details style="margin:0 0 18px"><summary class="small">Qrammatika mövzuları (${st.grammar.length}): cavabında bunlar yoxlanır</summary><ul class="small" style="margin:8px 0 0">${st.grammar.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></details>` : ""; })()}
            ${(() => { const st = sub.sets && sub.sets.find((x) => x.id === curSetId(sub)); return st && st.texts && st.texts.length ? `<details style="margin:0 0 18px"><summary class="small">Müəllimin nümunə mətnləri (${st.texts.length}): necə danışmaq lazımdır</summary><div style="margin-top:8px">${st.texts.map((t) => `<details class="bank-item"><summary><span class="qn" style="font-family:var(--serif);font-weight:700;color:var(--accent)">${t.n}.</span><span>${esc(t.title)}</span><span class="tag">${t.text.split(/\s+/).length} söz</span></summary><div class="ref">${md(t.text)}</div></details>`).join("")}</div></details>` : ""; })()}
            <div class="row">
              <button class="btn accent" id="start">Bilet çək</button>
              <button class="btn ghost" data-v="bank">Bütün suallar</button>
            </div>
            ${needKey() ? `<p class="notice" style="margin-top:20px">Qiymət almaq üçün pulsuz Gemini açarı lazımdır (1 dəqiqə). <a href="#" data-v="key">Açarı necə alım?</a></p>` : ""}
          </div>
          <div class="card">
            <h3>Nəticələrin</h3>
            <div class="stats">
              <div class="stat"><span>Bilet</span><b>${h.length}</b></div>
              <div class="stat"><span>Orta</span><b>${avg ?? "—"}</b></div>
              <div class="stat"><span>Ən yaxşı</span><b>${best ?? "—"}</b></div>
            </div>
            <p class="muted small" style="margin:14px 0 6px">Cavablandırdığın suallar: ${covered} / ${N}</p>
            <div class="progress"><div style="width:${(covered / N) * 100}%"></div></div>
            ${h.length ? `<button class="btn ghost" style="margin-top:16px;width:100%" data-v="history">Tarixçəyə bax</button>` : ""}
          </div>
        </section>`;
      $app.querySelector("#start").onclick = () => go("draw");
      const setSel = $app.querySelector("#setsel");
      if (setSel) setSel.onchange = () => { store.set("set:" + subjectId, setSel.value); go("home"); };
      const lvSel = $app.querySelector("#level");
      if (lvSel) lvSel.onchange = () => store.set("level:" + subjectId, lvSel.value);
      $app.querySelectorAll("[data-v]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); go(el.dataset.v); }));
    },

    draw() {
      const s = settings();
      const pool = shuffle(Array.from({ length: Math.max(qsOf().length, 10) }, (_, i) => i + 1)).slice(0, 10);
      $app.innerHTML = `
        <section class="fade-in">
          <h2>Bileti seç</h2>
          <p class="muted">Masada 10 bilet var. Birini götür.</p>
          <div class="deck" id="deck">
            ${pool.map((no, i) => `
              <button class="ticket" data-no="${no}" style="animation-delay:${i * 45}ms;--r:${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg" aria-label="Bilet">
                <span class="inner">
                  <span class="face back"><i>BİLET</i></span>
                  <span class="face front"><span><small>Bilet</small><b>№ ${no}</b></span></span>
                </span>
              </button>`).join("")}
          </div>
        </section>`;
      const deck = $app.querySelector("#deck");
      deck.querySelectorAll(".ticket").forEach((t) => t.addEventListener("click", () => {
        if (deck.classList.contains("done")) return;
        deck.classList.add("done");
        t.classList.add("picked");
        exam = newExam(Number(t.dataset.no), pickQuestions(s.mode));
        const id = setTimeout(() => go("prep"), 1500);
        cleanup.push(() => clearTimeout(id));
      }));
    },

    prep() {
      const s = settings();
      $app.innerHTML = `
        <section class="fade-in stack">
          ${paper(0, true)}
          <div class="card row" style="justify-content:space-between">
            <div>
              <p class="muted small" style="margin:0">${s.prep ? "Hazırlıq vaxtı" : "Hazırlıq vaxtı söndürülüb"}</p>
              ${s.prep ? `<div class="clock" id="clock">${mmss(s.prep)}</div>` : ""}
            </div>
            <button class="btn accent" id="ready">Hazıram, cavab verməyə başla</button>
          </div>
          ${s.prep ? `<div class="progress"><div id="bar"></div></div>` : ""}
        </section>`;
      $app.querySelector("#ready").onclick = () => go("answer", 0);
      if (!s.prep) return;
      const end = Date.now() + s.prep * 1000;
      const clock = $app.querySelector("#clock"), bar = $app.querySelector("#bar");
      const id = setInterval(() => {
        const left = (end - Date.now()) / 1000;
        clock.textContent = mmss(left);
        clock.classList.toggle("warn", left <= 15);
        bar.style.width = `${100 - (left / s.prep) * 100}%`;
        if (left <= 0) { clearInterval(id); toast("Hazırlıq vaxtı bitdi"); go("answer", 0); }
      }, 250);
      cleanup.push(() => clearInterval(id));
    },

    answer(i) {
      const s = settings();
      const q = qOf(exam.qs[i]);
      const last = i === exam.qs.length - 1;
      const hint = { problem: "Məsələni addım-addım həll et: düsturu, əvəzləməni və son cavabı (ölçü vahidi ilə) de.", speaking: levelOf() ? `Cavabı ingilis dilində, uzun və ətraflı ver (2–4 dəqiqə danış və ya bir neçə abzas yaz): fikrini izah et, səbəb və nümunə gətir. Səviyyənə uyğun sadə və aydın cümlələrlə danış (${levelOf().label}); ağır sözlər lazım deyil, amma səhvlər sayılacaq.` : "Cavabı ingilis dilində, uzun və ətraflı ver.", theory: "" }[q.kind] || "";
      $app.innerHTML = `
        <section class="fade-in stack">
          ${paper(i)}
          <div class="card stack" id="rec-card">
            <div class="row" style="justify-content:space-between">
              <h3 style="margin:0">Sual ${i + 1}: cavabın</h3>
              <button class="link" id="mode-toggle"></button>
            </div>
            ${hint ? `<p class="muted small" style="margin:0">${hint}</p>` : ""}
            <div id="rec-body"></div>
          </div>
          <div class="row" style="justify-content:space-between">
            <button class="link" id="skip" title="Bu suala cavab vermək məcburi deyil">Cavab vermirəm, etalona bax</button>
            <button class="btn" id="next" disabled>${last ? "Bileti təhvil ver" : "Növbəti sual →"}</button>
          </div>
        </section>`;
      const body = $app.querySelector("#rec-body");
      const next = $app.querySelector("#next");
      const toggle = $app.querySelector("#mode-toggle");
      const skipBtn = $app.querySelector("#skip");
      let typing = S().answer === "text" && !exam.answers[i];   // fizika: yazılı, səs istəyə bağlı
      let rec = null;

      const setAnswer = (a) => { exam.answers[i] = a; next.disabled = !a; };
      next.onclick = () => { if (rec) rec.stop(true); go(last ? "grading" : "answer", last ? undefined : i + 1); };
      toggle.onclick = () => {
        if (rec) rec.stop(true);
        typing = !typing; setAnswer(null); draw();
      };

      skipBtn.onclick = () => { if (rec) { rec.stop(true); rec = null; } setAnswer({ kind: "skip" }); draw(); };

      function draw() {
        const skipped = exam.answers[i] && exam.answers[i].kind === "skip";
        toggle.hidden = skipped; skipBtn.hidden = skipped;
        if (skipped) {
          // cavab vermədən etalona baxış: nəzəri sual/məsələ üçün etalon, speaking üçün nümunə cavab
          const panel = q.kind === "speaking"
            ? sampleBlock(q).replace("<details ", "<details open ")
            : `<h4 style="margin:0 0 6px">Etalon cavab <span class="muted small">(${SRC_LONG[q.src]})</span></h4>${refBody(q)}`;
          body.innerHTML = `${panel}<div class="row" style="margin-top:14px"><button class="btn ghost" id="unskip">Yenə də cavab verəcəm</button></div><p class="muted small" style="margin:10px 0 0">Bu sual bilet balına daxil edilmir.</p>`;
          body.querySelector("#unskip").onclick = () => { setAnswer(null); draw(); };
          if (q.kind === "speaking") {
            bindSamples(body);
            const gen = body.querySelector("[data-sample]");
            if (gen && !(samples[sampleKey(q)] || []).length && !needKey()) gen.click();   // nümunə avtomatik yaradılır
          }
          return;
        }
        toggle.textContent = typing ? "Səslə cavab ver" : "Yazılı cavab ver";
        if (typing) {
          body.innerHTML = `<textarea id="txt" placeholder="${q.kind === "speaking" ? "Write your answer here…" : q.kind === "problem" ? "Həllini və cavabını bura yaz…" : "Cavabını bura yaz…"}"></textarea>`;
          const ta = body.querySelector("#txt");
          ta.oninput = () => setAnswer(ta.value.trim().length > 20 ? { kind: "text", text: ta.value.trim() } : null);
          ta.focus();
          return;
        }
        const a = exam.answers[i];
        if (a && a.kind === "audio") {
          body.innerHTML = `
            <p class="muted small" style="margin:0 0 8px">Yazıldı: ${mmss(a.duration)}. Dinləyib yoxlaya bilərsən.</p>
            <audio controls src="${a.url}"></audio>
            <div class="row" style="margin-top:12px"><button class="btn ghost" id="redo">Yenidən yaz</button></div>`;
          body.querySelector("#redo").onclick = () => { URL.revokeObjectURL(a.url); setAnswer(null); draw(); };
          return;
        }
        body.innerHTML = `
          <div class="recorder">
            <button class="mic" id="mic" aria-label="Danışmağa başla">${MIC_SVG}</button>
            <div style="width:100%">
              <p id="rec-label" style="margin:0 0 4px;font-weight:500">Danışmağa başla</p>
              <p class="muted small" id="rec-sub" style="margin:0 0 10px">Düyməyə bas və suala şifahi cavab ver. Limit: ${mmss(limitFor(s))}.</p>
              <div class="meter" id="meter">${"<i></i>".repeat(32)}</div>
            </div>
          </div>`;
        body.querySelector("#mic").onclick = async () => {
          if (rec) { rec.stop(); return; }
          try {
            rec = await startRecording(limitFor(s), {
              meter: body.querySelector("#meter"),
              label: body.querySelector("#rec-label"),
              sub: body.querySelector("#rec-sub"),
              mic: body.querySelector("#mic"),
            });
            const result = await rec.done;
            rec = null;
            if (!result) return;
            if (result.duration < 2) { toast("Yazı çox qısadır, yenidən cəhd et"); draw(); return; }
            setAnswer({ kind: "audio", ...result, url: URL.createObjectURL(result.blob) });
            draw();
          } catch (err) {
            rec = null;
            console.error(err);
            toast(err && err.name === "NotAllowedError" ? "Mikrofon icazəsi verilmədi" : "Mikrofon açılmadı: " + (err.message || err));
          }
        };
      }
      cleanup.push(() => rec && rec.stop(true));
      setAnswer(exam.answers[i] || null);
      draw();
    },

    async grading() {
      exam.finished = true;
      const s = settings();
      const allSkipped = exam.answers.every((a) => a && a.kind === "skip");
      if (needKey() && !allSkipped) { toast("Cavabların yadda saxlanıb. Qiymət üçün əvvəlcə açar əlavə et."); go("key", "grading"); return; }
      $app.innerHTML = `
        <section class="card fade-in stack">
          <div class="row"><div class="spinner"></div><h2 style="margin:0">Qiymətləndirilir…</h2></div>
          <p class="muted">Səs yazıları mətnə çevrilir və etalonla müqayisə olunur. Bu, 20–60 saniyə çəkə bilər.</p>
          <ul class="checklist">${exam.qs.map((n, i) => `<li id="g${i}"><span class="st">○</span><span>Sual ${i + 1} · №${n}</span></li>`).join("")}</ul>
          <div id="g-actions"></div>
        </section>`;
      const mark = (i, st) => { const el = $app.querySelector(`#g${i} .st`); if (el) el.textContent = st; };
      await Promise.all(exam.qs.map(async (n, i) => {
        if (exam.results[i]) { mark(i, "✓"); return; }
        mark(i, "…");
        try {
          exam.results[i] = await gradeOne(qOf(n), exam.answers[i], s);
          mark(i, "✓");
        } catch (err) {
          console.error(err);
          exam.errors[i] = err.message || String(err);
          mark(i, "✕");
        }
      }));
      if (exam.results.filter(Boolean).length === exam.qs.length) {
        saveToHistory(exam);
        go("result", exam.record);
        return;
      }
      const errs = exam.errors.filter(Boolean);
      $app.querySelector("#g-actions").innerHTML = `
        <p class="notice">Bəzi cavablar qiymətləndirilmədi: ${esc(errs[0])}</p>
        <div class="row"><button class="btn" id="retry">Yenidən cəhd et</button><button class="btn ghost" id="to-settings">Ayarlar</button></div>`;
      $app.querySelector("#retry").onclick = () => { exam.errors = []; go("grading"); };
      $app.querySelector("#to-settings").onclick = () => go("settings");
    },

    result(rec) {
      const sc = examScore(rec), n = answeredOf(rec).length || 1, none = !answeredOf(rec).length;
      $app.innerHTML = `
        <section class="fade-in stack">
          <div class="card verdict">
            <div class="grade"><div><b>${none ? "—" : one(pts(sc))}</b><span>${none ? "cavabsız" : maxOf() + " baldan"}</span></div></div>
            <div>
              <p class="muted small" style="margin:0">${esc(S().short)} · Bilet №${rec.ticket} · ${new Date(rec.date).toLocaleString("az-AZ")}</p>
              <h2 style="margin:4px 0 12px">${none ? "Cavab verilməyib: etalonlara bax" : `${esc(S().exam.split(" ·")[0])} balı: ${one(pts(sc))} / ${maxOf()}`}</h2>${rec.items.some((x) => x.skipped) && !none ? `<p class="muted small" style="margin:-6px 0 10px">Bal yalnız cavab verdiyin suallar üzrədir.</p>` : ""}
              ${rec.items.map((it, i) => it.skipped ? `
                <div class="scorebar" style="margin-bottom:6px">
                  <span class="small" style="min-width:64px">Sual ${i + 1}</span>
                  <span class="muted small">cavabsız (etalona baxdın)</span>
                </div>` : `
                <div class="scorebar" style="margin-bottom:6px">
                  <span class="small" style="min-width:64px">Sual ${i + 1}</span>
                  <div class="bar"><div style="width:${it.score * 10}%;background:${scoreColor(it.score)}"></div></div>
                  <b>${one(pts(it.score) / n)}/${one(maxOf() / n)}</b>
                </div>`).join("")}
            </div>
          </div>
          ${rec.items.map((it, i) => {
            const q = qOf(it.n);
            if (it.skipped) return `
            <article class="card stack">
              <div>
                <p class="muted small" style="margin:0">Sual ${i + 1} · №${it.n} · cavabsız</p>
                <h3 style="margin:2px 0 0">${esc(q.q)}</h3>
              </div>
              ${q.kind === "speaking" ? sampleBlock(q).replace("<details ", "<details open ") : `<details open><summary>Etalon cavab (${SRC_LONG[q.src]})</summary>${refBody(q)}</details>`}
            </article>`;
            return `
            <article class="card stack">
              <div class="row" style="justify-content:space-between;align-items:flex-start">
                <div style="flex:1;min-width:220px">
                  <p class="muted small" style="margin:0">Sual ${i + 1} · №${it.n}</p>
                  <h3 style="margin:2px 0 0">${esc(q.q)}</h3>
                </div>
                <span class="pill" style="color:${scoreColor(it.score)}" title="Keyfiyyət: ${it.score}/10">${one(pts(it.score) / n)} / ${one(maxOf() / n)}</span>
              </div>
              <p style="margin:0">${esc(it.feedback)}</p>
              <div class="cols">
                <div class="good"><h4>${q.kind === "speaking" ? "Yaxşı olanlar" : "Dediklərin"}</h4><ul>${(it.covered || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li class='muted'>—</li>"}</ul></div>
                <div class="miss"><h4>${q.kind === "speaking" ? "Səhvlər və düzəlişlər" : "Çatışmayanlar"}</h4><ul>${(it.missed || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li class='muted'>—</li>"}</ul></div>
              </div>
              ${it.speech ? `<p class="small muted" style="margin:0"><b>Nitq:</b> ${esc(it.speech)}</p>` : ""}
              ${it.corrected ? `<div class="corrected"><h4>Necə deməli idin <span class="muted small">(sənin cavabın, bütün səhvlər düzəldilmiş)</span></h4><div class="ref">${md(it.corrected)}</div></div>` : ""}
              <details><summary>Sənin cavabın (mətn)</summary><div class="transcript">${esc(it.transcript || "—")}</div></details>
              ${q.kind === "speaking" ? sampleBlock(q) : `<details><summary>Etalon cavab (${SRC_LONG[q.src]})</summary>${refBody(q)}</details>`}
            </article>`;
          }).join("")}
          <div class="row">
            <button class="btn accent" id="again">Yeni bilet çək</button>
            <button class="btn ghost" id="home">Ana səhifə</button>
          </div>
        </section>`;
      exam = null;
      bindSamples($app);
      $app.querySelector("#again").onclick = () => go("draw");
      $app.querySelector("#home").onclick = () => go("home");
    },

    bank() {
      const last = lastScores();
      $app.innerHTML = `
        <section class="fade-in">
          <h2>Bütün suallar</h2>
          <p class="muted">${qsOf().length} sual${qsOf().some((q) => q.answer) ? " və etalon cavablar" : ""}. Rəqəm həmin suala son cavabının keyfiyyətidir (0–10).</p>
          <input type="text" class="search" id="q" placeholder="Axtar: məs. etiket, sənəd, təqdimat…">
          <div id="list"></div>
        </section>`;
      const list = $app.querySelector("#list");
      const render = (term) => {
        const t = term.trim().toLocaleLowerCase("az");
        list.innerHTML = qsOf().filter((q) => !t || (q.q + " " + q.answer).toLocaleLowerCase("az").includes(t)).map((q) => `
          <details class="bank-item">
            <summary>
              <span class="qn" style="font-family:var(--serif);font-weight:700;color:var(--accent)">${q.n}.</span>
              <span>${esc(q.q)}</span>
              <span class="row" style="gap:6px;flex-wrap:nowrap">
                ${last[q.n] != null ? `<span class="pill small" style="color:${scoreColor(last[q.n])}">${last[q.n]}</span>` : ""}
                ${q.kind === "speaking" ? `<span class="tag">speaking</span>` : `<span class="tag">${SRC[q.src]}</span>`}
              </span>
            </summary>
            ${q.kind === "speaking" ? `<div class="ref"><p class="muted small">Etalon cavab yoxdur: sərbəst danışırsan. Qiymətləndirmə məzmun, qrammatika, lüğət və axıcılığa görədir.</p>${sampleBlock(q)}</div>` : refBody(q)}
          </details>`).join("") || `<p class="muted">Heç nə tapılmadı.</p>`;
        bindSamples(list);
      };
      $app.querySelector("#q").oninput = (e) => render(e.target.value);
      render("");
    },

    history() {
      const h = history();
      $app.innerHTML = `
        <section class="fade-in">
          <h2>Tarixçə</h2>
          <p class="muted">${esc(profileName())} · ${esc(S().short)} nəticələri.</p>
          ${h.length ? h.map((r, idx) => {
            return `
            <div class="hist">
              <span class="pill" style="color:${scoreColor(examScore(r))}">${one(pts(examScore(r)))} / ${maxOf()}</span>
              <div>
                <b>Bilet №${r.ticket}</b> <span class="muted small">· ${new Date(r.date).toLocaleString("az-AZ")}</span>
                <div class="muted small">Suallar: ${r.items.map((i) => `№${i.n}`).join(", ")}</div>
              </div>
              <button class="btn ghost" data-i="${idx}">Bax</button>
            </div>`;
          }).join("") : `<p class="muted">Hələ bilet çəkməmisən.</p>`}
          ${h.length ? `<div class="row" style="margin-top:20px"><button class="btn ghost" id="clear">Tarixçəni sil</button></div>` : ""}
        </section>`;
      $app.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => go("result", h[Number(b.dataset.i)]));
      const c = $app.querySelector("#clear");
      if (c) c.onclick = () => { if (confirm("Bütün tarixçə silinsin?")) { setHistory([]); go("history"); } };
    },

    settings() {
      const s = settings();
      $app.innerHTML = `
        <section class="card fade-in stack" style="max-width:640px">
          <h2>Ayarlar</h2>
          ${keyForm(s)}
          <label class="field"><span>Hazırlıq vaxtı</span>
            <select id="prep">${[[0, "Yoxdur"], [60, "1 dəqiqə"], [120, "2 dəqiqə"], [300, "5 dəqiqə"], [600, "10 dəqiqə"]].map(([v, t]) => `<option value="${v}" ${s.prep == v ? "selected" : ""}>${t}</option>`).join("")}</select>
          </label>
          <label class="field"><span>Hər suala danışma limiti</span>
            <select id="limit">${[[120, "2 dəqiqə"], [180, "3 dəqiqə"], [240, "4 dəqiqə"]].map(([v, t]) => `<option value="${v}" ${s.limit == v ? "selected" : ""}>${t}</option>`).join("")}</select>
          </label>
          <label class="field"><span>Biletin tərtibi</span>
            <select id="mode">
              <option value="sections" ${s.mode === "sections" ? "selected" : ""}>Hər bölmədən bir sual (fənnin biletinə uyğun)</option>
              <option value="random" ${s.mode === "random" ? "selected" : ""}>Tam təsadüfi suallar</option>
              <option value="weak" ${s.mode === "weak" ? "selected" : ""}>Zəif və cavablanmamış suallara üstünlük</option>
            </select>
          </label>
          <div class="row"><button class="btn" id="save">Yadda saxla</button></div>
        </section>`;
      bindKeyForm();
      $app.querySelector("#save").onclick = () => {
        const cur = settings();
        saveSettings({
          ...cur,
          key: cleanKey($app.querySelector("#key").value),
          prep: Number($app.querySelector("#prep").value),
          limit: Number($app.querySelector("#limit").value),
          mode: $app.querySelector("#mode").value,
        });
        toast("Yadda saxlandı");
      };
    },
  };

  // ---------- imtahan məntiqi ----------
  function newExam(ticket, qs) {
    return { ticket, qs, answers: [], results: [], errors: [], finished: false, started: Date.now() };
  }

  function pickQuestions(mode) {
    const sub = S(), T = sub.ticket.length;
    const all = qsOf(sub).map((q) => q.n);
    if (mode === "random") return shuffle(all).slice(0, T).sort((a, b) => a - b);
    if (mode === "weak") {
      const last = lastScores();
      // cavablanmamış = 0 bal kimi; çəki: 11 - bal
      const weight = (n) => 11 - (last[n] ?? 0);
      const picked = [];
      while (picked.length < T) {
        const pool = all.filter((n) => !picked.includes(n));
        let r = Math.random() * pool.reduce((a, n) => a + weight(n), 0);
        for (const n of pool) { r -= weight(n); if (r <= 0) { picked.push(n); break; } }
      }
      return picked.sort((a, b) => a - b);
    }
    const used = new Set();
    return sub.ticket.map((g) => { const all = qsOf(sub).filter((q) => q.group === g); const pool = all.filter((q) => !used.has(q.n)); const pick = (pool.length ? pool : all)[rand((pool.length ? pool : all).length)].n; used.add(pick); return pick; }).sort((a, b) => a - b);
  }

  function lastScores() {
    const out = {};
    for (const r of history().slice().reverse()) for (const it of r.items) if (!it.skipped) out[it.n] = it.score;
    return out;
  }

  function saveToHistory(ex) {
    const items = ex.qs.map((n, i) => ({ n, ...ex.results[i] }));
    const done = items.filter((x) => !x.skipped);
    const total = done.reduce((a, x) => a + x.score, 0);
    const rec = { date: Date.now(), ticket: ex.ticket, items, total, pct: done.length ? Math.round((total / (done.length * 10)) * 100) : 0 };
    if (done.length) { const h = history(); h.unshift(rec); setHistory(h.slice(0, 100)); }
    ex.record = rec;
  }

  function paper(active, all = false) {
    return `
      <div class="paper">
        <div class="paper-head">
          <span class="no">Bilet № ${exam.ticket}</span>
          <span class="muted small">${esc(S().short)} · ${esc(S().exam)}</span>
        </div>
        <ol class="qlist">
          ${exam.qs.map((n, i) => `
            <li class="${!all && i === active ? "active" : ""} ${!all && i < active ? "done" : ""}">
              <span class="qn">${i + 1}.</span>
              <span class="qtext">${esc(qOf(n).q)}</span>
            </li>`).join("")}
        </ol>
      </div>`;
  }

  // ---------- səs yazısı ----------
  const MIC_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
  const STOP_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>`;

  async function startRecording(limitSec, ui) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const an = ac.createAnalyser(); an.fftSize = 128;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const bars = [...ui.meter.children];
    ui.meter.classList.add("on");
    ui.mic.classList.add("on"); ui.mic.innerHTML = STOP_SVG; ui.mic.setAttribute("aria-label", "Bitir");

    const t0 = Date.now();
    let raf, discard = false, stopped = false;
    const tick = () => {
      an.getByteFrequencyData(buf);
      bars.forEach((b, i) => { b.style.height = `${4 + (buf[i + 2] / 255) * 36}px`; });
      const el = (Date.now() - t0) / 1000;
      ui.label.innerHTML = `<span class="dot"></span>Yazılır · ${mmss(el)} / ${mmss(limitSec)}`;
      ui.sub.textContent = el > limitSec - 15 ? "Vaxt bitmək üzrədir, fikrini yekunlaşdır." : "Bitirəndə düyməyə yenidən bas.";
      if (el >= limitSec) { stop(); return; }
      raf = requestAnimationFrame(tick);
    };

    const done = new Promise((resolve) => {
      mr.onstop = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ac.close().catch(() => {});
        if (discard) { resolve(null); return; }
        const blob = new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" });
        resolve({ blob, mime: blob.type, duration: (Date.now() - t0) / 1000 });
      };
    });
    function stop(silent) {
      if (stopped) return; stopped = true;
      discard = !!silent;
      if (mr.state !== "inactive") mr.stop();
    }
    mr.start(1000);
    tick();
    return { stop, done };
  }

  // Mono WAV-a çevir. Tezlik elə seçilir ki, fayl Vercel-in 4.5 MB limitinə sığsın:
  // qısa cavablar 16 kHz, 4 dəqiqəlik cavab ~8.7 kHz (nitq üçün kifayətdir).
  const MAX_WAV = 4_200_000;
  async function toWav(blob) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const decoded = await ac.decodeAudioData(await blob.arrayBuffer());
    ac.close().catch(() => {});
    const rate = Math.max(8000, Math.min(16000, Math.floor((MAX_WAV - 44) / 2 / decoded.duration)));
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const w = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); view.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    w(36, "data"); view.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    return new Blob([view], { type: "audio/wav" });
  }

  // ---------- server (Vercel funksiyası /api/grade) ----------
  const cleanKey = (k) => String(k || "").replace(/[^\x21-\x7e]/g, "");

  async function api(query, body, contentType, s, extra) {
    const headers = { "Content-Type": contentType, ...(extra || {}) };
    if (s.key) headers["x-user-key"] = cleanKey(s.key);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 130000);
    try {
      const res = await fetch(`/api/grade?${query}`, { method: "POST", headers, body, signal: ctl.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server xətası (${res.status})`);
      return data;
    } catch (e) {
      if (ctl.signal.aborted) throw new Error("Vaxt bitdi, server cavab vermədi");
      if (e instanceof TypeError) throw new Error("İnternet bağlantısını yoxla");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  const lvQ = () => (levelOf() ? `&lv=${levelOf().id}` : "") + (curSetId() ? `&st=${curSetId()}` : "");
  async function gradeOne(q, answer, s) {
    if (answer && answer.kind === "skip") return { skipped: true, transcript: "", score: 0, covered: [], missed: [], feedback: "", speech: "" };
    if (!answer) return { transcript: "", score: 0, covered: [], missed: ["Cavab verilmədi"], feedback: "Bu suala cavab verilmədi.", speech: "" };
    if (answer.kind === "audio") {
      if (!answer.wav) answer.wav = await toWav(answer.blob); // təkrar cəhddə yenidən çevirmə
      return api(`s=${subjectId}&n=${q.n}&kind=audio${lvQ()}`, answer.wav, "audio/wav", s, apiExtra(q));
    }
    return api(`s=${subjectId}&n=${q.n}&kind=text${lvQ()}`, answer.text, "text/plain; charset=utf-8", s, apiExtra(q));
  }

  // ---------- açar forması (istəyə bağlı) ----------
  function keyForm(s) {
    return `
      <label class="field"><span>Gemini API açarı${shared ? " (istəyə bağlı)" : ""}</span>
        <div class="row" style="flex-wrap:nowrap">
          <input type="password" id="key" value="${esc(s.key)}" placeholder="${shared ? "Boş qalsa, ümumi açar işləyir" : "AQ.… və ya AIza…"}" autocomplete="off" spellcheck="false">
          <button class="btn ghost" id="test-key" type="button">Yoxla</button>
        </div>
        <small>Açarın yoxdur? <a href="#" id="how-key">Necə alınır: addım-addım</a>. Açar yalnız bu brauzerdə saxlanır.</small>
      </label>`;
  }
  function bindKeyForm() {
    const input = $app.querySelector("#key");
    const persist = () => saveSettings({ ...settings(), key: cleanKey(input.value) });
    input.addEventListener("change", persist);
    $app.querySelector("#how-key").onclick = (e) => { e.preventDefault(); go("key", "settings"); };
    $app.querySelector("#test-key").onclick = async (e) => {
      persist();
      const b = e.currentTarget; b.disabled = true; b.textContent = "…";
      try {
        const r = await api("ping=1", "", "text/plain", settings());
        toast(r.own ? "Öz açarın işləyir" : "Ümumi açar işləyir");
      } catch (err) {
        toast("Xəta: " + err.message);
      } finally {
        b.disabled = false; b.textContent = "Yoxla";
      }
    };
  }

  renderWho();
  subjectId = SUBJECTS.some((x) => x.id === store.get("subject", null)) ? store.get("subject") : null;
  // serverdə ümumi açar olub-olmadığını öyrən, sonra başla
  let shared = false;
  const needKey = () => !shared && !settings().key;
  fetch("/api/grade").then((r) => r.json()).then((d) => { shared = !!d.shared; }).catch(() => {}).finally(() => go(subjectId ? "home" : "subjects"));
})();

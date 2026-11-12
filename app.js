/* Bilet Çək — universitet kollokvium və imtahan simulyatoru (bütün fənlər).
   Axın: fənn seç → bilet çək → hazırlıq → suallara səsli cavab → Gemini (səs→mətn + qiymət) → nəticə.
   Fənlər subjects.js-dədir (build_subjects.py yaradır). */
(() => {
  "use strict";

  const NEW_HOST = "bilet-cek.vercel.app";
  const OLD_HOSTS = ["adiak-bilet.vercel.app", "biletcek.vercel.app"];
  const SUBJECTS = window.SUBJECTS;
  const $app = document.getElementById("app");
  let subjectId = null;                                   // seçilmiş fənn
  const S = () => SUBJECTS.find((x) => x.id === subjectId);
  const byNCache = {};
  const qOf = (n) => (byNCache[subjectId] || (byNCache[subjectId] = Object.fromEntries(S().questions.map((q) => [q.n, q]))))[n];
  const SRC = { vesait: "vəsait", kurs: "böyük kurs", umumi: "ümumi", hesab: "həll" };
  const SRC_LONG = { vesait: "dərs vəsaitindən", kurs: "böyük kursların cavab faylından", umumi: "ümumi biliyə əsaslanır", hesab: "hesablanmış həll" };

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
  // XDİAK kimi fənlərdə qruplar fərqli səviyyədə oxuyur: səviyyə fənnə görə saxlanır
  const levelOf = () => { const lv = (S().levels || []); return lv.length ? (lv.find((l) => l.id === store.get("level:" + subjectId, null)) || lv[0]) : null; };
  const historyCount = (pid) => SUBJECTS.reduce((a, x) => a + store.get("history:" + pid + ":" + x.id, []).length, 0);

  // ---------- köməkçilər ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  // etalon cavabın göstərilməsi: səhifə şəkilləri varsa (fizikada düsturlar), onlar; yoxsa mətn
  const refBody = (q) => q.images && q.images.length
    ? `<div class="ref shots">${q.images.map((u) => `<img src="${u}" alt="Etalon cavab səhifəsi" loading="lazy">`).join("")}</div>`
    : `<div class="ref">${md(q.answer)}</div>`;
  const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const scoreColor = (s) => (s >= 8 ? "var(--green)" : s >= 5 ? "var(--amber)" : "var(--red)");
  const toast = (msg) => {
    document.querySelectorAll(".toast").forEach((x) => x.remove());
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  };

  // Kollokvium cəmi 10 baldır: hər sual 0–10 keyfiyyətlə qiymətləndirilir, payı 1/sual sayıdır.
  const one = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
  const examScore = (r) => r.total / r.items.length;            // 0–10 (dəqiq)
  const share = (score, count) => score / count;                // sualın 10 baldakı payı

  // ---------- naviqasiya ----------
  let exam = null;         // aktiv imtahan
  let cleanup = [];        // ekran dəyişəndə dayandırılacaq taymerlər və s.
  function go(view, ...args) {
    cleanup.forEach((f) => { try { f(); } catch { /* */ } });
    cleanup = [];
    window.scrollTo({ top: 0 });
    if (!currentProfile() && view !== "who") { VIEWS.who(view); return; }
    if (!subjectId && !["who", "key", "subjects", "settings"].includes(view)) view = "subjects";
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
      $app.innerHTML = `
        <section class="fade-in">
          <h1 style="margin-bottom:6px">${first ? first + ", hansı" : "Hansı"} fənndən bilet çəkirsən?</h1>
          <p class="muted" style="margin:0 0 22px">Fənni seç. Suallar kafedranın kollokvium siyahısından, etalon cavablar dərs materiallarındandır.</p>
          <div class="subjects">
            ${SUBJECTS.map((x) => {
              const h = store.get("history:" + currentProfile() + ":" + x.id, []);
              const best = h.length ? one(Math.max(...h.map(examScore))) : null;
              return `
              <button class="subject card" data-sub="${x.id}">
                <span class="subject-tag">${esc(x.short)}</span>
                <b class="subject-name">${esc(x.name)}</b>
                <span class="muted small">${x.questions.length} sual · ${esc(x.exam)}</span>
                <span class="subject-foot small">${h.length ? `${h.length} bilet · ən yaxşı ${best}/10` : "Hələ bilet çəkməmisən"}</span>
              </button>`;
            }).join("")}
          </div>
        </section>`;
      $app.querySelectorAll("[data-sub]").forEach((b) => b.onclick = () => { subjectId = b.dataset.sub; store.set("subject", subjectId); go("home"); });
    },

    home() {
      const sub = S(), N = sub.questions.length;
      const h = history();
      const best = h.length ? one(Math.max(...h.map(examScore))) : null;
      const avg = h.length ? one(h.reduce((a, x) => a + examScore(x), 0) / h.length) : null;
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
              <li>${sub.answer === "text" ? "Hər suala yazılı cavab verirsən. İstəsən, səslə də cavab verə bilərsən." : `Hər suala ayrıca danışırsan (ən çox ${mmss(s.limit)}). İstəsən, yazılı da cavab verə bilərsən.`}</li>
              <li>${sub.questions.some((q) => q.kind === "speaking") ? "Süni intellekt nitqini mətnə çevirir, ingilis dili meyarları ilə yoxlayır və 10 ballıq bal verir." : "Süni intellekt səsini mətnə çevirir, etalon cavabla müqayisə edir və 10 ballıq kollokvium balı verir."}</li>
            </ol>
            ${(sub.levels || []).length ? `
              <label class="field" style="max-width:360px;margin:0 0 18px"><span>Qrupunun səviyyəsi</span>
                <select id="level">${sub.levels.map((l) => `<option value="${l.id}" ${levelOf().id === l.id ? "selected" : ""}>${esc(l.label)}</option>`).join("")}</select>
                <small>Cavabın bu səviyyəyə görə qiymətləndirilir: səviyyəndən yuxarı söz və qrammatika tələb olunmur, amma leksik və qrammatik səhvlər sayılır.</small>
              </label>` : ""}
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
      const lvSel = $app.querySelector("#level");
      if (lvSel) lvSel.onchange = () => store.set("level:" + subjectId, lvSel.value);
      $app.querySelectorAll("[data-v]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); go(el.dataset.v); }));
    },

    draw() {
      const s = settings();
      const pool = shuffle(Array.from({ length: Math.max(S().questions.length, 10) }, (_, i) => i + 1)).slice(0, 10);
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
      const hint = { problem: "Məsələni addım-addım həll et: düsturu, əvəzləməni və son cavabı (ölçü vahidi ilə) de.", speaking: levelOf() ? `Cavabı ingilis dilində ver. Səviyyənə uyğun sadə və aydın cümlələrlə danış (${levelOf().label}); ağır sözlər lazım deyil, amma səhvlər sayılacaq.` : "Cavabı ingilis dilində ver.", theory: "" }[q.kind] || "";
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
          <div class="row" style="justify-content:flex-end">
            <button class="btn" id="next" disabled>${last ? "Bileti təhvil ver" : "Növbəti sual →"}</button>
          </div>
        </section>`;
      const body = $app.querySelector("#rec-body");
      const next = $app.querySelector("#next");
      const toggle = $app.querySelector("#mode-toggle");
      let typing = S().answer === "text" && !exam.answers[i];   // fizika: yazılı, səs istəyə bağlı
      let rec = null;

      const setAnswer = (a) => { exam.answers[i] = a; next.disabled = !a; };
      next.onclick = () => { if (rec) rec.stop(true); go(last ? "grading" : "answer", last ? undefined : i + 1); };
      toggle.onclick = () => {
        if (rec) rec.stop(true);
        typing = !typing; setAnswer(null); draw();
      };

      function draw() {
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
              <p class="muted small" id="rec-sub" style="margin:0 0 10px">Düyməyə bas və suala şifahi cavab ver. Limit: ${mmss(s.limit)}.</p>
              <div class="meter" id="meter">${"<i></i>".repeat(32)}</div>
            </div>
          </div>`;
        body.querySelector("#mic").onclick = async () => {
          if (rec) { rec.stop(); return; }
          try {
            rec = await startRecording(s.limit, {
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
      if (needKey()) { toast("Cavabların yadda saxlanıb. Qiymət üçün əvvəlcə açar əlavə et."); go("key", "grading"); return; }
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
      const sc = examScore(rec), n = rec.items.length;
      $app.innerHTML = `
        <section class="fade-in stack">
          <div class="card verdict">
            <div class="grade"><div><b>${Math.round(sc)}</b><span>10 baldan</span></div></div>
            <div>
              <p class="muted small" style="margin:0">${esc(S().short)} · Bilet №${rec.ticket} · ${new Date(rec.date).toLocaleString("az-AZ")}</p>
              <h2 style="margin:4px 0 12px">${esc(S().exam.split(" ·")[0])} balı: ${one(sc)} / 10</h2>
              ${rec.items.map((it, i) => `
                <div class="scorebar" style="margin-bottom:6px">
                  <span class="small" style="min-width:64px">Sual ${i + 1}</span>
                  <div class="bar"><div style="width:${it.score * 10}%;background:${scoreColor(it.score)}"></div></div>
                  <b>${one(share(it.score, n))}/${one(10 / n)}</b>
                </div>`).join("")}
            </div>
          </div>
          ${rec.items.map((it, i) => {
            const q = qOf(it.n);
            return `
            <article class="card stack">
              <div class="row" style="justify-content:space-between;align-items:flex-start">
                <div style="flex:1;min-width:220px">
                  <p class="muted small" style="margin:0">Sual ${i + 1} · №${it.n}</p>
                  <h3 style="margin:2px 0 0">${esc(q.q)}</h3>
                </div>
                <span class="pill" style="color:${scoreColor(it.score)}" title="Keyfiyyət: ${it.score}/10">${one(share(it.score, n))} / ${one(10 / n)}</span>
              </div>
              <p style="margin:0">${esc(it.feedback)}</p>
              <div class="cols">
                <div class="good"><h4>${q.kind === "speaking" ? "Yaxşı olanlar" : "Dediklərin"}</h4><ul>${(it.covered || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li class='muted'>—</li>"}</ul></div>
                <div class="miss"><h4>${q.kind === "speaking" ? "Səhvlər və düzəlişlər" : "Çatışmayanlar"}</h4><ul>${(it.missed || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li class='muted'>—</li>"}</ul></div>
              </div>
              ${it.speech ? `<p class="small muted" style="margin:0"><b>Nitq:</b> ${esc(it.speech)}</p>` : ""}
              <details><summary>Sənin cavabın (mətn)</summary><div class="transcript">${esc(it.transcript || "—")}</div></details>
              ${q.kind === "speaking" ? "" : `<details><summary>Etalon cavab (${SRC_LONG[q.src]})</summary>${refBody(q)}</details>`}
            </article>`;
          }).join("")}
          <div class="row">
            <button class="btn accent" id="again">Yeni bilet çək</button>
            <button class="btn ghost" id="home">Ana səhifə</button>
          </div>
        </section>`;
      exam = null;
      $app.querySelector("#again").onclick = () => go("draw");
      $app.querySelector("#home").onclick = () => go("home");
    },

    bank() {
      const last = lastScores();
      $app.innerHTML = `
        <section class="fade-in">
          <h2>Bütün suallar</h2>
          <p class="muted">${S().questions.length} sual${S().questions.some((q) => q.answer) ? " və etalon cavablar" : ""}. Rəqəm həmin suala son cavabının keyfiyyətidir (0–10).</p>
          <input type="text" class="search" id="q" placeholder="Axtar: məs. etiket, sənəd, təqdimat…">
          <div id="list"></div>
        </section>`;
      const list = $app.querySelector("#list");
      const render = (term) => {
        const t = term.trim().toLocaleLowerCase("az");
        list.innerHTML = S().questions.filter((q) => !t || (q.q + " " + q.answer).toLocaleLowerCase("az").includes(t)).map((q) => `
          <details class="bank-item">
            <summary>
              <span class="qn" style="font-family:var(--serif);font-weight:700;color:var(--accent)">${q.n}.</span>
              <span>${esc(q.q)}</span>
              <span class="row" style="gap:6px;flex-wrap:nowrap">
                ${last[q.n] != null ? `<span class="pill small" style="color:${scoreColor(last[q.n])}">${last[q.n]}</span>` : ""}
                ${q.kind === "speaking" ? `<span class="tag">speaking</span>` : `<span class="tag">${SRC[q.src]}</span>`}
              </span>
            </summary>
            ${q.kind === "speaking" ? `<div class="ref"><p class="muted">Bu sual üçün etalon cavab yoxdur: sərbəst danışırsan. Qiymətləndirmə məzmun, qrammatika, lüğət və axıcılığa görədir.</p></div>` : refBody(q)}
          </details>`).join("") || `<p class="muted">Heç nə tapılmadı.</p>`;
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
              <span class="pill" style="color:${scoreColor(examScore(r))}">${one(examScore(r))} / 10</span>
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
    const all = sub.questions.map((q) => q.n);
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
    return sub.ticket.map((g) => { const pool = sub.questions.filter((q) => q.group === g); return pool[rand(pool.length)].n; });
  }

  function lastScores() {
    const out = {};
    for (const r of history().slice().reverse()) for (const it of r.items) out[it.n] = it.score;
    return out;
  }

  function saveToHistory(ex) {
    const items = ex.qs.map((n, i) => ({ n, ...ex.results[i] }));
    const total = items.reduce((a, x) => a + x.score, 0);
    const rec = { date: Date.now(), ticket: ex.ticket, items, total, pct: Math.round((total / (items.length * 10)) * 100) };
    const h = history(); h.unshift(rec); setHistory(h.slice(0, 100));
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

  async function api(query, body, contentType, s) {
    const headers = { "Content-Type": contentType };
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

  const lvQ = () => (levelOf() ? `&lv=${levelOf().id}` : "");
  async function gradeOne(q, answer, s) {
    if (!answer) return { transcript: "", score: 0, covered: [], missed: ["Cavab verilmədi"], feedback: "Bu suala cavab verilmədi.", speech: "" };
    if (answer.kind === "audio") {
      if (!answer.wav) answer.wav = await toWav(answer.blob); // təkrar cəhddə yenidən çevirmə
      return api(`s=${subjectId}&n=${q.n}&kind=audio${lvQ()}`, answer.wav, "audio/wav", s);
    }
    return api(`s=${subjectId}&n=${q.n}&kind=text${lvQ()}`, answer.text, "text/plain; charset=utf-8", s);
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

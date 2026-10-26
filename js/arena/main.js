/* ============================================================================
   ChemSim · arena/main.js
   ----------------------------------------------------------------------------
   The Challenge Arena mode:
     #arena            home: start practice or an exam, your stats, past exams
     #arena/practice   one question at a time with hints and explanations;
                       weak topics come up more often
     #arena/exam       USNCO-style timed exam (60 questions in 110 minutes,
                       6 per topic in the usual topic order, no hints), with
                       a data sheet like the real one
     #arena/review     the results and full review of the last exam
                       (#arena/review/<key> for a saved one)

   Everything is saved in the browser’s ‘quiz’ store (My data ▸ Export
   includes it): per-topic stats, questions you missed, and every exam.
   ============================================================================ */
'use strict';

const ArenaMain = (() => {
  const U = ArenaUtil, B = ArenaBank, G = ArenaGen;
  const { esc } = U;
  const TOPIC = Object.fromEntries(B.TOPICS.map((t) => [t.id, t]));
  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const EXAMS = {
    full: { n: 60, min: 110, label: 'Full local exam', note: '60 questions · 110 minutes' },
    half: { n: 30, min: 55, label: 'Half exam', note: '30 questions · 55 minutes' },
    quick: { n: 10, min: 18, label: 'Quick ten', note: '10 questions (one per topic) · 18 minutes' },
  };

  let root = null;
  let stats = null;          // { topics: {id: {seen, correct, recent: []}}, gens: {}, missed: [], answered }
  let practice = null;       // current practice session
  let exam = null;           // current exam session
  let lastResult = null;     // the exam most recently finished (for #arena/review)
  let timer = null;
  let renderSeq = 0;         // bumped by every render, so a slow async render can't overwrite a newer page

  /* ======================================================================
     stats (saved in ChemStore 'quiz')
     ====================================================================== */
  const emptyStats = () => ({ topics: {}, gens: {}, missed: [], answered: 0, bestStreak: 0 });
  async function loadStats() {
    try { stats = (await ChemStore.get('quiz', 'stats')) || emptyStats(); }
    catch (e) { warn('arena', 'Could not read stats', e); stats = emptyStats(); }
    if (!stats.topics) stats = emptyStats();
    return stats;
  }
  const saveStats = () => ChemStore.put('quiz', 'stats', stats).catch((e) => warn('arena', 'Could not save stats', e));

  function record(q, correct) {
    const t = (stats.topics[q.topic] = stats.topics[q.topic] || { seen: 0, correct: 0, recent: [] });
    t.seen++; if (correct) t.correct++;
    t.recent.push(correct ? 1 : 0); if (t.recent.length > 20) t.recent.shift();
    if (q.gen) { const g = (stats.gens[q.gen] = stats.gens[q.gen] || { seen: 0, correct: 0 }); g.seen++; if (correct) g.correct++; }
    if (q.src === 'bank' || q.src === 'mech') {
      const i = stats.missed.indexOf(q.id);
      if (!correct && i < 0) { stats.missed.push(q.id); if (stats.missed.length > 60) stats.missed.shift(); }
      if (correct && i >= 0) stats.missed.splice(i, 1);
    }
    stats.answered++;
  }
  /** Recent accuracy with a gentle prior (an unseen topic counts as 50%). */
  function accuracy(id) {
    const t = stats && stats.topics[id];
    if (!t || !t.recent.length) return null;
    const ok = t.recent.reduce((s, x) => s + x, 0);
    return (ok + 1) / (t.recent.length + 2);
  }

  /* ======================================================================
     choosing questions
     ====================================================================== */
  const rdkitOK = () => typeof RDKit !== 'undefined' && !!RDKit;
  const bankFor = (topic) => B.byTopic(topic).filter((x) => !x.needsRDKit || rdkitOK());
  const gensFor = (topic) => G.list(topic).filter(G.ready);

  function fromBankId(id, r) {
    if (id.startsWith('mech:')) { const it = ArenaMech.ITEMS.find((x) => 'mech:' + x.id === id); return it && rdkitOK() ? ArenaMech.toQuestion(it) : null; }
    const it = B.Q.find((x) => 'bank:' + x.id === id);
    return it && (!it.needsRDKit || rdkitOK()) ? B.toQuestion(it, r) : null;
  }

  /** One generated question from the topic (retries other generators if one fails). */
  function genQuestion(topic, r, prefer) {
    const gs = r.shuffle(gensFor(topic));
    if (prefer) gs.unshift(...gs.splice(gs.findIndex((g) => g.id === prefer), 1));
    for (const g of gs) {
      try { const q = G.make(g.id, r.int(1, 2 ** 30)); if (q && q.choices && q.choices.length >= 2) return q; }
      catch (e) { logError('arena', `Generator ${g.id} failed`, e); }
    }
    return null;
  }

  /** A practice question from `topic`, avoiding recently used bank questions. */
  function practiceQuestion(topic, r, opts) {
    const recent = practice ? practice.recentIds : new Set();
    if (topic === 'organic' && opts.mech && rdkitOK() && r() < (opts.mechOnly ? 1 : 0.22)) {
      const items = ArenaMech.ITEMS.filter((x) => !recent.has('mech:' + x.id));
      if (items.length) return ArenaMech.toQuestion(r.pick(items));
    }
    // revisit something you got wrong before
    const missed = stats.missed.filter((id) => !recent.has(id) && (TOPIC[topic] ? (id.startsWith('mech:') ? topic === 'organic' : (B.Q.find((x) => 'bank:' + x.id === id) || {}).t === topic) : true));
    if (missed.length && r() < 0.25) { const q = fromBankId(r.pick(missed), r); if (q) { q.revisit = true; return q; } }
    const bank = bankFor(topic).filter((x) => !recent.has('bank:' + x.id));
    const gens = gensFor(topic);
    const useBank = bank.length && (!gens.length || r() < bank.length / (bank.length + gens.length * 3));
    if (useBank) return B.toQuestion(r.pick(bank), r);
    return genQuestion(topic, r) || (bank.length ? B.toQuestion(r.pick(bank), r) : null);
  }

  function pickTopic(r, topics, adaptive) {
    const w = topics.map((t) => { if (!adaptive) return 1; const a = accuracy(t); return a === null ? 1.5 : 0.4 + 4 * (1 - a) ** 1.5; });
    let x = r() * w.reduce((s, v) => s + v, 0);
    for (let i = 0; i < topics.length; i++) { x -= w[i]; if (x <= 0) return topics[i]; }
    return topics[topics.length - 1];
  }

  /** Build an exam: n/10 questions per topic, in the USNCO topic order. */
  function buildExam(n, seed) {
    const r = U.rng(seed);
    const per = Math.max(1, Math.round(n / B.TOPICS.length));
    const qs = [];
    B.TOPICS.forEach((t) => {
      const bank = r.shuffle(bankFor(t.id));
      const gens = r.shuffle(gensFor(t.id));
      const nBank = Math.min(bank.length, Math.ceil(per / 2));
      const chosen = bank.slice(0, nBank).map((it) => B.toQuestion(it, r));
      let gi = 0, guard = 0;
      while (chosen.length < per && guard++ < 40) {
        if (gens.length) {
          const g = gens[gi++ % gens.length];
          try { const q = G.make(g.id, r.int(1, 2 ** 30)); if (q && q.choices) { chosen.push(q); continue; } }
          catch (e) { logError('arena', `Generator ${g.id} failed`, e); }
        }
        const more = bank[chosen.length];
        if (more) chosen.push(B.toQuestion(more, r));
        else if (!gens.length) break;
      }
      qs.push(...r.shuffle(chosen));
    });
    return qs;
  }

  /* ======================================================================
     rendering a question
     ====================================================================== */
  function figHTML(q) {
    if (!q.fig) return '';
    const pic = U.svg(q.fig, 280, 180);
    return `<div class="ar-fig">${pic || `<code>${esc(q.fig)}</code><div class="small dim">(structure picture needs RDKit, still loading)</div>`}</div>`;
  }
  function choicesHTML(q, picked, reveal) {
    const molChoices = q.choices.some((c) => c && typeof c === 'object');
    return `<div class="ar-choices${molChoices ? ' mols' : ''}">${q.choices.map((c, i) => {
      let cls = '';
      if (reveal) cls = i === q.answer ? ' right' : i === picked ? ' wrong' : '';
      else if (i === picked) cls = ' picked';
      return `<button class="ar-choice${cls}" data-i="${i}"><span class="ar-letter">${LETTERS[i]}</span><span class="ar-ctext">${U.choiceHTML(c)}</span></button>`;
    }).join('')}</div>`;
  }
  const topicChip = (id) => `<span class="ar-topic">${TOPIC[id] ? TOPIC[id].icon + ' ' + TOPIC[id].label : id}</span>`;

  /* ======================================================================
     layout and routing
     ====================================================================== */
  function build() {
    root = document.getElementById('view-arena');
    root.innerHTML = `<div class="ar-page" id="ar-page"></div>
      <div class="ar-modal hidden" id="ar-modal" role="dialog"><div class="ar-modal-box"><div class="ar-modal-bar"><b id="ar-modal-title"></b><span class="lab-spacer"></span><button class="hbtn small" id="ar-modal-close">✕ Close</button></div><div class="ar-modal-body" id="ar-modal-body"></div></div></div>`;
    root.querySelector('#ar-modal-close').addEventListener('click', closeModal);
    root.querySelector('#ar-modal').addEventListener('click', (e) => { if (e.target.id === 'ar-modal') closeModal(); });
    document.addEventListener('keydown', onKey);
  }
  const page = () => root.querySelector('#ar-page');
  const sub = () => { const m = location.hash.match(/^#arena\/([\w-]+)(?:\/(.+))?/); return m ? [m[1], m[2] && decodeURIComponent(m[2])] : [null]; };

  async function show() {
    const [s, arg] = sub();
    stopTimer();
    if (s === 'practice' && practice) return renderPractice();
    if (s === 'exam' && exam) return renderExam();
    if (s === 'review') return renderReview(arg);
    if (s && s !== 'home' && !(s === 'practice' || s === 'exam')) { location.hash = '#arena'; return; }
    if ((s === 'practice' && !practice) || (s === 'exam' && !exam)) {
      if (s === 'exam') { const saved = await ChemStore.get('quiz', 'exam-inprogress').catch(() => null); if (saved) { exam = saved; return renderExam(); } }
      history.replaceState(null, '', '#arena');
    }
    renderHome();
  }

  /* ---------------- home ---------------- */
  async function renderHome() {
    const seq = ++renderSeq;
    document.title = 'ChemSim · Challenge Arena';
    await loadStats();
    const inprog = await ChemStore.get('quiz', 'exam-inprogress').catch(() => null);
    if (seq !== renderSeq) return;
    const bankN = B.Q.length + ArenaMech.ITEMS.length;
    const topicRows = B.TOPICS.map((t) => {
      const st = stats.topics[t.id], a = accuracy(t.id);
      const pct = st && st.seen ? Math.round(100 * st.correct / st.seen) : null;
      return `<div class="ar-trow"><label class="ar-tcheck"><input type="checkbox" data-topic="${t.id}" checked /> ${t.icon} ${esc(t.label)}</label>
        <div class="ar-bar" data-tip="${st ? `${st.correct}/${st.seen} correct overall; recent accuracy ${Math.round(100 * a)}%` : 'Not practised yet'}"><span style="width:${pct === null ? 0 : pct}%;background:${pct === null ? 'transparent' : pct >= 75 ? 'var(--ok)' : pct >= 50 ? 'var(--warn)' : 'var(--err)'}"></span></div>
        <span class="small dim ar-tpct">${pct === null ? '—' : pct + '%'}</span></div>`;
    }).join('');
    const weak = B.TOPICS.filter((t) => accuracy(t.id) !== null).sort((x, y) => accuracy(x.id) - accuracy(y.id)).slice(0, 3).filter((t) => accuracy(t.id) < 0.75);
    page().innerHTML = `
      <div class="ar-home">
        <div class="ar-intro">
          <h1>🏆 Challenge Arena</h1>
          <p class="dim">Practice for the US National Chemistry Olympiad. The questions are original (none are copied from real exams); the numeric ones are generated fresh every time, so you never run out. ${bankN} hand-written questions plus ${G.gens.length} question generators across the ten exam topics.</p>
        </div>
        ${inprog ? `<div class="card ar-resume">⏸ You have an unfinished exam (${inprog.qs.length} questions, ${Object.keys(inprog.answers).length} answered). <button class="hbtn small accent" id="ar-resume">Resume</button> <button class="hbtn small" id="ar-discard">Discard</button></div>` : ''}
        <div class="ar-cards">
          <section class="card ar-mode">
            <h2>🎯 Practice</h2>
            <p class="small dim">One question at a time. Hints, full explanations, and questions you missed come back later. With <b>focus on weak topics</b> on, topics you get wrong more often are asked more.</p>
            <div class="ar-topics">${topicRows}</div>
            <div class="btn-row small">
              <button class="mini" id="ar-all">All</button><button class="mini" id="ar-none">None</button>
              <label class="ar-opt"><input type="checkbox" id="ar-adaptive" checked /> Focus on weak topics</label>
              <label class="ar-opt"><input type="checkbox" id="ar-mech" checked /> Include arrow-pushing</label>
            </div>
            <div class="btn-row"><button class="hbtn accent" id="ar-start-practice">Start practice</button>
              <button class="hbtn" id="ar-mech-only" data-tip="Only arrow-pushing mechanism questions">⤻ Mechanism trainer</button>
              ${weak.length ? `<button class="hbtn" id="ar-weak" data-tip="Practise only your three weakest topics">Drill weak topics: ${weak.map((t) => t.icon).join(' ')}</button>` : ''}</div>
          </section>
          <section class="card ar-mode">
            <h2>⏱ Exam</h2>
            <p class="small dim">Like the USNCO local section: multiple choice, topics in the usual order (6 per topic in the full exam), no hints, a periodic table and data sheet, and a timer. You see your score and a full review at the end. A calculator is allowed.</p>
            <div class="ar-exam-opts">${Object.entries(EXAMS).map(([k, x], i) => `<label class="ar-exam-opt"><input type="radio" name="ar-exam" value="${k}"${i === 0 ? ' checked' : ''} /><b>${x.label}</b><span class="small dim">${x.note}</span></label>`).join('')}</div>
            <label class="field small">Exam code (optional: the same code gives the same exam, so friends can sit the same paper)<input id="ar-seed" type="text" inputmode="numeric" placeholder="random" /></label>
            <div class="btn-row"><button class="hbtn accent" id="ar-start-exam">Start exam</button></div>
          </section>
        </div>
        <section class="card ar-history"><h2>Past exams</h2><div id="ar-hist" class="small dim">Loading…</div>
          <div class="btn-row small"><span class="dim">${stats.answered} questions answered in total${stats.missed.length ? ` · ${stats.missed.length} to revisit` : ''}${stats.bestStreak ? ` · best streak ${stats.bestStreak}` : ''}</span><span class="lab-spacer"></span><button class="mini" id="ar-reset" data-tip="Forget all practice statistics (exams are kept)">Reset stats</button></div></section>
      </div>`;
    const P = page();
    const checks = () => [...P.querySelectorAll('[data-topic]')];
    P.querySelector('#ar-all').addEventListener('click', () => checks().forEach((c) => { c.checked = true; }));
    P.querySelector('#ar-none').addEventListener('click', () => checks().forEach((c) => { c.checked = false; }));
    P.querySelector('#ar-start-practice').addEventListener('click', () => {
      const topics = checks().filter((c) => c.checked).map((c) => c.dataset.topic);
      if (!topics.length) { toast('Pick at least one topic', true); return; }
      startPractice({ topics, adaptive: P.querySelector('#ar-adaptive').checked, mech: P.querySelector('#ar-mech').checked });
    });
    P.querySelector('#ar-mech-only').addEventListener('click', () => {
      if (!rdkitOK()) { toast('The mechanism trainer needs RDKit, which is still loading.', true); return; }
      startPractice({ topics: ['organic'], adaptive: false, mech: true, mechOnly: true });
    });
    const wb = P.querySelector('#ar-weak');
    if (wb) wb.addEventListener('click', () => startPractice({ topics: weak.map((t) => t.id), adaptive: true, mech: true }));
    P.querySelector('#ar-start-exam').addEventListener('click', () => {
      const kind = P.querySelector('[name="ar-exam"]:checked').value;
      const code = P.querySelector('#ar-seed').value.trim();
      startExam(kind, code ? (parseInt(code, 10) || hashStr(code)) : U.newSeed() % 1000000);
    });
    P.querySelector('#ar-reset').addEventListener('click', async () => {
      if (!confirm('Reset all practice statistics? Saved exams are kept.')) return;
      stats = emptyStats(); await saveStats(); renderHome();
    });
    if (inprog) {
      P.querySelector('#ar-resume').addEventListener('click', () => { exam = inprog; location.hash = '#arena/exam'; });
      P.querySelector('#ar-discard').addEventListener('click', async () => { await ChemStore.remove('quiz', 'exam-inprogress'); renderHome(); });
    }
    renderHistory();
  }
  const hashStr = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 1000000;

  async function renderHistory() {
    let items = [];
    try { items = (await ChemStore.getAll('quiz')).filter((x) => x.value && x.value.kind === 'exam'); }
    catch (e) { warn('arena', 'Could not read saved exams', e); }
    const box = page().querySelector('#ar-hist');
    if (!box) return;   // the page changed while loading
    if (!items.length) { box.textContent = 'No exams yet. Your results are saved here.'; return; }
    items.sort((a, b) => (b.value.finishedAt || '').localeCompare(a.value.finishedAt || ''));
    box.classList.remove('dim');
    box.innerHTML = items.map(({ key, value: v }) => `
      <div class="saved-row ar-hrow" data-key="${esc(key)}">
        <span><b>${esc(v.label)}</b> <span class="dim">code ${v.seed}</span></span>
        <span class="dim">${new Date(v.finishedAt).toLocaleString()}</span>
        <span class="score-pill">${v.score}/${v.total} · ${Math.round(100 * v.score / v.total)}%</span>
        <button class="mini" data-open>Review</button><button class="mini" data-del data-tip="Delete this exam">🗑</button>
      </div>`).join('');
    box.querySelectorAll('.ar-hrow').forEach((row) => {
      row.querySelector('[data-open]').addEventListener('click', () => { location.hash = '#arena/review/' + encodeURIComponent(row.dataset.key); });
      row.querySelector('[data-del]').addEventListener('click', async () => { await ChemStore.remove('quiz', row.dataset.key); toast('Exam deleted'); renderHistory(); });
    });
  }

  /* ======================================================================
     PRACTICE
     ====================================================================== */
  function startPractice(opts) {
    practice = { opts, r: U.rng(U.newSeed()), n: 0, correct: 0, streak: 0, byTopic: {}, recentIds: new Set(), q: null, state: null, log: [] };
    nextPractice();
    location.hash = '#arena/practice';
    if (ChemRouter.active === 'arena' && sub()[0] === 'practice') renderPractice();
  }
  function nextPractice(sameGen) {
    const P = practice;
    let q = null;
    for (let t = 0; t < 8 && !q; t++) {
      if (sameGen) { q = genQuestion(P.q.topic, P.r, sameGen); sameGen = null; continue; }
      q = practiceQuestion(pickTopic(P.r, P.opts.topics, P.opts.adaptive), P.r, P.opts);
    }
    if (!q) { toast('No questions are available for these topics yet (RDKit or element data still loading?)', true); return; }
    P.q = q;
    P.state = { picked: null, done: false, hinted: false, firstTry: null, mechTries: 0 };
    P.recentIds.add(q.id);
    if (P.recentIds.size > 40) P.recentIds.delete(P.recentIds.values().next().value);
  }

  function renderPractice() {
    renderSeq++;
    const P = practice, q = P.q, S = P.state;
    document.title = 'ChemSim · Arena practice';
    const pct = P.n ? Math.round(100 * P.correct / P.n) : 0;
    page().innerHTML = `
      <div class="ar-session">
        <div class="ar-head">
          <button class="hbtn small" id="ar-end">← End session</button>
          <span class="ar-count">Practice · question ${P.n + (S.done ? 0 : 1)}</span>
          <span class="score-pill">${P.correct}/${P.n}${P.n ? ' · ' + pct + '%' : ''}</span>
          ${P.streak >= 2 ? `<span class="ar-streak">🔥 ${P.streak} in a row</span>` : ''}
          <span class="lab-spacer"></span>
          <button class="hbtn small" id="ar-datasheet" data-tip="Periodic table and constants">📋 Data sheet</button>
        </div>
        <article class="ar-q card">
          <div class="ar-qmeta">${topicChip(q.topic)}${q.revisit ? '<span class="ar-tag">↺ you missed this before</span>' : ''}${q.src === 'gen' ? '<span class="ar-tag" data-tip="Generated with new numbers each time">∞ generated</span>' : ''}</div>
          <div class="ar-stem">${q.stem}</div>
          ${figHTML(q)}
          ${q.type === 'mech' ? '<div class="ar-mech" id="ar-mech"></div>' : choicesHTML(q, S.picked, S.done)}
          <div class="ar-hint ${S.hinted && !S.done ? '' : 'hidden'}" id="ar-hint">💡 ${q.hint || 'No hint for this one.'}</div>
          <div class="ar-feedback ${S.done ? '' : 'hidden'}" id="ar-fb">${S.done ? feedbackHTML(q, S) : ''}</div>
          <div class="btn-row ar-actions">
            ${q.type === 'mech' && !S.done ? '<button class="hbtn accent" id="ar-check">Check arrows</button>' : ''}
            ${q.type === 'mech' && !S.done && S.mechTries ? '<button class="hbtn" id="ar-giveup">Show answer</button>' : ''}
            ${!S.done && !S.hinted ? '<button class="hbtn" id="ar-hintbtn" data-tip="Keyboard: H">💡 Hint</button>' : ''}
            ${S.done ? '<button class="hbtn accent" id="ar-next" data-tip="Keyboard: Enter">Next question →</button>' : ''}
            ${S.done && q.gen ? '<button class="hbtn" id="ar-again" data-tip="Same kind of question with new numbers">🔁 Another like this</button>' : ''}
          </div>
          <div class="small dim ar-keys">${q.type === 'mech' ? '' : 'Keys: A–D or 1–4 to answer · H hint · Enter next'}</div>
        </article>
      </div>`;
    const Pg = page();
    Pg.querySelector('#ar-end').addEventListener('click', endPractice);
    Pg.querySelector('#ar-datasheet').addEventListener('click', showDataSheet);
    Pg.querySelectorAll('.ar-choice').forEach((b) => b.addEventListener('click', () => answerPractice(+b.dataset.i)));
    const hb = Pg.querySelector('#ar-hintbtn');
    if (hb) hb.addEventListener('click', () => { S.hinted = true; renderPractice(); });
    const nb = Pg.querySelector('#ar-next');
    if (nb) { nb.addEventListener('click', () => { nextPractice(); renderPractice(); }); nb.focus(); }
    const ab = Pg.querySelector('#ar-again');
    if (ab) ab.addEventListener('click', () => { nextPractice(q.gen); renderPractice(); });
    if (q.type === 'mech') mountMech(Pg.querySelector('#ar-mech'), q, S);
  }

  function mountMech(host, q, S) {
    if (!rdkitOK()) { host.innerHTML = '<p class="dim">Waiting for RDKit to load…</p>'; return; }
    const ctl = ArenaMech.mount(host, q.item);
    if (S.arrows) ctl.setArrows(S.arrows);
    ctl.onChange = (arrows) => { S.arrows = arrows; };
    practice.mech = ctl;
    if (S.done) { ctl.check(); if (!S.firstTry) ctl.showAnswer(); ctl.lock(); return; }
    const cb = page().querySelector('#ar-check');
    cb.addEventListener('click', () => {
      if (!ctl.arrows.length) { toast('Draw at least one arrow first', true); return; }
      const res = ctl.check();
      S.mechTries++;
      if (S.firstTry === null) S.firstTry = res.ok;
      if (res.ok) { S.picked = 'ok'; finishPractice(true); return; }
      const fb = page().querySelector('#ar-fb');
      fb.classList.remove('hidden');
      fb.innerHTML = `<div class="ar-verdict bad">Not quite: ${res.good.filter(Boolean).length} of your arrows ${res.good.filter(Boolean).length === 1 ? 'is' : 'are'} right (green)${res.extra ? `, ${res.extra} ${res.extra === 1 ? 'is' : 'are'} wrong (red)` : ''}${res.missing ? `, ${res.missing} missing` : ''}. Fix them and check again, or show the answer.</div>`;
      if (S.mechTries === 1) renderMechButtons();
    });
  }
  function renderMechButtons() {
    const row = page().querySelector('.ar-actions');
    if (row.querySelector('#ar-giveup')) return;
    const b = document.createElement('button');
    b.className = 'hbtn'; b.id = 'ar-giveup'; b.textContent = 'Show answer';
    b.addEventListener('click', () => { practice.state.firstTry = false; finishPractice(false, true); });
    row.insertBefore(b, row.children[1] || null);
  }

  function answerPractice(i) {
    const P = practice, S = P.state;
    if (S.done || P.q.type === 'mech') return;
    S.picked = i;
    finishPractice(i === P.q.answer);
  }
  function finishPractice(correct, gaveUp) {
    const P = practice, S = P.state, q = P.q;
    if (q.type === 'mech') { S.solved = correct && !gaveUp; correct = !!S.firstTry && !gaveUp; }
    S.done = true; S.correct = correct;
    P.n++; if (correct) { P.correct++; P.streak++; } else P.streak = 0;
    stats.bestStreak = Math.max(stats.bestStreak || 0, P.streak);
    const bt = (P.byTopic[q.topic] = P.byTopic[q.topic] || { n: 0, ok: 0 });
    bt.n++; if (correct) bt.ok++;
    P.log.push({ id: q.id, topic: q.topic, correct, hinted: S.hinted });
    record(q, correct);
    saveStats();
    renderPractice();
  }
  function feedbackHTML(q, S) {
    const ok = S.correct;
    const yours = q.type === 'mech' ? '' : S.picked !== null && !ok ? ` You chose ${LETTERS[S.picked]}; the answer is ${LETTERS[q.answer]}.` : '';
    const verdict = ok ? '✔ Correct!' : S.solved ? '✔ Correct now. It took more than one try, so it counts as a miss in your statistics.' : '✘ Not this time.';
    return `<div class="ar-verdict ${ok || S.solved ? 'good' : 'bad'}">${verdict}${yours}${S.hinted ? ' <span class="dim">(with a hint)</span>' : ''}</div>
      <div class="ar-explain">${q.explain || ''}</div>`;
  }
  function endPractice() {
    const P = practice;
    practice = null;
    if (!P || !P.n) { location.hash = '#arena'; return; }
    openModal('Practice session', `
      <p>You answered <b>${P.n}</b> questions and got <b>${P.correct}</b> right (${Math.round(100 * P.correct / P.n)}%).</p>
      <table class="data-table"><tr><th>Topic</th><th>Answered</th><th>Correct</th></tr>
      ${Object.entries(P.byTopic).map(([t, v]) => `<tr><td>${TOPIC[t].icon} ${TOPIC[t].label}</td><td>${v.n}</td><td>${v.ok} (${Math.round(100 * v.ok / v.n)}%)</td></tr>`).join('')}</table>
      <p class="small dim">Your topic statistics were updated, and any questions you missed will come back in later practice.</p>`);
    location.hash = '#arena';
  }

  /* ======================================================================
     EXAM
     ====================================================================== */
  async function startExam(kind, seed) {
    const X = EXAMS[kind];
    await loadElements();
    const qs = buildExam(X.n, seed);
    exam = { kind, label: X.label, seed, minutes: X.min, startedAt: Date.now(), qs, answers: {}, flags: {}, cur: 0 };
    saveExam();
    location.hash = '#arena/exam';
    if (sub()[0] === 'exam') renderExam();
  }
  const saveExam = () => ChemStore.put('quiz', 'exam-inprogress', exam).catch((e) => warn('arena', 'Could not save exam progress', e));
  const timeLeft = () => exam.minutes * 60 - (Date.now() - exam.startedAt) / 1000;

  function renderExam() {
    renderSeq++;
    const E = exam, q = E.qs[E.cur];
    document.title = `ChemSim · Exam ${E.cur + 1}/${E.qs.length}`;
    const answered = Object.keys(E.answers).length;
    page().innerHTML = `
      <div class="ar-session exam">
        <div class="ar-head">
          <b>${esc(E.label)}</b><span class="dim small">code ${E.seed}</span>
          <span class="ar-timer" id="ar-timer"></span>
          <span class="small dim">${answered}/${E.qs.length} answered</span>
          <span class="lab-spacer"></span>
          <button class="hbtn small" id="ar-datasheet">📋 Data sheet</button>
          <button class="hbtn small" id="ar-pause" data-tip="Leave the exam; the timer keeps running and you can resume from the Arena home">⏸ Leave</button>
          <button class="hbtn small accent" id="ar-submit">Submit exam</button>
        </div>
        <div class="ar-exam-body">
          <nav class="ar-nav">${E.qs.map((x, i) => `<button class="ar-navb${i === E.cur ? ' cur' : ''}${E.answers[i] !== undefined ? ' done' : ''}${E.flags[i] ? ' flag' : ''}" data-go="${i}" data-tip="${TOPIC[x.topic].label}">${i + 1}</button>`).join('')}</nav>
          <article class="ar-q card">
            <div class="ar-qmeta"><span class="ar-qnum">Question ${E.cur + 1}</span>${topicChip(q.topic)}</div>
            <div class="ar-stem">${q.stem}</div>
            ${figHTML(q)}
            ${choicesHTML(q, E.answers[E.cur], false)}
            <div class="btn-row ar-actions">
              <button class="hbtn" id="ar-prev" ${E.cur === 0 ? 'disabled' : ''}>← Previous</button>
              <button class="hbtn${E.flags[E.cur] ? ' accent' : ''}" id="ar-flag" data-tip="Mark this question to come back to (F)">⚑ ${E.flags[E.cur] ? 'Flagged' : 'Flag'}</button>
              ${E.answers[E.cur] !== undefined ? '<button class="hbtn" id="ar-clear">Clear answer</button>' : ''}
              <button class="hbtn accent" id="ar-nextq" ${E.cur === E.qs.length - 1 ? 'disabled' : ''}>Next →</button>
            </div>
            <div class="small dim ar-keys">Keys: A–D or 1–4 answer · ← → move · F flag</div>
          </article>
        </div>
      </div>`;
    const Pg = page();
    Pg.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { E.cur = +b.dataset.go; renderExam(); }));
    Pg.querySelectorAll('.ar-choice').forEach((b) => b.addEventListener('click', () => answerExam(+b.dataset.i)));
    Pg.querySelector('#ar-prev').addEventListener('click', () => moveExam(-1));
    Pg.querySelector('#ar-nextq').addEventListener('click', () => moveExam(1));
    Pg.querySelector('#ar-flag').addEventListener('click', toggleFlag);
    const cl = Pg.querySelector('#ar-clear');
    if (cl) cl.addEventListener('click', () => { delete E.answers[E.cur]; saveExam(); renderExam(); });
    Pg.querySelector('#ar-datasheet').addEventListener('click', showDataSheet);
    Pg.querySelector('#ar-pause').addEventListener('click', () => { saveExam(); exam = null; location.hash = '#arena'; });
    Pg.querySelector('#ar-submit').addEventListener('click', () => {
      const left = E.qs.length - Object.keys(E.answers).length;
      if (!confirm(left ? `You have ${left} unanswered question${left > 1 ? 's' : ''} (they score zero, like a wrong answer). Submit anyway?` : 'Submit your exam?')) return;
      submitExam();
    });
    startTimer();
  }
  function answerExam(i) { exam.answers[exam.cur] = i; saveExam(); renderExam(); }
  function moveExam(d) { const n = exam.cur + d; if (n < 0 || n >= exam.qs.length) return; exam.cur = n; renderExam(); }
  function toggleFlag() { exam.flags[exam.cur] = !exam.flags[exam.cur]; saveExam(); renderExam(); }
  function startTimer() {
    stopTimer();
    const tick = () => {
      const el = root.querySelector('#ar-timer');
      if (!exam || !el) { stopTimer(); return; }
      const t = timeLeft();
      el.textContent = '⏱ ' + U.clock(t);
      el.classList.toggle('low', t < 300);
      if (t <= 0) { stopTimer(); toast('Time is up! Your exam has been submitted.'); submitExam(); }
    };
    tick();
    timer = setInterval(tick, 1000);
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }

  async function submitExam() {
    const E = exam;
    stopTimer();
    await loadStats();
    let score = 0;
    const byTopic = {};
    const items = E.qs.map((q, i) => {
      const a = E.answers[i], ok = a === q.answer;
      if (ok) score++;
      const t = (byTopic[q.topic] = byTopic[q.topic] || { n: 0, ok: 0 });
      t.n++; if (ok) t.ok++;
      record(q, ok);
      return { ...q, picked: a === undefined ? null : a, ok };
    });
    await saveStats();
    const res = { kind: 'exam', label: E.label, seed: E.seed, total: E.qs.length, score, byTopic, startedAt: new Date(E.startedAt).toISOString(), finishedAt: new Date().toISOString(), secondsUsed: Math.min(E.minutes * 60, Math.round((Date.now() - E.startedAt) / 1000)), minutes: E.minutes, items };
    const key = 'exam-' + Date.now();
    try { await ChemStore.put('quiz', key, res); await ChemStore.remove('quiz', 'exam-inprogress'); }
    catch (e) { warn('arena', 'Could not save the exam', e); }
    lastResult = res;
    exam = null;
    location.hash = '#arena/review/' + key;
  }

  /* ---------------- results + review ---------------- */
  async function renderReview(key) {
    const seq = ++renderSeq;
    let res = lastResult;
    if (key) { try { res = (await ChemStore.get('quiz', key)) || res; } catch (e) { warn('arena', e); } }
    if (seq !== renderSeq) return;
    if (!res) { location.hash = '#arena'; return; }
    document.title = 'ChemSim · Exam results';
    const pct = Math.round(100 * res.score / res.total);
    const rows = B.TOPICS.filter((t) => res.byTopic[t.id]).map((t) => {
      const v = res.byTopic[t.id], p = Math.round(100 * v.ok / v.n);
      return `<tr><td>${t.icon} ${t.label}</td><td>${v.ok}/${v.n}</td><td><div class="ar-bar"><span style="width:${p}%;background:${p >= 75 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--err)'}"></span></div></td></tr>`;
    }).join('');
    page().innerHTML = `
      <div class="ar-home ar-review">
        <div class="ar-head flat"><button class="hbtn small" id="ar-home">← Arena</button><span class="lab-spacer"></span>
          <label class="small ar-opt"><input type="checkbox" id="ar-onlywrong" /> Show only questions I missed</label></div>
        <div class="ar-cards">
          <section class="card ar-score">
            <div class="ar-big">${res.score}<span>/${res.total}</span></div>
            <div class="ar-bigpct">${pct}%</div>
            <p class="small dim">${esc(res.label)} · code ${res.seed} · ${U.clock(res.secondsUsed)} of ${res.minutes} min used · ${new Date(res.finishedAt).toLocaleString()}</p>
            <p class="small">${pct >= 80 ? 'Excellent: that’s a strong local-section score.' : pct >= 60 ? 'A solid result. Drill the weaker topics below.' : pct >= 40 ? 'A good base. Practice mode with “focus on weak topics” will target the gaps.' : 'Keep going: use Practice mode with hints, then try again.'}</p>
          </section>
          <section class="card"><h2>By topic</h2><table class="data-table ar-bt">${rows}</table></section>
        </div>
        <div id="ar-items">${res.items.map((q, i) => reviewItem(q, i)).join('')}</div>
      </div>`;
    const Pg = page();
    Pg.querySelector('#ar-home').addEventListener('click', () => { location.hash = '#arena'; });
    Pg.querySelector('#ar-onlywrong').addEventListener('change', (e) => Pg.querySelectorAll('.ar-ritem.right').forEach((x) => x.classList.toggle('hidden', e.target.checked)));
  }
  function reviewItem(q, i) {
    const status = q.picked === null ? 'unanswered' : q.ok ? 'right' : 'wrong';
    return `<article class="card ar-q ar-ritem ${q.ok ? 'right' : 'missed'}">
      <div class="ar-qmeta"><span class="ar-qnum">Question ${i + 1}</span>${topicChip(q.topic)}<span class="ar-rstat ${status}">${status === 'right' ? '✔ correct' : status === 'wrong' ? `✘ you chose ${LETTERS[q.picked]}` : '— not answered'}</span></div>
      <div class="ar-stem">${q.stem}</div>${figHTML(q)}${choicesHTML(q, q.picked, true)}
      <div class="ar-explain">${q.explain || ''}</div></article>`;
  }

  /* ======================================================================
     data sheet (like the one printed on the exam)
     ====================================================================== */
  async function showDataSheet() {
    await loadElements();
    const els = (typeof WikiData !== 'undefined' && WikiData.elements) || [];
    const cells = els.filter((e) => e.z <= 118).map((e) => {
      const m = e.mass < 100 ? e.mass.toFixed(2) : e.mass.toFixed(1);
      return `<div class="ds-cell" style="grid-column:${e.x};grid-row:${e.y}"><span class="ds-z">${e.z}</span><b>${e.sym}</b><span class="ds-m">${e.radioactive ? `(${Math.round(e.mass)})` : m}</span></div>`;
    }).join('');
    openModal('Data sheet', `
      <div class="ds-grid">${cells || '<p class="dim">Element data is loading…</p>'}</div>
      <table class="data-table ds-consts">
        <tr><td>Gas constant</td><td>R = 8.314 J mol⁻¹ K⁻¹ = 0.08206 L atm mol⁻¹ K⁻¹</td></tr>
        <tr><td>Faraday constant</td><td>F = 96 485 C mol⁻¹</td></tr>
        <tr><td>Avogadro constant</td><td>N<sub>A</sub> = 6.022 × 10²³ mol⁻¹</td></tr>
        <tr><td>Planck constant · speed of light</td><td>h = 6.626 × 10⁻³⁴ J s · c = 2.998 × 10⁸ m s⁻¹</td></tr>
        <tr><td>Water</td><td>K<sub>w</sub> = 1.0 × 10⁻¹⁴ (25 °C) · c = 4.184 J g⁻¹ K⁻¹</td></tr>
        <tr><td>Pressure</td><td>1 atm = 101.325 kPa = 760 mmHg = 760 torr · 1 bar = 100 kPa</td></tr>
        <tr><td>Temperature</td><td>0 °C = 273.15 K</td></tr>
        <tr><td>Electrochemistry (25 °C)</td><td>E = E° − (0.0592 V / n) log Q · ΔG° = −nFE° · ΔG° = −RT ln K</td></tr>
        <tr><td>Kinetics</td><td>ln[A] = ln[A]₀ − kt · t<sub>½</sub> = 0.693/k · ln(k₂/k₁) = (Eₐ/R)(1/T₁ − 1/T₂)</td></tr>
        <tr><td>Hydrogen atom</td><td>1/λ = R<sub>H</sub>(1/n₁² − 1/n₂²), R<sub>H</sub> = 1.097 × 10⁷ m⁻¹</td></tr>
      </table>`);
  }
  function openModal(title, html) {
    root.querySelector('#ar-modal-title').textContent = title;
    root.querySelector('#ar-modal-body').innerHTML = html;
    root.querySelector('#ar-modal').classList.remove('hidden');
  }
  function closeModal() { root.querySelector('#ar-modal').classList.add('hidden'); }

  /* ---------------- keyboard ---------------- */
  function onKey(e) {
    if (!ChemRouter.isActive('arena') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'Escape' && !root.querySelector('#ar-modal').classList.contains('hidden')) { closeModal(); return; }
    const s = sub()[0];
    const k = e.key.toUpperCase();
    const idx = '1234'.indexOf(e.key) >= 0 ? +e.key - 1 : 'ABCD'.indexOf(k);
    if (s === 'practice' && practice) {
      const S = practice.state;
      if (idx >= 0 && !S.done && practice.q.type !== 'mech' && idx < practice.q.choices.length) { e.preventDefault(); answerPractice(idx); }
      else if (k === 'H' && !S.done) { S.hinted = true; renderPractice(); }
      else if ((e.key === 'Enter' || k === 'N') && S.done) { e.preventDefault(); nextPractice(); renderPractice(); }
    } else if (s === 'exam' && exam) {
      if (idx >= 0 && idx < exam.qs[exam.cur].choices.length) { e.preventDefault(); answerExam(idx); }
      else if (e.key === 'ArrowRight') moveExam(1);
      else if (e.key === 'ArrowLeft') moveExam(-1);
      else if (k === 'F') toggleFlag();
    }
  }

  /* ---------------- start-up ---------------- */
  let elementsPromise = null;
  function loadElements() {
    if (typeof WikiData === 'undefined') return Promise.resolve();
    if (!elementsPromise) elementsPromise = WikiData.load().catch((e) => { warn('arena', 'Element data did not load; element questions are skipped', e); elementsPromise = null; });
    return elementsPromise;
  }

  ChemRouter.register('arena', {
    title: 'Challenge Arena',
    init() {
      build();
      loadElements();
      // structure pictures, naming and mechanisms need RDKit: redraw once it arrives
      loadRDKit().then(() => {
        if (!ChemRouter.isActive('arena')) return;
        const s = sub()[0];
        if (s === 'practice' && practice) renderPractice();
        else if (s === 'exam' && exam) renderExam();
      }).catch((e) => warn('arena', 'RDKit did not load; structure questions are skipped', e));
    },
    show,
    hide() { stopTimer(); if (exam) saveExam(); },
  });

  return {
    buildExam, practiceQuestion, pickTopic, accuracy, loadElements,
    get stats() { return stats; }, get practice() { return practice; }, get exam() { return exam; },
    startPractice, startExam, submitExam, EXAMS,
  };
})();

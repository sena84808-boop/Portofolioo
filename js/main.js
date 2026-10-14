/* =========================================================
   Toy Story Portfolio - main.js (JavaScript murni)
   Semua konten dibaca dari data/data.json
   ========================================================= */
(() => {
    'use strict';

    const DATA_URL = 'data/data.json';
    const FALLBACK_IMG = 'images/placeholder.svg';
    const AVATAR_FALLBACK = 'images/profile/WhatsApp Image 2026-10-14 at 11.47.38.jpeg';

    /* ---------- Helper ---------- */
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const validUrl = (u) => typeof u === 'string' && u.trim() !== '' && u.trim() !== '#';

    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
    };

    const state = { data: null, lastFocus: null, activeFilter: 'Semua' };

    /* ---------- Suara (Web Audio API bawaan browser) ---------- */
    const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5 };
    const PATTERNS = {
        laser: [['C6', 0], ['G5', 0.07]],
        pop:   [['E5', 0]],
        beeps: [['A5', 0], ['C6', 0.1]],
        win:   [['C5', 0], ['E5', 0.1], ['G5', 0.2], ['C6', 0.3]]
    };

    const Sound = {
        ctx: null,
        muted: store.get('toy-muted') === '1',

        unlock() {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return false;
            if (!this.ctx) this.ctx = new AC();
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return true;
        },

        beep(freq, delay, duration = 0.12) {
            const t = this.ctx.currentTime + delay;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
            osc.connect(gain).connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + duration + 0.02);
        },

        play(type) {
            if (this.muted || !this.unlock()) return;
            (PATTERNS[type] || []).forEach(([note, delay]) => this.beep(NOTE[note], delay));
        },

        toggle() {
            this.muted = !this.muted;
            store.set('toy-muted', this.muted ? '1' : '0');
            renderSoundButton();
            if (!this.muted) this.play('pop');
        }
    };

    function renderSoundButton() {
        const btn = $('#sound-toggle');
        btn.textContent = Sound.muted ? '🔇' : '🔊';
        btn.setAttribute('aria-pressed', String(Sound.muted));
        btn.setAttribute('aria-label', Sound.muted ? 'Nyalakan suara efek' : 'Matikan suara efek');
    }

    /* ---------- Toast ---------- */
    let toastTimer;
    function toast(message, type = 'info') {
        const el = $('#toast');
        el.textContent = message;
        el.classList.toggle('error', type === 'error');
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
    }

    /* ---------- Binding teks: data-text="path.ke.data" ---------- */
    function bindText(data) {
        $$('[data-text]').forEach((el) => {
            const value = getPath(data, el.dataset.text);
            if (value != null) el.textContent = value;
        });
    }

    /* ---------- Navigasi ---------- */
    function renderNav(items) {
        $('#brand-initial').textContent = state.data.brand.initial;
        $('#nav-links').innerHTML = items.map((i) => `
            <a href="${esc(i.href)}" class="nav-link ${i.cta ? 'nav-cta' : ''}" data-sound="pop">${esc(i.label)}</a>`).join('');
    }

    function setupMenu() {
        const toggle = $('#menu-toggle');
        const nav = $('#nav-links');
        const setOpen = (open) => {
            nav.classList.toggle('open', open);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.textContent = open ? '✕' : '☰';
            toggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
        };
        toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
        nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
        // Tutup menu saat tap di luar menu atau menekan Esc
        document.addEventListener('click', (e) => {
            if (nav.classList.contains('open') && !e.target.closest('.nav-box')) setOpen(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); toggle.focus(); }
        });
        // Reset saat layar melebar (mis. HP diputar)
        const wide = matchMedia('(min-width: 640px)');
        if (wide.addEventListener) wide.addEventListener('change', (m) => { if (m.matches) setOpen(false); });
    }

    /* Tandai link nav sesuai section yang sedang dilihat */
    function setupScrollSpy() {
        const links = $$('#nav-links a');
        const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
        const spy = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
            });
        }, { rootMargin: '-40% 0px -55% 0px' });
        sections.forEach((s) => spy.observe(s));
    }

    /* ---------- Diri Saya ---------- */
    function renderProfile(pf) {
        // Foto (otomatis memakai gambar cadangan bila file foto belum ada)
        const img = $('#pf-photo');
        img.alt = pf.photoAlt || '';
        img.onerror = () => { img.onerror = null; img.src = AVATAR_FALLBACK; };
        img.src = pf.photo || AVATAR_FALLBACK;

        // Perkenalan: **kata** ditampilkan sebagai teks yang di-highlight (aman: teks di-escape dulu)
        $('#pf-intro-text').innerHTML = esc(pf.intro).replace(/\*\*(.+?)\*\*/g, '<strong class="pf-em">$1</strong>');

        const chips = (items) => items.map((i) =>
            `<span class="pf-chip"><span aria-hidden="true">${esc(i.icon)}</span> ${esc(i.label)}</span>`).join('');

        const timeline = (items) => `
            <ol class="timeline">
                ${items.map((i) => `
                    <li class="tl-item">
                        <span class="tl-period">${esc(i.period)}</span>
                        <h4 class="tl-title">${esc(i.title)}</h4>
                        <p class="tl-place">${esc(i.place)}</p>
                        ${i.desc ? `<p class="tl-desc">${esc(i.desc)}</p>` : ''}
                        ${i.points && i.points.length ? `<ul class="tl-points">${i.points.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
                    </li>`).join('')}
            </ol>`;

        $('#pf-body').innerHTML = `
            <div class="pf-grid">
                <section class="pf-box">
                    <h3 class="pf-box-title">${esc(pf.hobbies.title)}</h3>
                    <p class="pf-text">${esc(pf.hobbies.text)}</p>
                    <div class="pf-chips">${chips(pf.hobbies.items)}</div>
                </section>
                <section class="pf-box">
                    <h3 class="pf-box-title">${esc(pf.traits.title)}</h3>
                    <p class="pf-text">${esc(pf.traits.text)}</p>
                    <ul class="traits">
                        ${pf.traits.items.map((t) => `
                            <li class="trait">
                                <span class="trait-icon" aria-hidden="true">${esc(t.icon)}</span>
                                <div>
                                    <p class="trait-name">${esc(t.label)}</p>
                                    <p class="trait-desc">${esc(t.desc)}</p>
                                </div>
                            </li>`).join('')}
                    </ul>
                </section>
            </div>
            <div class="pf-grid">
                <section class="pf-box">
                    <h3 class="pf-box-title">${esc(pf.education.title)}</h3>
                    ${timeline(pf.education.items)}
                </section>
                <section class="pf-box">
                    <h3 class="pf-box-title">${esc(pf.experience.title)}</h3>
                    ${timeline(pf.experience.items)}
                </section>
            </div>`;
    }

    /* ---------- Skills ---------- */
    function renderSkills(skills) {
        const grid = $('#skills-grid');
        const cta = state.data.skillsSection.cardCta || 'Lihat detail';
        grid.innerHTML = skills.map((s) => `
            <a class="skill-card" href="#/skill/${esc(s.id)}" data-sound="beeps" aria-label="${esc(s.title)}: buka penjelasan skill">
                <div class="skill-icon" aria-hidden="true">${esc(s.icon)}</div>
                <h3 class="skill-title">${esc(s.title)}</h3>
                <p class="skill-desc">${esc(s.description)}</p>
                <div class="skill-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"
                     aria-valuenow="${Number(s.level)}" aria-label="Level ${esc(s.title)}">
                    <div class="skill-bar" data-level="${Number(s.level)}"></div>
                </div>
                <p class="skill-percent">${Number(s.level)}%</p>
                <span class="skill-more">${esc(cta)}</span>
            </a>`).join('');

        // Isi bar saat terlihat di layar
        const barObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.style.width = `${entry.target.dataset.level}%`;
                obs.unobserve(entry.target);
            });
        }, { threshold: 0.4 });
        $$('.skill-bar', grid).forEach((b) => barObserver.observe(b));
    }

    /* ---------- Proyek + filter ---------- */
    function renderFilters(projects) {
        const categories = ['Semua', ...new Set(projects.map((p) => p.category))];
        const box = $('#project-filters');
        box.innerHTML = categories.map((c) => `
            <button type="button" class="filter-btn ${c === state.activeFilter ? 'active' : ''}"
                    data-filter="${esc(c)}" data-sound="pop" aria-pressed="${c === state.activeFilter}">${esc(c)}</button>`).join('');

        box.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-btn');
            if (!btn) return;
            state.activeFilter = btn.dataset.filter;
            $$('.filter-btn', box).forEach((b) => {
                const on = b === btn;
                b.classList.toggle('active', on);
                b.setAttribute('aria-pressed', String(on));
            });
            applyFilter();
        });
    }

    function applyFilter() {
        let visible = 0;
        $$('.project-card').forEach((card) => {
            const show = state.activeFilter === 'Semua' || card.dataset.category === state.activeFilter;
            card.classList.toggle('is-hidden', !show);
            if (show) visible++;
        });
        $('#projects-empty').classList.toggle('hidden', visible > 0);
    }

    const chipsHTML = (tags) => tags.map((t) => `<span class="chip chip-${esc(t.color)}">${esc(t.label)}</span>`).join('');

    function renderProjects(projects) {
        const grid = $('#projects-grid');
        grid.innerHTML = projects.map((p) => `
            <article class="project-card theme-${esc(p.theme)}" data-category="${esc(p.category)}">
                <div>
                    <div class="project-head">
                        <span class="project-emoji" aria-hidden="true">${esc(p.emoji)}</span>
                        <span class="project-badge">${esc(p.category.toUpperCase())}</span>
                    </div>
                    <div class="project-body">
                        <h3 class="project-title">${esc(p.title)}</h3>
                        <p class="project-summary">${esc(p.summary)}</p>
                    </div>
                </div>
                <div class="project-foot">
                    <div class="chips">${chipsHTML(p.tags)}</div>
                    <button type="button" class="project-btn" data-project="${esc(p.id)}">Buka Mainan</button>
                </div>
            </article>`).join('');

        renderFilters(projects);
        applyFilter();

        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-project]');
            if (!btn) return;
            const project = state.data.projects.find((p) => p.id === btn.dataset.project);
            if (project) openModal(project, btn);
        });
    }

    /* ---------- Modal ---------- */
    function openModal(p, trigger) {
        Sound.play('pop');
        state.lastFocus = trigger || document.activeElement;

        const img = $('#modal-img');
        img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMG; };
        img.src = p.image || FALLBACK_IMG;
        img.alt = `Pratinjau ${p.title}`;

        $('#modal-category').textContent = p.category.toUpperCase();
        $('#modal-title').textContent = p.title;
        $('#modal-desc').textContent = p.detail;
        $('#modal-tags').innerHTML = chipsHTML(p.tags);

        [['#modal-demo', p.demo], ['#modal-repo', p.repo]].forEach(([sel, url]) => {
            const a = $(sel);
            const ok = validUrl(url);
            a.classList.toggle('hidden', !ok);
            if (ok) a.href = url; else a.removeAttribute('href');
        });

        try { history.pushState({ modal: true }, ''); } catch (e) { /* abaikan */ } // tombol Back HP menutup modal
        $('#project-modal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        $('#modal-close').focus();
    }

    function hideModal() {
        const modal = $('#project-modal');
        if (modal.classList.contains('hidden')) return;
        Sound.play('pop');
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    }

    function closeModal() {
        if ($('#project-modal').classList.contains('hidden')) return;
        // Modal dibuka dengan entri riwayat, jadi kembali satu langkah (sama seperti tombol Back HP)
        if (history.state && history.state.modal) history.back();
        else hideModal();
    }

    function setupModal() {
        const modal = $('#project-modal');
        $('#modal-close').addEventListener('click', closeModal);
        $('#modal-x').addEventListener('click', closeModal);
        window.addEventListener('popstate', hideModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', (e) => {
            if (modal.classList.contains('hidden')) return;
            if (e.key === 'Escape') return closeModal();
            if (e.key === 'Tab') { // fokus tetap di dalam modal
                const f = $$('a[href], button:not([disabled])', modal).filter((el) => el.offsetParent !== null);
                if (!f.length) return;
                const first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
    }

    /* ---------- Halaman detail skill (rute #/skill/<id>) ---------- */
    const SKILL_ROUTE = /^#\/skill\/([\w-]+)$/;
    const view = { current: null, homeScroll: 0, fromHome: false };
    const baseTitle = document.title;
    const INSTANT = { behavior: 'instant' };

    function skillPageHTML(skill, idx) {
        const L = state.data.skillPage.labels;
        const list = state.data.skills;
        const prev = list[(idx - 1 + list.length) % list.length];
        const next = list[(idx + 1) % list.length];
        const pg = skill.page;
        const level = Number(skill.level);

        return `
            <div class="sp-top">
                <button type="button" class="btn btn-sm btn-light" data-skill-back data-sound="pop">${esc(L.back)}</button>
            </div>

            <header class="sp-hero">
                <div class="sp-icon" aria-hidden="true">${esc(skill.icon)}</div>
                <div>
                    <span class="tag-lime">${esc(L.badge)}</span>
                    <h2 class="sp-title" id="sp-title" tabindex="-1">${esc(skill.title)}</h2>
                    <p class="sp-tagline">${esc(pg.tagline)}</p>
                </div>
            </header>

            <div class="sp-level">
                <p class="sp-level-label">${esc(L.level)}: <b>${level}%</b></p>
                <div class="skill-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"
                     aria-valuenow="${level}" aria-label="${esc(L.level)} ${esc(skill.name)}">
                    <div class="skill-bar" data-level="${level}"></div>
                </div>
            </div>

            <section class="sp-block">
                <h3 class="sp-heading">${esc(L.about.replace('{name}', skill.name))}</h3>
                <p class="sp-text">${esc(pg.overview)}</p>
            </section>

            <section class="sp-block">
                <h3 class="sp-heading">${esc(L.tools)}</h3>
                <div class="tool-grid">
                    ${pg.tools.map((t) => `
                        <div class="tool">
                            <h4 class="tool-name">${esc(t.name)}</h4>
                            <p class="tool-note">${esc(t.note)}</p>
                        </div>`).join('')}
                </div>
            </section>

            <section class="sp-block">
                <h3 class="sp-heading">${esc(L.benefits)}</h3>
                <ul class="benefit-list">
                    ${pg.benefits.map((b) => `
                        <li class="benefit">
                            <span class="benefit-check" aria-hidden="true">✓</span>
                            <div>
                                <p class="benefit-title">${esc(b.title)}</p>
                                <p class="benefit-text">${esc(b.text)}</p>
                            </div>
                        </li>`).join('')}
                </ul>
            </section>

            <section class="sp-block">
                <h3 class="sp-heading">${esc(L.flow)}</h3>
                <ol class="flow">${pg.flow.map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ol>
            </section>

            <nav class="sp-nav" aria-label="Skill lainnya">
                <a href="#/skill/${esc(prev.id)}" class="btn btn-sm btn-light" data-skill-go="${esc(prev.id)}" data-sound="pop"
                   aria-label="${esc(L.prev)}: ${esc(prev.name)}">← ${esc(prev.name)}</a>
                <a href="#/skill/${esc(next.id)}" class="btn btn-sm btn-light" data-skill-go="${esc(next.id)}" data-sound="pop"
                   aria-label="${esc(L.next)}: ${esc(next.name)}">${esc(next.name)} →</a>
            </nav>
            <a href="#projects" class="btn btn-yellow sp-cta" data-sound="laser">${esc(L.cta)}</a>`;
    }

    function showSkill(id) {
        const idx = state.data.skills.findIndex((s) => s.id === id);
        if (idx < 0) { // id tidak dikenal -> kembali ke daftar skill
            try { history.replaceState(null, '', '#skills'); } catch (e) { /* abaikan */ }
            return showHome();
        }
        const skill = state.data.skills[idx];
        if (view.current === 'home') { view.homeScroll = window.scrollY; view.fromHome = true; }

        const page = $('#skill-page');
        page.innerHTML = skillPageHTML(skill, idx);
        $('#home-view').classList.add('hidden');
        $('#skill-view').classList.remove('hidden');
        view.current = 'skill';
        document.title = `${skill.name} • ${state.data.brand.name}`;
        $$('#nav-links a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#skills'));

        window.scrollTo(Object.assign({ top: 0 }, INSTANT));
        $('#sp-title').focus({ preventScroll: true });
        // Animasikan bar level setelah halaman tampil
        requestAnimationFrame(() => requestAnimationFrame(() => {
            $$('.skill-bar', page).forEach((b) => { b.style.width = `${b.dataset.level}%`; });
        }));
    }

    function showHome() {
        const was = view.current;
        $('#skill-view').classList.add('hidden');
        $('#home-view').classList.remove('hidden');
        view.current = 'home';
        document.title = baseTitle;

        const hash = decodeURIComponent(location.hash.slice(1));
        const target = hash ? document.getElementById(hash) : null;
        if (was === 'skill' || (was === null && target)) {
            if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
            else window.scrollTo(Object.assign({ top: view.homeScroll }, INSTANT)); // kembali ke posisi semula
        }
    }

    function route() {
        const m = location.hash.match(SKILL_ROUTE);
        if (m) showSkill(m[1]); else showHome();
    }

    // Pindah antar skill tanpa menumpuk riwayat, supaya tombol Kembali tetap ke daftar skill
    function goSkill(id) {
        try { history.replaceState(history.state, '', `#/skill/${id}`); }
        catch (e) { location.hash = `/skill/${id}`; return; }
        showSkill(id);
    }

    function goBack() {
        if (view.fromHome && history.length > 1) history.back();
        else location.hash = 'skills';
    }

    function setupSkillPage() {
        $('#skill-page').addEventListener('click', (e) => {
            if (e.target.closest('[data-skill-back]')) return goBack();
            const go = e.target.closest('[data-skill-go]');
            if (go) { e.preventDefault(); goSkill(go.dataset.skillGo); }
        });
        window.addEventListener('hashchange', route);
    }

    /* ---------- Woody ---------- */
    function setupWoody(quotes) {
        let last = -1;
        $('#woody-btn').addEventListener('click', () => {
            Sound.play('laser');
            let i;
            do { i = Math.floor(Math.random() * quotes.length); } while (quotes.length > 1 && i === last);
            last = i;
            $('#quote-text').textContent = quotes[i];
            $('#woody-quote').classList.remove('hidden');
        });
    }

    /* ---------- Mesin capit (kontrol manual) ---------- */
    function setupClaw(claw) {
        const aliensBox = $('#claw-aliens');
        const stage = $('#claw-stage');
        const arm = $('#claw-arm');
        const line = $('#claw-line');
        const head = $('#claw-head');
        const toggleBtn = $('#claw-btn');
        const controls = $('#claw-controls');
        const grabBtn = $('#claw-grab');
        const steerBtn = $('#claw-steer');
        const arrow = $('#steer-arrow');
        const hint = $('#claw-hint');
        const result = $('#claw-result');
        const counter = $('#claw-count');

        const BASE_LINE = 24;  // panjang tali saat diam (px)
        const PAD = 30;        // jarak aman capit dari tepi kiri/kanan (px)
        const STEP = 0.045;    // lompatan posisi per tick (0..1)
        const TICK = 60;       // ms antar tick saat tombol arah ditahan
        let active = false, busy = false, count = 0;
        let pos = 0.5, dir = 1, holdTimer = null;

        const stockFill = $('#claw-stock-fill');
        const leftEl = $('#claw-left');
        const totalEl = $('#claw-total');

        /* --- Stok boneka: tampil SLOTS boneka, sisanya antre dan mengisi slot yang kosong --- */
        const dolls = claw.dolls;
        const TOTAL = dolls.length;
        const SLOTS = Math.min(claw.slots || 3, TOTAL);
        const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
        let slots = [], nextIndex = 0, taken = 0, grandTotal = 0, round = 1;

        function renderSlots() {
            aliensBox.innerHTML = slots.map((dl, i) =>
                `<div class="alien ${dl ? '' : 'is-empty'}" data-slot="${i}">${dl ? esc(dl.emoji) : ''}</div>`).join('');
        }
        function updateStats() {
            const left = TOTAL - taken;
            leftEl.textContent = left;
            totalEl.textContent = TOTAL;
            counter.textContent = grandTotal;
            stockFill.style.width = `${(left / TOTAL) * 100}%`;
        }
        function resetDolls() { // kembali ke susunan awal
            slots = dolls.slice(0, SLOTS);
            nextIndex = SLOTS;
            taken = 0;
            renderSlots();
            updateStats();
        }
        resetDolls();

        const clawX = () => PAD + pos * Math.max(0, stage.clientWidth - PAD * 2);
        const render = () => { arm.style.left = `${clawX()}px`; };
        const setDisabled = (b) => { grabBtn.disabled = b; steerBtn.disabled = b; toggleBtn.disabled = b; };

        /* --- Tombol kanan: arahkan claw (tahan = gerak, berbalik arah di ujung) --- */
        function stepOnce() {
            pos += dir * STEP;
            if (pos >= 1) { pos = 1; dir = -1; }
            else if (pos <= 0) { pos = 0; dir = 1; }
            arrow.textContent = dir > 0 ? '▶' : '◀';
            render();
        }
        function startSteer() {
            if (!active || busy || holdTimer) return;
            steerBtn.classList.add('pressed');
            Sound.play('pop');
            stepOnce();
            holdTimer = setInterval(stepOnce, TICK);
        }
        function stopSteer() {
            clearInterval(holdTimer);
            holdTimer = null;
            steerBtn.classList.remove('pressed');
        }
        steerBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { steerBtn.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
            startSteer();
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => steerBtn.addEventListener(t, stopSteer));
        steerBtn.addEventListener('contextmenu', (e) => e.preventDefault()); // tahan lama di HP tidak memunculkan menu
        steerBtn.addEventListener('click', (e) => { // detail 0 = dari keyboard (Enter/Spasi): geser satu langkah
            if (e.detail === 0 && active && !busy) stepOnce();
        });

        /* --- Tombol kiri: ambil boneka --- */
        async function grab() {
            if (!active || busy) return;
            busy = true;
            stopSteer();
            setDisabled(true);
            Sound.play('beeps');

            // Cari alien yang berada tepat di bawah capit
            const s = stage.getBoundingClientRect();
            const clawCenter = s.left + stage.clientLeft + clawX();
            const els = $$('.alien', aliensBox);
            let target = null, targetRect = els[0].getBoundingClientRect(), best = Infinity;
            els.forEach((el, k) => {
                if (!slots[k]) return; // slot kosong tidak bisa diambil
                const r = el.getBoundingClientRect();
                const dist = Math.abs(r.left + r.width / 2 - clawCenter);
                if (dist < best) { best = dist; target = el; targetRect = r; }
            });
            const hit = target !== null && best <= targetRect.width * 0.6;

            const headH = head.getBoundingClientRect().height;
            const lineHeight = Math.max(BASE_LINE, targetRect.top - s.top - stage.clientTop - headH + 12);

            result.textContent = 'Claw turun...';
            arm.classList.remove('closed');
            await sleep(120);
            line.style.height = `${lineHeight}px`;       // turun
            await sleep(750);

            arm.classList.add('closed');                  // capit menutup
            await sleep(300);
            if (hit) target.style.transform = `translateY(${-(lineHeight - BASE_LINE)}px) scale(.8)`;
            line.style.height = `${BASE_LINE}px`;         // naik
            await sleep(750);

            if (hit) {
                const idx = Number(target.dataset.slot);
                const doll = slots[idx];
                taken++; grandTotal++;
                result.textContent = doll.alien ? pick(claw.responses) : fill(claw.caughtMessage, doll);
                Sound.play('win');
                target.style.opacity = '0';
                updateStats();
                await sleep(500);

                // ganti dengan boneka berikutnya (kosong bila stok sudah habis)
                const nextDoll = nextIndex < TOTAL ? dolls[nextIndex++] : null;
                slots[idx] = nextDoll;
                target.style.transition = 'none';
                target.style.transform = '';
                target.style.opacity = '1';
                target.textContent = nextDoll ? nextDoll.emoji : '';
                target.classList.toggle('is-empty', !nextDoll);
                void target.offsetWidth;
                target.style.transition = '';
                if (nextDoll) {
                    target.classList.remove('enter');
                    void target.offsetWidth;
                    target.classList.add('enter');
                }

                // semua boneka habis -> reset ke susunan awal
                if (taken >= TOTAL) {
                    await sleep(700);
                    result.textContent = claw.resetMessage;
                    Sound.play('win');
                    await sleep(1800);
                    round++;
                    resetDolls();
                    result.textContent = fill(claw.newRoundMessage, { round, total: TOTAL });
                }
            } else {
                result.textContent = pick(claw.missMessages);
                Sound.play('pop');
                await sleep(300);
            }

            arm.classList.remove('closed');
            busy = false;
            setDisabled(false);
        }
        grabBtn.addEventListener('click', grab);

        /* --- Tombol ACTIVATE: tampilkan / sembunyikan kedua tombol --- */
        function setActive(on) {
            active = on;
            controls.classList.toggle('hidden', !on);
            hint.classList.toggle('hidden', !on);
            toggleBtn.textContent = on ? claw.buttonOff : claw.button;
            toggleBtn.classList.toggle('btn-yellow', !on);
            toggleBtn.classList.toggle('btn-light', on);
            result.textContent = on ? claw.readyMessage : '';
            if (!on) { // kembalikan capit ke tengah
                stopSteer();
                pos = 0.5; dir = 1; arrow.textContent = '▶';
                arm.classList.add('slow');
                render();
                setTimeout(() => arm.classList.remove('slow'), 600);
            }
            Sound.play(on ? 'win' : 'pop');
        }
        toggleBtn.addEventListener('click', () => { if (!busy) setActive(!active); });

        window.addEventListener('resize', render);
        render();
    }

    /* ---------- Kontak ---------- */
    function renderContact(contact) {
        const mail = $('#contact-email');
        mail.textContent = contact.email;
        mail.href = `mailto:${contact.email}`;

        $('#socials').innerHTML = (contact.socials || []).filter((s) => validUrl(s.url)).map((s) => `
            <a href="${esc(s.url)}" class="btn btn-sm btn-light" target="_blank" rel="noopener noreferrer" data-sound="pop">
                <span aria-hidden="true">${esc(s.icon)}</span> ${esc(s.label)}</a>`).join('');
    }

    function setupForm(contact) {
        const form = $('#contact-form');
        const msg = $('#f-message');
        const counter = $('#msg-count');
        const messages = {
            name: 'Isi nama kamu (minimal 2 huruf).',
            email: 'Masukkan alamat email yang valid.',
            message: 'Pesan minimal 10 karakter.'
        };

        msg.addEventListener('input', () => { counter.textContent = msg.value.length; });

        const validateField = (el) => {
            const ok = el.checkValidity() && el.value.trim() !== '';
            el.classList.toggle('invalid', !ok);
            $(`[data-error-for="${el.name}"]`).textContent = ok ? '' : messages[el.name];
            return ok;
        };
        ['name', 'email', 'message'].forEach((n) => {
            const el = form.elements[n];
            el.addEventListener('blur', () => validateField(el));
            el.addEventListener('input', () => { if (el.classList.contains('invalid')) validateField(el); });
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fields = ['name', 'email', 'message'].map((n) => form.elements[n]);
            const allOk = fields.map(validateField).every(Boolean);
            if (!allOk) {
                fields.find((f) => f.classList.contains('invalid')).focus();
                return toast('Lengkapi dulu isian yang ditandai merah.', 'error');
            }

            const payload = Object.fromEntries(new FormData(form));
            if (payload.website) return; // honeypot terisi -> bot
            delete payload.website;
            Sound.play('laser');

            if (contact.formEndpoint) {
                const submit = $('button[type="submit"]', form);
                const label = submit.textContent;
                submit.disabled = true;
                submit.textContent = 'Mengirim sinyal...';
                try {
                    const res = await fetch(contact.formEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    toast('🎉 Sinyal rahasia berhasil dikirim ke Star Command!');
                    form.reset();
                    counter.textContent = '0';
                } catch (err) {
                    toast('Sinyal gagal terkirim. Coba lagi atau kirim lewat email.', 'error');
                } finally {
                    submit.disabled = false;
                    submit.textContent = label;
                }
            } else {
                // Tanpa endpoint: buka aplikasi email dengan pesan terisi
                const subject = encodeURIComponent(`Pesan dari ${payload.name}`);
                const body = encodeURIComponent(`${payload.message}\n\n— ${payload.name} (${payload.email})`);
                window.location.href = `mailto:${contact.email}?subject=${subject}&body=${body}`;
                toast('Membuka aplikasi email kamu...');
            }
        });
    }

    /* ---------- Reveal & tombol ke atas ---------- */
    function setupReveal() {
        const io = new IntersectionObserver((entries, obs) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                obs.unobserve(entry.target);
            });
        }, { threshold: 0.12 });
        $$('.reveal').forEach((el) => io.observe(el));
    }

    function setupScrollUI() {
        const top = $('#to-top');
        const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
        window.addEventListener('scroll', () => top.classList.toggle('hidden', window.scrollY < 400), { passive: true });
        top.addEventListener('click', () => { Sound.play('pop'); scrollTop(); });
        $('#brand').addEventListener('click', () => {
            if (view.current === 'skill') { view.homeScroll = 0; location.hash = 'about'; }
            else scrollTop();
        });
    }

    /* ---------- Inisialisasi ---------- */
    async function loadData() {
        const res = await fetch(DATA_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Gagal memuat ${DATA_URL} (HTTP ${res.status})`);
        return res.json();
    }

    async function init() {
        // Klik elemen ber-atribut data-sound memainkan suara
        document.addEventListener('click', (e) => {
            const el = e.target.closest('[data-sound]');
            if (el) Sound.play(el.dataset.sound);
        });
        $('#sound-toggle').addEventListener('click', () => Sound.toggle());
        renderSoundButton();
        setupScrollUI();
        setupModal();
        setupMenu();

        try {
            state.data = await loadData();
        } catch (err) {
            const box = $('#load-error');
            box.textContent = `Data tidak bisa dimuat. Jalankan lewat server lokal (mis. "python -m http.server 8000") lalu buka http://localhost:8000. Detail: ${err.message}`;
            box.classList.remove('hidden');
            console.error(err);
            return;
        }

        const d = state.data;
        bindText(d);
        renderNav(d.nav);
        renderProfile(d.profile);
        renderSkills(d.skills);
        renderProjects(d.projects);
        renderContact(d.contact);
        setupWoody(d.woodyQuotes);
        setupClaw(d.claw);
        setupForm(d.contact);
        $('#footer-copy').textContent = `© ${new Date().getFullYear()} ${d.footer.copyright}`;
        $('#mascot').addEventListener('error', function () { this.src = FALLBACK_IMG; }, { once: true });

        setupReveal();
        setupScrollSpy();
        setupSkillPage();
        route();
    }

    document.addEventListener('DOMContentLoaded', init);
})();

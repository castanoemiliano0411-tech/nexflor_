/* NEXFLOR — motor de la presentación.
   Flecha derecha avanza. Flecha izquierda retrocede.
   Esc menú. F pantalla completa. P vista de presentador. Espacio pausa. */

(() => {
    "use strict";

    const DESIGN_W = 1920;
    const DESIGN_H = 1080;
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const VISTA = new URLSearchParams(location.search).has("vista");
    if (VISTA) document.body.classList.add("vista");

    const scenes = $$(".scene");
    const total = scenes.length;
    const ui = {
        title: $("#hudTitle"),
        current: $("#hudCurrent"),
        total: $("#hudTotal"),
        steps: $("#hudSteps"),
        progress: $("#hudProgress"),
        btnMenu: $("#btnMenu"),
        btnFs: $("#btnFullscreen"),
        btnMusic: $("#btnMusic"),
        btnPrev: $("#btnPrev"),
        btnNext: $("#btnNext"),
        menu: $("#menu"),
        menuGrid: $("#menuGrid"),
        toast: $("#toast"),
    };
    const pad = (n) => String(n).padStart(2, "0");

    function fit() {
        const scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
        document.documentElement.style.setProperty("--scale", String(scale));
    }
    window.addEventListener("resize", fit);
    fit();

    const canvas = $("#space");
    const ctx = canvas.getContext("2d");
    const pollen = Array.from({ length: 70 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.8 + 0.4,
        v: Math.random() * 0.00025 + 0.00005,
        a: Math.random() * 0.45 + 0.15,
    }));
    function drawSpace() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of pollen) {
            p.y -= p.v;
            if (p.y < 0) p.y = 1;
            ctx.beginPath();
            ctx.fillStyle = `rgba(47, 111, 78, ${p.a * 0.55})`;
            ctx.arc(p.x * canvas.width, p.y * canvas.height, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        if (!document.body.classList.contains("is-paused")) requestAnimationFrame(drawSpace);
    }
    requestAnimationFrame(drawSpace);

    const stepCount = scenes.map((scene) =>
        $$(".step", scene).reduce((max, el) => Math.max(max, Number(el.dataset.step) || 0), 0)
    );
    const revealed = scenes.map(() => 0);
    let current = -1;
    let presenterWin = null;
    let menuOpen = false;

    function isShown(el, n) {
        return Number(el.dataset.step) <= n;
    }

    function applySteps(index, instant = false) {
        const scene = scenes[index];
        const n = revealed[index];
        scene.classList.toggle("instant", instant);
        scene.dataset.step = String(n);
        $$(".step", scene).forEach((el) => el.classList.toggle("shown", isShown(el, n)));
    }

    function goTo(index, { fromBack = false } = {}) {
        index = Math.max(0, Math.min(total - 1, index));
        if (index === current) return;
        const dir = current < 0 || index > current ? 1 : -1;
        if (current >= 0) {
            scenes[current].dataset.pos = dir > 0 ? "near" : "far";
            scenes[current].classList.remove("is-active");
        }
        current = index;
        const scene = scenes[current];
        revealed[current] = fromBack ? stepCount[current] : 0;
        applySteps(current, fromBack);
        scene.classList.add("no-trans");
        scene.dataset.pos = dir > 0 ? "far" : "near";
        void scene.offsetWidth;
        scene.classList.remove("no-trans");
        scene.classList.add("is-active");
        delete scene.dataset.pos;
        document.body.dataset.bg = scene.dataset.bg || "hero";
        document.body.classList.toggle("no-chrome", scene.dataset.chrome === "off");
        history.replaceState(null, "", `#${current + 1}`);
        updateHud();
    }

    function showState(index, step) {
        goTo(index);
        revealed[current] = Math.max(0, Math.min(stepCount[current], step || 0));
        applySteps(current, true);
        updateHud();
    }

    function next() {
        if (revealed[current] < stepCount[current]) {
            revealed[current] += 1;
            applySteps(current);
            updateHud();
            return;
        }
        if (current < total - 1) goTo(current + 1);
    }

    function prev() {
        if (revealed[current] > 0) {
            revealed[current] -= 1;
            applySteps(current, true);
            updateHud();
            return;
        }
        if (current > 0) goTo(current - 1, { fromBack: true });
    }

    function updateHud() {
        const scene = scenes[current];
        ui.title.textContent = scene.dataset.title || "";
        ui.current.textContent = pad(current + 1);
        ui.total.textContent = pad(total);
        ui.progress.style.width = `${((current + 1) / total) * 100}%`;
        ui.steps.innerHTML = "";
        for (let i = 1; i <= stepCount[current]; i += 1) {
            const dot = document.createElement("i");
            if (i <= revealed[current]) dot.className = "on";
            ui.steps.appendChild(dot);
        }
        $$(".menu-item", ui.menuGrid).forEach((item, i) => item.classList.toggle("current", i === current));
        syncPresenter();
    }

    function openPresenter() {
        if (presenterWin && !presenterWin.closed) {
            presenterWin.focus();
            return;
        }
        presenterWin = window.open("presentador.html", "nexflor-presentador", "width=1440,height=900");
        if (!presenterWin) toast("Permite las ventanas emergentes para abrir la vista de presentador");
    }

    function syncPresenter() {
        if (!presenterWin || presenterWin.closed || current < 0) return;
        presenterWin.postMessage({
            tipo: "estado",
            index: current,
            step: revealed[current],
            steps: stepCount,
        }, "*");
    }

    window.addEventListener("message", (e) => {
        const d = e.data || {};
        if (d.tipo === "hola") {
            presenterWin = e.source;
            syncPresenter();
        } else if (d.tipo === "cmd") {
            if (d.accion === "next") next();
            else if (d.accion === "prev") prev();
            else if (d.accion === "goto") goTo(Number(d.index) || 0);
        } else if (d.tipo === "mostrar" && VISTA) {
            showState(Number(d.index) || 0, Number(d.step) || 0);
        }
    });

    let toastTimer = null;
    function toast(message) {
        ui.toast.textContent = message;
        ui.toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2200);
    }

    function togglePause() {
        const paused = document.body.classList.toggle("is-paused");
        toast(paused ? "Animaciones en pausa" : "Animaciones reanudadas");
        if (!paused) requestAnimationFrame(drawSpace);
    }

    async function toggleFullscreen() {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
    }

    function buildMenu() {
        scenes.forEach((scene, i) => {
            const item = document.createElement("button");
            item.className = "menu-item";
            item.innerHTML = `<b>${pad(i + 1)}</b><span></span><small></small>`;
            $("span", item).textContent = scene.dataset.title || `Escena ${i + 1}`;
            $("small", item).textContent = scene.dataset.owner || "";
            item.addEventListener("click", () => {
                closeMenu();
                goTo(i);
            });
            ui.menuGrid.appendChild(item);
        });
    }

    function openMenu() {
        menuOpen = true;
        ui.menu.classList.add("open");
    }
    function closeMenu() {
        menuOpen = false;
        ui.menu.classList.remove("open");
    }

    let idleTimer = null;
    function wake() {
        document.body.classList.remove("idle");
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (!menuOpen) document.body.classList.add("idle");
        }, 2500);
    }
    document.addEventListener("mousemove", wake);

    let audioCtx = null;
    let musicGain = null;
    let musicOn = false;
    let chordTimer = null;
    const chords = [
        [261.63, 329.63, 392],
        [220, 261.63, 329.63],
        [196, 246.94, 329.63],
        [174.61, 220, 261.63],
    ];
    let voices = [];

    function ensureMusic() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;
        if (!audioCtx) audioCtx = new Ctx();
        if (!musicGain) {
            musicGain = audioCtx.createGain();
            musicGain.gain.value = 0.035;
            const filter = audioCtx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.value = 680;
            musicGain.connect(filter);
            filter.connect(audioCtx.destination);
            chords[0].forEach(() => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = "sine";
                gain.gain.value = 0;
                osc.connect(gain);
                gain.connect(musicGain);
                osc.start();
                voices.push({ osc, gain });
            });
        }
        return true;
    }

    function setChord(freqs) {
        const now = audioCtx.currentTime;
        voices.forEach((voice, i) => {
            voice.osc.frequency.setValueAtTime(freqs[i], now);
            voice.gain.gain.cancelScheduledValues(now);
            voice.gain.gain.linearRampToValueAtTime(0.22, now + 1.8);
        });
    }

    function startMusic() {
        if (VISTA || musicOn || !ensureMusic()) return;
        audioCtx.resume();
        let step = 0;
        setChord(chords[0]);
        chordTimer = setInterval(() => {
            step = (step + 1) % chords.length;
            setChord(chords[step]);
        }, 8000);
        musicOn = true;
        if (ui.btnMusic) ui.btnMusic.classList.add("on");
    }

    function stopMusic() {
        if (chordTimer) clearInterval(chordTimer);
        chordTimer = null;
        if (audioCtx && voices.length) {
            const now = audioCtx.currentTime;
            voices.forEach((voice) => voice.gain.gain.linearRampToValueAtTime(0, now + 0.4));
        }
        musicOn = false;
        if (ui.btnMusic) ui.btnMusic.classList.remove("on");
    }

    document.addEventListener("pointerdown", (e) => {
        if (VISTA || (e.target.closest && e.target.closest("#btnMusic"))) return;
        if (!musicOn) startMusic();
    });

    document.addEventListener("keydown", (e) => {
        if (VISTA || e.ctrlKey || e.altKey || e.metaKey) return;
        if (!musicOn && e.key.toLowerCase() !== "m") startMusic();
        if (menuOpen && e.key === "Escape") {
            e.preventDefault();
            closeMenu();
            return;
        }
        switch (e.key) {
            case "ArrowRight":
            case "PageDown":
                e.preventDefault();
                next();
                break;
            case "ArrowLeft":
            case "PageUp":
                e.preventDefault();
                prev();
                break;
            case " ":
            case "Spacebar":
                e.preventDefault();
                if (!e.repeat) togglePause();
                break;
            case "Escape":
                e.preventDefault();
                if (!e.repeat) (menuOpen ? closeMenu() : openMenu());
                break;
            case "f":
            case "F":
                if (!e.repeat) toggleFullscreen();
                break;
            case "p":
            case "P":
                if (!e.repeat) openPresenter();
                break;
            case "m":
            case "M":
                if (!e.repeat) (musicOn ? stopMusic() : startMusic());
                break;
            case "Home":
                e.preventDefault();
                goTo(0);
                break;
            case "End":
                e.preventDefault();
                goTo(total - 1);
                break;
            default:
                break;
        }
    });

    const bind = (btn, fn) => {
        if (!btn) return;
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            fn();
        });
    };
    bind(ui.btnMenu, () => (menuOpen ? closeMenu() : openMenu()));
    bind(ui.btnFs, toggleFullscreen);
    bind(ui.btnMusic, () => (musicOn ? stopMusic() : startMusic()));
    bind(ui.btnPrev, prev);
    bind(ui.btnNext, next);
    ui.menu.addEventListener("click", (e) => {
        if (e.target === ui.menu) closeMenu();
    });

    buildMenu();
    const fromHash = parseInt(location.hash.slice(1), 10);
    goTo(Number.isFinite(fromHash) ? fromHash - 1 : 0);
    wake();
})();

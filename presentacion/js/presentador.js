(() => {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const G = window.GUION;
    const main = window.opener;
    const total = G.escenas.length;
    const mmss = (s) => {
        s = Math.max(0, Math.round(s));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    const pad = (n) => String(n).padStart(2, "0");
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const plannedStart = [];
    G.escenas.reduce((acc, e, i) => { plannedStart[i] = acc; return acc + e.seg; }, 0);
    $("planned").textContent = mmss(G.duracion);

    let state = { index: 0, step: 0, steps: G.escenas.map((e) => e.pasos) };
    let first = null;
    let running = false;
    let elapsedBefore = 0;
    let runStart = 0;
    let slideStart = 0;
    const elapsed = () => elapsedBefore + (running ? (performance.now() - runStart) / 1000 : 0);

    function startTimer() {
        if (running) return;
        running = true;
        runStart = performance.now();
        $("btnTimer").textContent = "Pausar";
        $("timer").classList.add("on");
    }
    function pauseTimer() {
        if (!running) return;
        elapsedBefore = elapsed();
        running = false;
        $("btnTimer").textContent = "Reanudar";
        $("timer").classList.remove("on");
    }
    function resetTimer() {
        running = false;
        elapsedBefore = 0;
        slideStart = 0;
        $("btnTimer").textContent = "Iniciar";
        $("timer").classList.remove("on");
        tick();
    }
    function tick() {
        const t = elapsed();
        const e = G.escenas[state.index];
        const inSlide = t - slideStart;
        $("elapsed").textContent = mmss(t);
        $("clock").textContent = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
        const k = e.seg ? inSlide / e.seg : 0;
        $("slideBar").style.width = `${Math.min(100, k * 100)}%`;
        $("slideTime").textContent = `${mmss(inSlide)} / ${mmss(e.seg)}`;
        $("slideTimer").dataset.level = k > 1 ? "over" : k > 0.8 ? "warn" : "ok";
        const expected = plannedStart[state.index] + Math.min(inSlide, e.seg);
        const diff = t - expected;
        const pace = $("pace");
        if (!running && t === 0) {
            pace.textContent = "Listo";
            pace.dataset.level = "idle";
        } else if (Math.abs(diff) < 10) {
            pace.textContent = "A tiempo";
            pace.dataset.level = "ok";
        } else if (diff > 0) {
            pace.textContent = `Atrasados ${mmss(diff)}`;
            pace.dataset.level = diff > 30 ? "over" : "warn";
        } else {
            pace.textContent = `Adelantados ${mmss(-diff)}`;
            pace.dataset.level = "ok";
        }
    }
    setInterval(tick, 250);

    const frames = { now: $("frameNow"), next: $("frameNext") };
    const ready = { now: false, next: false };
    function nextState() {
        const { index, step, steps } = state;
        if (step < (steps[index] || 0)) return { index, step: step + 1 };
        if (index < total - 1) return { index: index + 1, step: 0 };
        return null;
    }
    function showFrame(name, s) {
        if (!ready[name]) return;
        frames[name].contentWindow.postMessage({ tipo: "mostrar", index: s.index, step: s.step }, "*");
    }
    function updateFrames() {
        showFrame("now", state);
        const n = nextState();
        document.body.classList.toggle("is-last", !n);
        if (n) showFrame("next", n);
    }
    for (const name of ["now", "next"]) {
        frames[name].addEventListener("load", () => { ready[name] = true; updateFrames(); });
    }
    frames.now.src = "index.html?vista#1";
    frames.next.src = "index.html?vista#2";

    const agenda = $("agenda");
    agenda.innerHTML = G.escenas.map((e, i) => {
        const c = (G.integrantes[e.quien] || {}).color || "#fff";
        return `<li style="--c:${c}" data-i="${i}"><b>${pad(i + 1)}</b><span>${esc(e.titulo)}</span><em>${esc(e.quien)}</em><time>${mmss(e.seg)}</time></li>`;
    }).join("");
    agenda.addEventListener("click", (ev) => {
        const li = ev.target.closest("li");
        if (li) send({ accion: "goto", index: Number(li.dataset.i) });
    });

    function renderNotes() {
        const i = state.index;
        const e = G.escenas[i];
        const info = G.integrantes[e.quien] || { color: "#fff", nombre: e.quien };
        const n = nextState();
        document.title = `Presentador · ${pad(i + 1)} ${e.titulo}`;
        document.documentElement.style.setProperty("--who", info.color);
        $("nowNum").textContent = pad(i + 1);
        $("nowTitle").textContent = e.titulo;
        $("nowWho").textContent = e.quien;
        $("nowWho").title = info.nombre;
        if (!n) $("nextTitle").textContent = "Fin de la presentación";
        else if (n.index === i) $("nextTitle").textContent = `Paso ${n.step} de ${state.steps[i]}`;
        else {
            const ne = G.escenas[n.index];
            const who = ne.quien !== e.quien ? ` · habla ${ne.quien}` : "";
            $("nextTitle").textContent = `${pad(n.index + 1)} ${ne.titulo}${who}`;
        }
        $("keys").innerHTML = e.claves.map((k) => `<li>${esc(k)}</li>`).join("");
        let a = 0;
        $("texto").innerHTML = esc(e.texto).replace(/\[→\]/g, () => {
            const cls = a < state.step ? "done" : a === state.step ? "next" : "";
            a += 1;
            return `<span class="arrow ${cls}">→</span>`;
        });
        const steps = state.steps[i] || 0;
        $("steps").innerHTML = steps
            ? Array.from({ length: steps }, (_, k) => `<i class="${k < state.step ? "on" : ""}"></i>`).join("")
            : "<small>Sin pasos</small>";
        [...agenda.children].forEach((li, k) => {
            li.classList.toggle("past", k < i);
            li.classList.toggle("current", k === i);
        });
    }

    function send(cmd) {
        if (main && !main.closed) main.postMessage({ tipo: "cmd", ...cmd }, "*");
    }
    window.addEventListener("message", (e) => {
        const d = e.data || {};
        if (d.tipo !== "estado") return;
        const changedSlide = d.index !== state.index;
        const key = `${d.index}:${d.step}`;
        if (first === null) first = key;
        else if (key !== first) startTimer();
        if (changedSlide) slideStart = elapsed();
        state = { index: d.index, step: d.step, steps: d.steps || state.steps };
        renderNotes();
        updateFrames();
        tick();
    });
    if (main && !main.closed) main.postMessage({ tipo: "hola" }, "*");
    else document.body.classList.add("no-link");

    $("btnNext").addEventListener("click", () => send({ accion: "next" }));
    $("btnPrev").addEventListener("click", () => send({ accion: "prev" }));
    $("btnTimer").addEventListener("click", () => (running ? pauseTimer() : startTimer()));
    $("btnReset").addEventListener("click", resetTimer);
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
            e.preventDefault();
            send({ accion: "next" });
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
            e.preventDefault();
            send({ accion: "prev" });
        } else if (e.key === "t" || e.key === "T") {
            running ? pauseTimer() : startTimer();
        } else if (e.key === "r" || e.key === "R") resetTimer();
    });
    renderNotes();
    tick();
})();

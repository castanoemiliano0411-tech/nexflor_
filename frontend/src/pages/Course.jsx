import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, useApi } from "../api.js";
import { Status } from "../components/Shell.jsx";

export default function Course() {
  const { id } = useParams();
  const query = useApi(`/courses/${id}`);
  const [data, setData] = useState(null);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setCurrent(0);
    setData(null);
  }, [id]);

  useEffect(() => {
    if (query.data) setData(query.data);
  }, [query.data]);

  async function toggle(lessonId) {
    const before = data?.lessons.find((lesson) => lesson.id === lessonId);
    setBusy(true);
    setNote("");
    try {
      const next = await api(`/courses/${id}/lessons/${lessonId}/complete`, { method: "POST" });
      setData(next);
      if (before && !before.done) {
        setToast(next.progress.percent === 100 ? "Curso listo. Ya puedes jugar la actividad." : "Lección marcada");
        const index = next.lessons.findIndex((lesson) => lesson.id === lessonId);
        const upcoming = next.lessons.findIndex((lesson, lessonIndex) => lessonIndex > index && !lesson.done);
        if (upcoming >= 0) setCurrent(upcoming);
      } else {
        setToast("Lección reabierta");
      }
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Status loading={query.loading && !data} error={query.error}>
      {data && (
        <CourseBody
          data={data}
          current={Math.min(current, data.lessons.length - 1)}
          setCurrent={setCurrent}
          busy={busy}
          note={note}
          toast={toast}
          toggle={toggle}
        />
      )}
    </Status>
  );
}

function CourseBody({ data, current, setCurrent, busy, note, toast, toggle }) {
  const lesson = data.lessons[current];
  const steps = lesson.steps || [];
  const [seen, setSeen] = useState(1);
  const [checked, setChecked] = useState({});
  const atStart = current === 0;
  const atEnd = current === data.lessons.length - 1;
  const ready = data.progress.percent === 100;
  const stepProgress = steps.length ? Math.round((Math.min(seen, steps.length) / steps.length) * 100) : 100;

  useEffect(() => {
    setSeen(1);
    setChecked({});
  }, [lesson.id]);

  useEffect(() => {
    function onKey(event) {
      if (event.target.matches("input, textarea, button, a")) return;
      if (event.key === "ArrowRight" && !atEnd) setCurrent(current + 1);
      if (event.key === "ArrowLeft" && !atStart) setCurrent(current - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [atEnd, atStart, current, setCurrent]);

  function finishLesson() {
    toggle(lesson.id);
  }

  return (
    <section className="page">
      <p className="eyebrow">NEXFLOR ACADEMY · {data.category}</p>
      <h1>{data.title}</h1>
      <p className="lede">{data.summary}</p>
      <div className="course-progress">
        <span>{data.progress.done} de {data.progress.total} lecciones</span>
        <div className="meter"><i style={{ width: `${data.progress.percent}%` }} /></div>
      </div>

      <div className="lesson-layout">
        <div>
          <article className="player">
            <img src={data.image} alt="" />
            <button type="button" onClick={() => toggle(lesson.id)} disabled={busy}>
              {lesson.done ? "Lista" : "Marcar vista"}
            </button>
            <div className="player-bar">
              <span>{lesson.kind}</span>
              <strong>{lesson.title}</strong>
              <small>{lesson.minutes} min</small>
            </div>
          </article>
          <article className="teach card">
            <div className="course-progress compact">
              <span>Paso {Math.min(seen, steps.length || 1)} de {steps.length || 1}</span>
              <div className="meter"><i style={{ width: `${stepProgress}%` }} /></div>
            </div>
            <h3>{lesson.idea || lesson.title}</h3>
            <ol className="teach-steps interactive">
              {steps.slice(0, seen).map((step, index) => (
                <li key={step} className={checked[index] ? "checked" : ""}>
                  <button
                    type="button"
                    className="step-check"
                    aria-pressed={Boolean(checked[index])}
                    onClick={() => setChecked((current) => ({ ...current, [index]: !current[index] }))}
                  >
                    {checked[index] ? "✓" : index + 1}
                  </button>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {seen < steps.length ? (
              <button className="button" type="button" onClick={() => setSeen((value) => value + 1)}>
                Siguiente paso
              </button>
            ) : (
              <>
                {lesson.tip && <p className="tip">{lesson.tip}</p>}
                <button className="button" type="button" onClick={finishLesson} disabled={busy}>
                  {lesson.done ? "Volver a abrir la lección" : "Ya lo entendí · siguiente lección"}
                </button>
              </>
            )}
          </article>
          <div className="pager">
            <button type="button" disabled={atStart} onClick={() => setCurrent(current - 1)}>Anterior</button>
            <span>Lección {current + 1} de {data.lessons.length}</span>
            <button type="button" disabled={atEnd} onClick={() => setCurrent(current + 1)}>Siguiente</button>
          </div>
          {note && <p className="status error">{note}</p>}
          {toast && <p className="toast" role="status">{toast}</p>}
        </div>

        <aside className="card lessons">
          <h3>Lecciones</h3>
          <ol>
            {data.lessons.map((item, index) => (
              <li key={item.id} className={index === current ? "current" : ""}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggle(item.id)}
                  aria-label={`Marcar ${item.title}`}
                />
                <button type="button" onClick={() => setCurrent(index)}>
                  <strong>{item.title}</strong>
                  <small>{item.minutes} min · {item.kind}</small>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <div className="split">
        <section className="card note-card">
          <h3>En el cultivo</h3>
          <p>Antes de la práctica, mira las fotos de las camas y de la flor de este curso.</p>
          <Link to={`/cursos/${data.id}/taller`}>Ver el taller</Link>
        </section>
        <section className="card sand">
          <h3>{data.game?.title || "Juego de la actividad"}</h3>
          <p>
            {ready
              ? "Ya cerraste las lecciones. Ahora haz la actividad en el orden del cultivo."
              : `Termina las ${data.progress.total - data.progress.done} lecciones que faltan para desbloquear el juego.`}
          </p>
          {ready ? (
            <Link className="button" to={`/cursos/${data.id}/juego`}>Jugar la actividad</Link>
          ) : (
            <button className="button" type="button" disabled>Juego al final del curso</button>
          )}
          <Link className="text-link" to={`/practica/${data.id}`}>
            {data.quiz.lastScore === null ? "O responde la práctica escrita" : `Práctica escrita: ${data.quiz.lastScore}%`}
          </Link>
        </section>
      </div>
    </section>
  );
}

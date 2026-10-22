import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../api.js";
import { Status } from "../components/Shell.jsx";

export default function Game() {
  const { id } = useParams();
  const { loading, error, data } = useApi(`/courses/${id}`);

  return (
    <Status loading={loading} error={error}>
      {data && <GameBody key={data.id} data={data} />}
    </Status>
  );
}

function GameBody({ data }) {
  const steps = data.game?.steps || [];
  const ready = data.progress.percent === 100;
  const bank = useMemo(() => shuffle(steps), [steps]);
  const [placed, setPlaced] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [hits, setHits] = useState(0);
  const [message, setMessage] = useState(data.game?.intro || "");
  const [shake, setShake] = useState("");
  const [hint, setHint] = useState(false);
  const [dragId, setDragId] = useState("");

  if (!data.game) {
    return <p className="status">Este curso todavía no tiene juego.</p>;
  }

  if (!ready) {
    return (
      <section className="page">
        <p className="eyebrow">{data.title}</p>
        <h1>{data.game.title}</h1>
        <p className="lede">El juego se abre al terminar las lecciones. Vas en {data.progress.done} de {data.progress.total}.</p>
        <Link className="button" to={`/cursos/${data.id}`}>Volver a las lecciones</Link>
      </section>
    );
  }

  const done = placed.length === steps.length;
  const next = steps[placed.length];
  const remaining = bank.filter((step) => !placed.includes(step.id));
  const progress = steps.length ? Math.round((placed.length / steps.length) * 100) : 0;

  function place(step) {
    if (done || !step) return;
    if (step.id !== next.id) {
      setMistakes((count) => count + 1);
      setShake(step.id);
      setHint(false);
      setMessage("Ese paso va más adelante. Mira qué ya quedó en la mesa.");
      return;
    }
    setPlaced((current) => [...current, step.id]);
    setHits((count) => count + 1);
    setShake("");
    setHint(false);
    setMessage(step.why);
  }

  function again() {
    setPlaced([]);
    setMistakes(0);
    setHits(0);
    setShake("");
    setHint(false);
    setMessage(data.game.intro);
  }

  function showHint() {
    if (!next || done) return;
    setHint(true);
    setMessage(`Pista: el siguiente paso es «${next.label}».`);
  }

  function onDrop(event) {
    event.preventDefault();
    const id = dragId || event.dataTransfer.getData("text/plain");
    setDragId("");
    const step = remaining.find((item) => item.id === id);
    if (step) place(step);
  }

  return (
    <section className="page">
      <p className="eyebrow">{data.title}</p>
      <h1>{data.game.title}</h1>
      <p className="lede">{message}</p>
      <div className="course-progress game-progress">
        <span>{placed.length} de {steps.length} en orden · {hits} bien · {mistakes} fuera de orden</span>
        <div className="meter"><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="bench">
        <ol
          className="slots"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          {steps.map((step, index) => {
            const filled = placed.includes(step.id);
            return (
              <li key={step.id} className={filled ? "filled" : index === placed.length ? "now" : ""}>
                <span>{index + 1}</span>
                {filled ? step.label : index === placed.length ? "Suelta aquí el siguiente paso" : "Esperando el paso"}
              </li>
            );
          })}
        </ol>
        {done ? (
          <div className="card sand result-card">
            <h2>Actividad lista</h2>
            <p>
              {mistakes === 0
                ? "La hiciste en orden, sin equivocarte."
                : `La terminaste con ${mistakes} ${mistakes === 1 ? "intento fuera de orden" : "intentos fuera de orden"}.`}
            </p>
            <button className="button" type="button" onClick={again}>Jugar otra vez</button>
            <Link to={`/cursos/${data.id}`}>Volver al curso</Link>
          </div>
        ) : (
          <div className="choices">
            <div className="game-tools">
              <button type="button" onClick={showHint} disabled={hint}>
                {hint ? "Pista abierta" : "Pedir pista"}
              </button>
            </div>
            {remaining.map((step) => (
              <button
                key={step.id}
                type="button"
                className={[shake === step.id ? "shake" : "", hint && next?.id === step.id ? "hinted" : ""].filter(Boolean).join(" ")}
                draggable
                onDragStart={(event) => {
                  setDragId(step.id);
                  event.dataTransfer.setData("text/plain", step.id);
                }}
                onDragEnd={() => setDragId("")}
                onClick={() => place(step)}
              >
                {step.label}
              </button>
            ))}
            <p className="muted">Toca un paso o arrástralo al hueco verde.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

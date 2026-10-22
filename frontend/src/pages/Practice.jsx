import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, useApi } from "../api.js";
import { Status } from "../components/Shell.jsx";

export default function Practice() {
  const { id } = useParams();
  const { loading, error, data } = useApi(`/courses/${id}/quiz`);
  const [answers, setAnswers] = useState({});
  const [marks, setMarks] = useState({});
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    setAnswers({});
    setMarks({});
    setStep(0);
    setResult(null);
    setNote("");
    setStreak(0);
  }, [id]);

  const questions = data?.questions || [];
  const question = questions[step];
  const answered = questions.filter((item) => answers[item.id]).length;
  const allMarked = questions.length > 0 && questions.every((item) => marks[item.id]);

  function pick(optionId) {
    if (!question || result || marks[question.id]) return;
    setAnswers((current) => ({ ...current, [question.id]: optionId }));
    setNote("");
  }

  async function checkCurrent() {
    if (!question || !answers[question.id]) {
      setNote("Elige una respuesta para comprobarla.");
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const mark = await api(`/courses/${id}/quiz/check`, {
        method: "POST",
        body: JSON.stringify({ questionId: question.id, answerId: answers[question.id] }),
      });
      setMarks((current) => ({ ...current, [question.id]: mark }));
      setStreak((count) => (mark.correct ? count + 1 : 0));
      setNote(mark.correct ? "Bien. Esa es la respuesta." : "Esa no es. Mira la marcada en verde y sigue.");
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  }

  function nextQuestion() {
    if (step < questions.length - 1) setStep(step + 1);
    setNote("");
  }

  async function submit() {
    if (!data || answered < data.questions.length) {
      setNote("Responde todas las preguntas antes de enviar.");
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const body = await api(`/courses/${id}/quiz`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
      setResult(body);
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setResult(null);
    setAnswers({});
    setMarks({});
    setStep(0);
    setNote("");
    setStreak(0);
  }

  return (
    <Status loading={loading} error={error}>
      {data && (
        <section className="page">
          <p className="eyebrow">{data.courseTitle}</p>
          <h1>{data.title}</h1>
          <p className="lede">{data.summary}</p>
          <div className="practice">
            <div className="questions">
              <div className="course-progress">
                <span>
                  Pregunta {Math.min(step + 1, questions.length)} de {questions.length}
                  {streak > 1 ? ` · racha ${streak}` : ""}
                </span>
                <div className="meter">
                  <i style={{ width: `${questions.length ? (Object.keys(marks).length / questions.length) * 100 : 0}%` }} />
                </div>
              </div>

              {result ? (
                <div className="card sand result-card practice-summary">
                  <h2>{result.percent >= 70 ? "Práctica lista" : "Sigue practicando"}</h2>
                  <strong>{result.percent}%</strong>
                  <p>{result.score} de {result.total} bien. Quedó guardado en el taller.</p>
                  <div className="face-actions">
                    <button className="button" type="button" onClick={retry}>Intentar de nuevo</button>
                    <Link to={`/cursos/${id}`}>Volver al curso</Link>
                  </div>
                </div>
              ) : question ? (
                <fieldset className={marks[question.id] ? (marks[question.id].correct ? "good" : "bad") : ""}>
                  <legend>{step + 1}. {question.prompt}</legend>
                  {question.options.map((option) => {
                    const mark = marks[question.id];
                    const picked = answers[question.id] === option.id;
                    const right = mark && option.id === mark.correctOptionId;
                    const wrong = mark && picked && !mark.correct;
                    return (
                      <label key={option.id} className={[picked ? "picked" : "", right ? "right" : "", wrong ? "wrong" : ""].filter(Boolean).join(" ")}>
                        <input
                          type="radio"
                          name={question.id}
                          value={option.id}
                          checked={picked}
                          disabled={Boolean(mark)}
                          onChange={() => pick(option.id)}
                        />
                        {option.text}
                      </label>
                    );
                  })}
                  <div className="practice-nav">
                    <button type="button" disabled={step === 0} onClick={() => { setStep(step - 1); setNote(""); }}>Anterior</button>
                    {!marks[question.id] ? (
                      <button className="button" type="button" onClick={checkCurrent} disabled={busy}>
                        {busy ? "Comprobando…" : "Comprobar"}
                      </button>
                    ) : step < questions.length - 1 ? (
                      <button className="button" type="button" onClick={nextQuestion}>Siguiente pregunta</button>
                    ) : (
                      <button className="button" type="button" onClick={submit} disabled={busy || !allMarked}>
                        {busy ? "Guardando…" : "Guardar práctica"}
                      </button>
                    )}
                  </div>
                </fieldset>
              ) : null}

              {note && <p className={`status ${note.startsWith("Bien") ? "" : "error"}`}>{note}</p>}
            </div>
            <aside className="card sand score">
              <h3>Cómo va</h3>
              <strong>{Object.keys(marks).length} / {questions.length}</strong>
              <p>
                {data.lastAttempt
                  ? `Último intento guardado: ${data.lastAttempt.percent}%.`
                  : "Comprueba cada respuesta y al final guarda el intento."}
              </p>
              <ol className="practice-dots">
                {questions.map((item, index) => {
                  const mark = marks[item.id];
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={[
                          index === step ? "on" : "",
                          mark ? (mark.correct ? "good" : "bad") : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => { setStep(index); setNote(""); }}
                        aria-label={`Ir a la pregunta ${index + 1}`}
                      >
                        {index + 1}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <Link to={`/cursos/${id}`}>Volver al curso</Link>
            </aside>
          </div>
        </section>
      )}
    </Status>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api.js";
import { Status } from "../components/Shell.jsx";

const filters = ["Todos", "Cultivo", "Campo", "Cosecha", "Poscosecha", "Seguridad"];

export default function Courses() {
  const { loading, error, data } = useApi("/courses");
  const [filter, setFilter] = useState("Todos");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    if (!data) return [];
    return data.map((course, index) => ({ ...course, step: index + 1 })).filter((course) => {
      const matchesFilter = filter === "Todos" || course.category === filter;
      const matchesQuery = `${course.title} ${course.summary}`.toLowerCase().includes(query.toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [data, filter, query]);

  return (
    <Status loading={loading} error={error}>
      <section className="page">
        <div className="page-head">
          <div>
            <p className="eyebrow">NEXFLOR ACADEMY</p>
            <h1>De la planta al despacho</h1>
            <p className="lede">Seis cursos, en el orden del trabajo en El Trigal: reconocer la flor, sembrarla, cuidarla, cosecharla, hidratarla y cuidarte.</p>
          </div>
          <Link className="button" to="/cursos/preparacion-segura">Empezar por las plantas</Link>
        </div>
        {data && (
          <ol className="academy-path">
            {data.map((course, index) => (
              <li key={course.id}>
                <Link to={`/cursos/${course.id}`}>
                  <small>{index + 1} · {course.category}</small>
                  <strong>{course.title}</strong>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <div className="toolbar">
          <div className="chips">
            {filters.map((item) => {
              const count = !data ? 0 : item === "Todos" ? data.length : data.filter((course) => course.category === item).length;
              return (
                <button key={item} className={item === filter ? "on" : ""} type="button" onClick={() => setFilter(item)}>
                  {item} <em>{count}</em>
                </button>
              );
            })}
          </div>
          <label className="search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar un curso"
              aria-label="Buscar un curso"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Borrar búsqueda">
                ×
              </button>
            )}
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="status">Ningún curso coincide con esa búsqueda.</p>
        ) : (
          <div className="grid">
            {visible.map((course) => (
              <Link className="course" key={course.id} to={`/cursos/${course.id}`}>
                <img src={course.image} alt="" />
                <div>
                  <span>{course.step}. {course.category} · {course.minutes} min</span>
                  <h2>{course.title}</h2>
                  <p>{course.summary}</p>
                  <b>{course.progress.percent}% listo</b>
                  {course.gameTitle && <small className="game-flag">Al final: {course.gameTitle}</small>}
                  <span className="meter" aria-hidden="true"><i style={{ width: `${course.progress.percent}%` }} /></span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Status>
  );
}

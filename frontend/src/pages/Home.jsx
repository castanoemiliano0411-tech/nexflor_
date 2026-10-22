import { Link } from "react-router-dom";
import { useApi } from "../api.js";
import { Status } from "../components/Shell.jsx";

const clips = [
  {
    src: "/flores/visita.mp4",
    poster: "/flores/equipo-visita.jpg",
    title: "La visita",
    text: "El equipo junto al invernadero",
  },
  {
    src: "/flores/companera.mp4",
    poster: "/flores/equipo-trigal.jpg",
    title: "Compañera que comienza",
    text: "Reconocimiento en la salida",
  },
  {
    src: "/flores/camas.mp4",
    poster: "/flores/cosecha-amarilla.jpg",
    title: "Entre las camas",
    text: "Recorrido por las flores",
  },
  {
    src: "/flores/encuentro.mp4",
    poster: "/flores/cosecha-rosa.jpg",
    title: "Encuentro al aire libre",
    text: "El equipo reunido afuera",
  },
];

export default function Home() {
  const { loading, error, data } = useApi("/dashboard");

  return (
    <Status loading={loading} error={error}>
      {data && (
        <section className="page">
          <p className="eyebrow">Inicio del turno</p>
          <h1>{data.greeting}</h1>
          <div className="chips">
            <Link to="/id">1. NEXFLOR ID</Link>
            <Link to="/posture">2. NEXFLOR POSTURE</Link>
            <Link to="/cursos">3. NEXFLOR ACADEMY</Link>
          </div>
          <p className="lede">{data.subtitle}</p>

          <article className="hero">
            <div>
              <span>{data.banner.kicker}</span>
              <h2>{data.banner.title}</h2>
              <p>{data.banner.text}</p>
              <Link to={data.banner.href}>{data.banner.cta}</Link>
            </div>
            <img src={data.banner.image} alt="Arreglo floral del curso en curso" />
          </article>

          <section className="videos">
            <p className="eyebrow">En el cultivo</p>
            <h2>Videos de El Trigal</h2>
            <div className="video-grid">
              {clips.map((clip) => (
                <figure key={clip.src}>
                  <video controls playsInline preload="metadata" poster={clip.poster}>
                    <source src={clip.src} type="video/mp4" />
                  </video>
                  <figcaption>
                    <strong>{clip.title}</strong>
                    <small>{clip.text}</small>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>

          <div className="stats">
            {data.stats.map((stat) => (
              <article key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <small>{stat.hint}</small>
              </article>
            ))}
          </div>

          <div className="split">
            <section className="card">
              <header>
                <h3>Lo que sigue en la mesa</h3>
                <Link to="/cursos">Ver cursos</Link>
              </header>
              <ul className="tasks">
                {data.tasks.map((task) => (
                  <li key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <small>{task.meta}</small>
                    </div>
                    <Link to={task.href}>Abrir</Link>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card">
              <header>
                <h3>Recorridos abiertos</h3>
              </header>
              <ul className="tracks">
                {data.tracks.map((track) => (
                  <li key={track.id}>
                    <div>
                      <Link to={`/cursos/${track.id}`}>{track.label}</Link>
                      <b>{track.value}%</b>
                    </div>
                    <i style={{ width: `${track.value}%` }} />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>
      )}
    </Status>
  );
}

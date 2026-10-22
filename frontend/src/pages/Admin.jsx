import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api.js";
import { clearSession, readSession, saveSession, TOKEN_KEY } from "../session.js";
import FaceAdmin from "./FaceAdmin.jsx";

export { TOKEN_KEY };

async function adminApi(path, token, options = {}) {
  return api(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
}

export default function Admin() {
  const [session, setSession] = useState(readSession);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    localStorage.removeItem(TOKEN_KEY);
    const lock = () => {
      clearSession();
      setSession(readSession());
      setData(null);
    };
    window.addEventListener("serrania-admin-lock", lock);
    return () => window.removeEventListener("serrania-admin-lock", lock);
  }, []);

  function logout() {
    clearSession();
    setSession(readSession());
    setData(null);
  }

  function enter(body) {
    saveSession(body);
    setSession(readSession());
  }

  if (!session.token) {
    return <Login onToken={enter} />;
  }

  if (session.role === "trabajador") return <Navigate to="/" replace />;

  if (session.role === "portero") {
    return (
      <main className="login">
        <section className="card">
          <p className="eyebrow">Serranía</p>
          <h1>Panel de administración</h1>
          <p>La cuenta de {session.name || "escaneo"} puede registrar y verificar ingresos. Los reportes, las alertas y las aprobaciones quedan en la cuenta de administrador.</p>
          <div className="face-actions">
            <Link className="button" to="/id">Ir a NEXFLOR ID</Link>
            <button type="button" onClick={logout}>Salir</button>
          </div>
        </section>
      </main>
    );
  }

  const token = session.token;

  return (
    <Panel
      token={token}
      data={data}
      setData={setData}
      error={error}
      setError={setError}
      logout={logout}
    />
  );
}

function Login({ onToken }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = await api("/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onToken(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <img className="login-logo" src="/logo-trigal.png" alt="Flores El Trigal" />
        <h1>Administración</h1>
        <p className="lede">Entra con tu nombre. Camilo Tobón o Emiliano Castañeda.</p>
        <label>Nombre<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {error && <p className="status error">{error}</p>}
        <button className="button" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        <Link to="/entrar">Entrar como trabajador</Link>
      </form>
    </main>
  );
}

function Panel({ token, data, setData, error, setError, logout }) {
  const [tab, setTab] = useState("ingreso");
  const [selected, setSelected] = useState("");

  async function load() {
    try {
      const body = await adminApi("/admin/overview", token);
      setData(body);
      setError("");
      setSelected((current) => body.courses.some((course) => course.id === current) ? current : body.courses[0]?.id || "");
      if (body.pendingFaces > 0) setTab("ingreso");
    } catch (err) {
      if (err.message.includes("administrador")) logout();
      else setError(err.message);
    }
  }

  useEffect(() => { load(); }, [token]);

  const course = data?.courses.find((item) => item.id === selected);
  const pendingFaces = data?.pendingFaces || 0;

  return (
    <main className="admin">
      <header>
        <div>
          <p className="eyebrow">Control del sitio</p>
          <h1>Administración</h1>
        </div>
        <div className="admin-actions">
          <Link to="/">Ver el taller</Link>
          <button type="button" onClick={logout}>Salir</button>
        </div>
      </header>
      <div className="chips">
        {[
          ["ingreso", "NEXFLOR ID"],
          ["cursos", "NEXFLOR ACADEMY"],
          ["equipo", "Equipo"],
          ["archivos", "Archivos"],
        ].map(([item, label]) => (
          <button key={item} type="button" className={tab === item ? "on" : ""} onClick={() => setTab(item)}>
            {label}
            {item === "ingreso" && pendingFaces > 0 ? <em className="tab-badge">{pendingFaces}</em> : null}
          </button>
        ))}
      </div>
      {error && <p className="status error">{error}</p>}
      {!data && <p className="status">Cargando el taller…</p>}
      {data && tab === "cursos" && (
        <CoursesTab token={token} data={data} course={course} selected={selected} setSelected={setSelected} reload={load} />
      )}
      {data && tab === "equipo" && <TeamTab token={token} people={data.team} reload={load} />}
      {data && tab === "archivos" && <FilesTab token={token} files={data.files} reload={load} />}
      {data && tab === "ingreso" && <FaceAdmin token={token} />}
    </main>
  );
}

function CoursesTab({ token, data, course, selected, setSelected, reload }) {
  return (
    <div className="admin-grid">
      <section className="card">
        <h2>Cursos</h2>
        <ul className="admin-list">
          {data.courses.map((item) => (
            <li key={item.id}>
              <button type="button" className={item.id === selected ? "on" : ""} onClick={() => setSelected(item.id)}>
                <strong>{item.title}</strong>
                <small>{item.lessons.length} lecciones</small>
              </button>
            </li>
          ))}
        </ul>
        <CourseForm token={token} reload={reload} />
      </section>
      {course && <CourseEditor token={token} course={course} reload={reload} />}
    </div>
  );
}

function CourseForm({ token, reload, course }) {
  const [form, setForm] = useState(() => blankCourse(course));
  useEffect(() => setForm(blankCourse(course)), [course?.id]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const path = course ? `/admin/courses/${course.id}` : "/admin/courses";
    await adminApi(path, token, { method: course ? "PUT" : "POST", body: JSON.stringify(form) });
    if (!course) setForm(blankCourse());
    reload();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h3>{course ? "Modificar curso" : "Nuevo curso"}</h3>
      <input value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Título" required />
      <textarea value={form.summary} onChange={(event) => set("summary", event.target.value)} placeholder="De qué se trata" rows={3} />
      <div className="row">
        <input value={form.category} onChange={(event) => set("category", event.target.value)} placeholder="Categoría" />
        <input value={form.level} onChange={(event) => set("level", event.target.value)} placeholder="Nivel" />
      </div>
      <input value={form.image} onChange={(event) => set("image", event.target.value)} placeholder="URL de la imagen" />
      <div className="row">
        <button className="button" type="submit">{course ? "Guardar cambios" : "Crear curso"}</button>
        {course && (
          <button
            className="danger"
            type="button"
            onClick={async () => {
              if (!window.confirm(`¿Borrar “${course.title}”?`)) return;
              await adminApi(`/admin/courses/${course.id}`, token, { method: "DELETE" });
              reload();
            }}
          >
            Borrar curso
          </button>
        )}
      </div>
    </form>
  );
}

function CourseEditor({ token, course, reload }) {
  const [lesson, setLesson] = useState({ title: "", minutes: 5, kind: "lectura" });

  async function addLesson(event) {
    event.preventDefault();
    await adminApi(`/admin/courses/${course.id}/lessons`, token, { method: "POST", body: JSON.stringify(lesson) });
    setLesson({ title: "", minutes: 5, kind: "lectura" });
    reload();
  }

  return (
    <section className="card">
      <CourseForm token={token} course={course} reload={reload} />
      <h3>Lecciones</h3>
      <ul className="admin-list">
        {course.lessons.map((item, index) => (
          <li key={item.id} className="lesson-row">
            <span>{index + 1}. {item.title} <small>{item.minutes} min · {item.kind}</small></span>
            <span className="row">
              <button type="button" disabled={index === 0} onClick={() => move(token, course.id, item.id, "up", reload)}>Subir</button>
              <button type="button" disabled={index === course.lessons.length - 1} onClick={() => move(token, course.id, item.id, "down", reload)}>Bajar</button>
              <button type="button" className="danger" onClick={async () => {
                await adminApi(`/admin/courses/${course.id}/lessons/${item.id}`, token, { method: "DELETE" });
                reload();
              }}>Quitar</button>
            </span>
          </li>
        ))}
      </ul>
      <form className="stack" onSubmit={addLesson}>
        <h3>Nueva lección</h3>
        <input value={lesson.title} onChange={(event) => setLesson({ ...lesson, title: event.target.value })} placeholder="Título de la lección" required />
        <div className="row">
          <input type="number" min="1" value={lesson.minutes} onChange={(event) => setLesson({ ...lesson, minutes: Number(event.target.value) })} />
          <select value={lesson.kind} onChange={(event) => setLesson({ ...lesson, kind: event.target.value })}>
            <option value="lectura">Lectura</option>
            <option value="video">Video</option>
            <option value="practica">Práctica</option>
          </select>
        </div>
        <button className="button" type="submit">Agregar lección</button>
      </form>
    </section>
  );
}

function TeamTab({ token, people, reload }) {
  const [form, setForm] = useState({ name: "", role: "Florista", shift: "Mañana", focus: "", progress: 0 });

  async function submit(event) {
    event.preventDefault();
    await adminApi("/admin/team", token, { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", role: "Florista", shift: "Mañana", focus: "", progress: 0 });
    reload();
  }

  return (
    <div className="admin-grid">
      <section className="card">
        <h2>Equipo</h2>
        <ul className="admin-list">
          {people.map((person) => (
            <PersonRow key={person.id} token={token} person={person} reload={reload} />
          ))}
        </ul>
      </section>
      <form className="card stack" onSubmit={submit}>
        <h2>Nueva persona</h2>
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nombre" required />
        <input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Rol" />
        <select value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })}>
          <option>Mañana</option>
          <option>Tarde</option>
        </select>
        <input value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })} placeholder="En qué va" />
        <button className="button" type="submit">Agregar al equipo</button>
      </form>
    </div>
  );
}

function PersonRow({ token, person, reload }) {
  const [progress, setProgress] = useState(person.progress);
  useEffect(() => setProgress(person.progress), [person.progress]);

  return (
    <li className="lesson-row">
      <span>{person.name} <small>{person.role} · {person.shift}</small></span>
      <span className="row">
        <input type="number" min="0" max="100" value={progress} onChange={(event) => setProgress(Number(event.target.value))} />
        <button type="button" onClick={async () => {
          await adminApi(`/admin/team/${person.id}`, token, { method: "PUT", body: JSON.stringify({ ...person, progress }) });
          reload();
        }}>Guardar</button>
        <button type="button" className="danger" disabled={person.id === "laura"} onClick={async () => {
          await adminApi(`/admin/team/${person.id}`, token, { method: "DELETE" });
          reload();
        }}>Quitar</button>
      </span>
    </li>
  );
}

function FilesTab({ token, files, reload }) {
  const [note, setNote] = useState("");

  function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await adminApi("/admin/uploads", token, {
          method: "POST",
          body: JSON.stringify({ name: file.name, data: reader.result }),
        });
        setNote("Imagen subida.");
        reload();
      } catch (err) {
        setNote(err.message);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <section className="card">
      <h2>Imágenes</h2>
      <p className="lede">Sube una foto y úsala en un curso. También puedes bajarla o quitarla.</p>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} />
      {note && <p>{note}</p>}
      <div className="file-grid">
        {files.map((file) => (
          <figure key={file.name}>
            <img src={file.url} alt="" />
            <figcaption>
              <a href={file.url} download={file.name}>Bajar</a>
              <button type="button" className="danger" onClick={async () => {
                await adminApi(`/admin/uploads/${file.name}`, token, { method: "DELETE" });
                reload();
              }}>Quitar</button>
            </figcaption>
          </figure>
        ))}
      </div>
      {files.length === 0 && <p className="status">Todavía no hay imágenes subidas.</p>}
    </section>
  );
}

function blankCourse(course) {
  return {
    title: course?.title || "",
    summary: course?.summary || "",
    category: course?.category || "Taller",
    level: course?.level || "Base",
    minutes: course?.minutes || 10,
    image: course?.image || "",
  };
}

function move(token, courseId, lessonId, direction, reload) {
  return adminApi(`/admin/courses/${courseId}/lessons/${lessonId}/move`, token, {
    method: "POST",
    body: JSON.stringify({ direction }),
  }).then(reload);
}

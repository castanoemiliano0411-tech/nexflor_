import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useApi, WORKER_KEY } from "../api.js";

const links = [
  { to: "/", label: "Inicio", end: true, icon: HomeIcon },
  { to: "/id", label: "NEXFLOR ID", icon: FaceIcon },
  { to: "/posture", label: "NEXFLOR POSTURE", icon: PostureIcon },
  { to: "/cursos", label: "NEXFLOR ACADEMY", icon: BookIcon },
  { to: "/equipo", label: "Equipo", icon: PeopleIcon },
  { to: "/progreso", label: "Progreso", icon: ChartIcon },
];

export default function Shell() {
  const me = useApi("/me");
  const navigate = useNavigate();
  const fullName = me.data?.fullName || "Trabajador";
  const job = me.data?.role || "Trabajador";
  const initials = me.data?.initials || fullName.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();

  function leave() {
    sessionStorage.removeItem(WORKER_KEY);
    navigate("/entrar");
  }
  const formatted = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const today = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/logo-trigal.png" alt="Flores El Trigal" />
        </div>
        <nav>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? "active" : "")}>
              <link.icon />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/admin" className="admin-link">Administrar</NavLink>
        <button type="button" className="admin-link" onClick={leave}>Salir</button>
        <div className="side-card">
          <p>Turno de hoy</p>
          <strong>{fullName}</strong>
          <span>{job}</span>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <img className="top-logo" src="/logo-trigal.png" alt="Flores El Trigal" />
          <p>{today}</p>
          <NavLink to="/admin" className="admin-link top-admin">Administrar</NavLink>
          <button type="button" className="text-link" onClick={leave}>Salir</button>
          <div className="who">
            <span>{initials}</span>
            <div>
              <strong>{fullName}</strong>
              <small>{job}</small>
            </div>
          </div>
        </header>
        <Outlet />
      </div>
      <nav className="tabbar">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>
            <link.icon />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Status({ loading, error, children }) {
  if (loading) return <p className="status">Cargando el taller…</p>;
  if (error) return <p className="status error">{error}. Revisa que la API esté en el puerto 4000.</p>;
  return children;
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5h9.5A3.5 3.5 0 0 1 18 8v12H8.5A3.5 3.5 0 0 0 5 16.5z" />
      <path d="M5 4.5A3.5 3.5 0 0 1 8.5 8H18" />
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="9" r="3" />
      <path d="M4.5 19c.6-2.4 2.4-3.5 4.5-3.5s3.9 1.1 4.5 3.5" />
      <circle cx="17" cy="9.5" r="2.2" />
      <path d="M16 15.6c1.4.3 2.5 1.2 3.1 3" />
    </svg>
  );
}
function FaceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="10" r="3.2" />
      <path d="M6 19c.8-2.4 2.8-3.6 6-3.6s5.2 1.2 6 3.6" />
      <path d="M5 8V5.5h2.5M19 8V5.5h-2.5M5 13v2.5h2.5M19 13v2.5h-2.5" />
    </svg>
  );
}
function PostureIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7.5v4l4 2.5M12 11.5 8 16M8 16v4M16 14.5V20" />
      <path d="M18 6.5a4 4 0 0 1 0 5" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19V9M10 19V5M15 19v-7M20 19V8" />
    </svg>
  );
}

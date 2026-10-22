import { Navigate, Route, Routes } from "react-router-dom";
import { workerToken } from "./api.js";
import Shell from "./components/Shell.jsx";
import Home from "./pages/Home.jsx";
import Courses from "./pages/Courses.jsx";
import Course from "./pages/Course.jsx";
import Workshop from "./pages/Workshop.jsx";
import Game from "./pages/Game.jsx";
import Practice from "./pages/Practice.jsx";
import Team from "./pages/Team.jsx";
import Progress from "./pages/Progress.jsx";
import Admin from "./pages/Admin.jsx";
import Enter from "./pages/Enter.jsx";
import Face from "./pages/Face.jsx";
import Posture from "./pages/Posture.jsx";
import AdminShortcut from "./components/AdminShortcut.jsx";

function Guard() {
  if (!workerToken()) return <Navigate to="/entrar" replace />;
  return <Shell />;
}

export default function App() {
  return (
    <>
    <AdminShortcut />
    <Routes>
      <Route path="entrar" element={<Enter />} />
      <Route path="admin" element={<Admin />} />
      <Route element={<Guard />}>
        <Route index element={<Home />} />
        <Route path="cursos" element={<Courses />} />
        <Route path="cursos/:id" element={<Course />} />
        <Route path="cursos/:id/taller" element={<Workshop />} />
        <Route path="cursos/:id/juego" element={<Game />} />
        <Route path="practica/:id" element={<Practice />} />
        <Route path="equipo" element={<Team />} />
        <Route path="progreso" element={<Progress />} />
        <Route path="id" element={<Face />} />
        <Route path="posture" element={<Posture />} />
        <Route path="ingreso" element={<Navigate to="/id" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  );
}

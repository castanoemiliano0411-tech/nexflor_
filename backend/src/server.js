import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import * as store from "./store.js";
import { createStaff, ensureAdmin, ensureStaff, getWorkerById, linkWorkerFace, listStaff, loginAdmin, loginWorker, readSession, registerWorker, setStaffActive } from "./auth.js";
import * as admin from "./admin.js";
import * as face from "./faceStore.js";
import { analyzeFrames, engineStatus, startEngine } from "./faceEngine.js";

const app = express();
const port = process.env.PORT || 4000;
const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");

ensureAdmin();
ensureStaff();
face.ensureFace();
startEngine();

app.use(cors());
app.use(express.json({ limit: "6mb" }));
app.use("/api/uploads", express.static(admin.uploadsDir));

function tokenOf(req) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

function requireAdmin(req, res, next) {
  const session = readSession(tokenOf(req));
  if (session?.role !== "admin") return res.status(401).json({ message: "Entra como administrador." });
  req.session = { role: "admin", username: session.id };
  next();
}

function workerId(req) {
  const session = readSession(tokenOf(req));
  return session?.role === "worker" ? session.id : null;
}

function requireActor(req, res) {
  const session = readSession(tokenOf(req));
  if (!session) {
    res.status(401).json({ message: "Entra con tu cuenta de trabajador." });
    return null;
  }
  req.session = { role: session.role, username: session.id };
  return session;
}

function clientReading(body) {
  const descriptor = body?.descriptor;
  if (!Array.isArray(descriptor) || descriptor.length !== 128 || descriptor.some((value) => !Number.isFinite(value))) {
    const error = new Error("No llegó una medición válida del rostro.");
    error.status = 400;
    throw error;
  }
  return {
    descriptor,
    liveness: body?.liveness === true,
    quality: body?.quality !== false,
    staticImage: body?.staticImage === true,
  };
}

app.post("/api/workers/register", (req, res) => {
  try {
    res.status(201).json(registerWorker(req.body?.name, req.body?.password, req.body?.shift));
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message || "No se pudo crear la cuenta." });
  }
});

app.post("/api/workers/login", (req, res) => {
  try {
    res.json(loginWorker(String(req.body?.name || ""), String(req.body?.password || "")));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "No se pudo entrar." });
  }
});

app.post("/api/admin/login", (req, res) => {
  try {
    res.json(loginAdmin(String(req.body?.username || "").trim(), String(req.body?.password || "")));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "No se pudo entrar." });
  }
});

function reply(res, work) {
  try {
    res.json(work());
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "No se pudo completar la solicitud." });
  }
}

app.use("/api/admin", requireAdmin);

app.get("/api/admin/overview", (_req, res) => {
  res.json(admin.overview());
});

app.post("/api/admin/courses", (req, res, next) => {
  try { res.json(admin.saveCourse(req.body || {})); } catch (error) { next(error); }
});

app.put("/api/admin/courses/:id", (req, res, next) => {
  try { res.json(admin.saveCourse(req.body || {}, req.params.id)); } catch (error) { next(error); }
});

app.delete("/api/admin/courses/:id", (req, res, next) => {
  try { res.json(admin.removeCourse(req.params.id)); } catch (error) { next(error); }
});

app.post("/api/admin/courses/:id/lessons", (req, res, next) => {
  try { res.json(admin.saveLesson(req.params.id, req.body || {})); } catch (error) { next(error); }
});

app.put("/api/admin/courses/:courseId/lessons/:lessonId", (req, res, next) => {
  try { res.json(admin.saveLesson(req.params.courseId, req.body || {}, req.params.lessonId)); } catch (error) { next(error); }
});

app.delete("/api/admin/courses/:courseId/lessons/:lessonId", (req, res, next) => {
  try { res.json(admin.removeLesson(req.params.courseId, req.params.lessonId)); } catch (error) { next(error); }
});

app.post("/api/admin/courses/:courseId/lessons/:lessonId/move", (req, res, next) => {
  try {
    const direction = req.body?.direction === "up" ? -1 : 1;
    res.json(admin.moveLesson(req.params.courseId, req.params.lessonId, direction));
  } catch (error) { next(error); }
});

app.post("/api/admin/team", (req, res, next) => {
  try { res.json(admin.savePerson(req.body || {})); } catch (error) { next(error); }
});

app.put("/api/admin/team/:id", (req, res, next) => {
  try { res.json(admin.savePerson(req.body || {}, req.params.id)); } catch (error) { next(error); }
});

app.delete("/api/admin/team/:id", (req, res, next) => {
  try { res.json(admin.removePerson(req.params.id)); } catch (error) { next(error); }
});

app.post("/api/admin/uploads", (req, res, next) => {
  try { res.json(admin.saveFile(req.body?.name, req.body?.data)); } catch (error) { next(error); }
});

app.delete("/api/admin/uploads/:name", (req, res, next) => {
  try { res.json(admin.removeFile(req.params.name)); } catch (error) { next(error); }
});

app.get("/api/admin/staff", (_req, res) => {
  res.json(listStaff());
});

app.post("/api/admin/staff", (req, res, next) => {
  try { res.json(createStaff(req.body || {})); } catch (error) { next(error); }
});

app.post("/api/admin/staff/:id/active", (req, res, next) => {
  try { res.json(setStaffActive(req.params.id, req.body?.active === true)); } catch (error) { next(error); }
});

app.get("/api/admin/face/people", (_req, res) => {
  res.json(face.listPeople());
});

app.get("/api/admin/face/attendance", (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : undefined;
  res.json(face.attendance(date));
});

app.get("/api/admin/face/history", (req, res) => {
  const valid = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "");
  res.json(face.history({
    from: valid(req.query.from) || valid(req.query.date),
    to: valid(req.query.to) || valid(req.query.date),
    documentId: String(req.query.q || ""),
  }));
});

app.get("/api/admin/face/alerts", (_req, res) => {
  res.json(face.listAlerts());
});

app.post("/api/admin/face/alerts/:id/review", (req, res, next) => {
  try { res.json(face.reviewAlert(req.params.id)); } catch (error) { next(error); }
});

app.post("/api/admin/face/people/:id/approve", (req, res, next) => {
  try { res.json(face.approvePerson(req.params.id, req.session.username)); } catch (error) { next(error); }
});

app.post("/api/admin/face/people/:id/reject", (req, res, next) => {
  try { res.json(face.rejectPerson(req.params.id, req.session.username)); } catch (error) { next(error); }
});

app.post("/api/admin/face/people/:id/suspend", (req, res, next) => {
  try { res.json(face.suspendPerson(req.params.id, req.session.username)); } catch (error) { next(error); }
});

app.post("/api/admin/face/people/:id/reactivate", (req, res, next) => {
  try { res.json(face.reactivatePerson(req.params.id, req.session.username)); } catch (error) { next(error); }
});

app.post("/api/admin/face/people/:id/code", (req, res, next) => {
  try { res.json(face.assignCode(req.params.id)); } catch (error) { next(error); }
});

app.patch("/api/admin/face/people/:id", (req, res, next) => {
  try { res.json(face.updatePerson(req.params.id, req.body || {}, req.session.username)); } catch (error) { next(error); }
});

app.delete("/api/admin/face/people/:id/face", (req, res, next) => {
  try { res.json(face.removeFace(req.params.id)); } catch (error) { next(error); }
});

app.delete("/api/admin/face/people/:id", (req, res, next) => {
  try { res.json(face.removePerson(req.params.id)); } catch (error) { next(error); }
});

app.get("/api/admin/face/audit", (_req, res) => {
  res.json(face.listAudit());
});

app.get("/api/health", (_req, res) => {
  reply(res, () => store.health());
});

app.get("/api/me", (req, res) => {
  reply(res, () => store.me(workerId(req)));
});

app.get("/api/face/status", (req, res) => {
  if (!requireActor(req, res)) return;
  const engine = engineStatus();
  res.json({
    engine: engine.ready ? "server" : "browser",
    modelReady: true,
    notice: engine.ready
      ? engine.message
      : "El navegador mide el rostro y el servidor decide el ingreso. Detectar un rostro no significa que ya esté identificado.",
    consent: face.CONSENT_TEXT,
  });
});

app.get("/api/face/today", (req, res) => {
  const session = requireActor(req, res);
  if (!session) return;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const worker = session.role === "worker" ? getWorkerById(session.id) : null;
  res.json(face.history({ date: today })
    .filter((event) => event.access === "permitido")
    .filter((event) => !worker || event.personId === worker.facePersonId || event.documentId === worker.id)
    .map((event) => ({
      id: event.id,
      at: event.at,
      name: event.name,
      personId: event.personId,
      result: event.result,
    })));
});

app.post("/api/face/verify", async (req, res, next) => {
  try {
    const session = requireActor(req, res);
    if (!session) return;
    const status = engineStatus();
    const reading = status.ready ? await analyzeFrames(req.body?.frames) : clientReading(req.body);
    res.json(face.verifyFace(reading, session.id));
  } catch (error) { next(error); }
});

app.post("/api/face/register", async (req, res, next) => {
  try {
    const session = requireActor(req, res);
    if (!session) return;
    const status = engineStatus();
    const reading = status.ready ? await analyzeFrames(req.body?.frames) : clientReading(req.body);
    const worker = session.role === "worker" ? getWorkerById(session.id) : null;
    const result = face.registerPerson({
      fullName: worker?.name || req.body?.fullName,
      documentId: worker?.id || req.body?.documentId,
      role: req.body?.role || worker?.role || "Trabajador",
      email: req.body?.email,
      consent: req.body?.consent,
      descriptor: reading.descriptor,
      liveness: reading.liveness,
      quality: reading.quality,
      workerId: worker?.id || "",
    }, session.id);
    if (worker && result.person?.id) linkWorkerFace(worker.id, result.person.id);
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/face/code", (req, res, next) => {
  try {
    const session = requireActor(req, res);
    if (!session) return;
    res.json(face.verifyCode({ documentId: req.body?.documentId, pin: req.body?.pin }, session.id));
  } catch (error) { next(error); }
});

app.get("/api/dashboard", (req, res) => {
  reply(res, () => store.dashboard(workerId(req)));
});

app.get("/api/courses", (req, res) => {
  reply(res, () => store.listCourses(workerId(req)));
});

app.get("/api/courses/:id", (req, res) => {
  reply(res, () => {
    const course = store.getCourse(req.params.id, workerId(req));
    if (!course) {
      const error = new Error("Ese curso no está en el taller.");
      error.status = 404;
      throw error;
    }
    return course;
  });
});

app.post("/api/courses/:id/lessons/:lessonId/complete", (req, res) => {
  reply(res, () => {
    const course = store.toggleLesson(req.params.id, req.params.lessonId, workerId(req));
    if (!course) {
      const error = new Error("No encontré esa lección.");
      error.status = 404;
      throw error;
    }
    return course;
  });
});

app.get("/api/courses/:id/quiz", (req, res) => {
  reply(res, () => {
    const quiz = store.getQuiz(req.params.id, workerId(req));
    if (!quiz) {
      const error = new Error("Ese curso no tiene práctica.");
      error.status = 404;
      throw error;
    }
    return quiz;
  });
});

app.post("/api/courses/:id/quiz", (req, res) => {
  try {
    const result = store.submitQuiz(req.params.id, req.body?.answers, workerId(req));
    if (!result) return res.status(404).json({ message: "Ese curso no tiene práctica." });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "No se pudo guardar la práctica." });
  }
});

app.get("/api/team", (_req, res) => {
  reply(res, () => store.listTeam());
});

app.get("/api/progress", (req, res) => {
  reply(res, () => store.progressReport(workerId(req)));
});

app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Esa ruta no existe." });
});

app.use(express.static(frontendDir));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  res.sendFile(path.join(frontendDir, "index.html"), (error) => {
    if (error) next();
  });
});

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  res.status(error.status || 500).json({ message: error.message || "No se pudo guardar." });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`API en http://localhost:${port}`);
  });
}

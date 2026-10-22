import { readDb, writeDb } from "./store.js";
import {
  approvePerson,
  assignCode,
  attendance,
  ensureFace,
  listAlerts,
  registerPerson,
  removePerson,
  suspendPerson,
  verifyCode,
  verifyFace,
} from "./faceStore.js";

function vector(index) {
  return Array.from({ length: 128 }, (_, place) => (place === index ? 1 : 0));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const started = Date.now();
const stamp = Date.now().toString().slice(-8);
const created = [];

try {
  ensureFace();
  let failed = false;
  try { registerPerson({ consent: false }); failed = true; } catch { failed = true; }
  assert(failed, "sin consentimiento debe fallar");

  const pending = registerPerson({
    fullName: `Prueba ${stamp}`,
    documentId: stamp,
    role: "Apoyo",
    email: "",
    consent: true,
    descriptor: vector(0),
    liveness: true,
    quality: true,
  });
  created.push(pending.person.id);
  assert(pending.status === "pendiente", "el registro queda pendiente");

  const blocked = verifyFace({ descriptor: vector(0), liveness: true, quality: true, staticImage: false });
  assert(blocked.access === "denegado" && blocked.reason === "pendiente", "pendiente no entra");

  approvePerson(pending.person.id);
  const allowed = verifyFace({ descriptor: vector(0), liveness: true, quality: true, staticImage: false });
  assert(allowed.access === "permitido", "autorizado entra");

  const unknown = verifyFace({ descriptor: vector(4), liveness: true, quality: true, staticImage: false });
  assert(unknown.access === "denegado" && unknown.reason === "desconocido", "rostro distinto se niega");

  const poor = verifyFace({ descriptor: null, liveness: false, quality: false, staticImage: false });
  assert(poor.access === "denegado" && poor.reason === "imagen", "imagen mala no autoriza");

  const photo = verifyFace({ descriptor: vector(0), liveness: false, quality: true, staticImage: true });
  assert(photo.access === "denegado" && photo.reason === "estatica", "foto fija no autoriza");

  suspendPerson(pending.person.id);
  const suspended = verifyFace({ descriptor: vector(0), liveness: true, quality: true, staticImage: false });
  assert(suspended.access === "denegado" && suspended.reason === "suspendido", "suspendido no entra");

  verifyFace({ descriptor: vector(6), liveness: true, quality: true, staticImage: false });
  verifyFace({ descriptor: vector(7), liveness: true, quality: true, staticImage: false });
  verifyFace({ descriptor: vector(8), liveness: true, quality: true, staticImage: false });
  const alerts = listAlerts().filter((alert) => !alert.reviewed);
  assert(alerts.length > 0, "los fallos crean una alerta");

  const code = assignCode(pending.person.id);
  const codeDenied = verifyCode({ documentId: stamp, pin: code.pin });
  assert(codeDenied.access === "denegado", "el código no salta una suspensión");

  const day = attendance();
  assert(day.entered.some((person) => person.id === pending.person.id) || day.denied.length > 0, "el día tiene registros");
  assert(day.counts.denied > 0, "el historial cuenta rechazos");

  console.log("face-check-ok");
} finally {
  for (const id of created) {
    try { removePerson(id); } catch { /* already removed */ }
  }
  const db = readDb();
  db.accessEvents = (db.accessEvents || []).filter((event) => event.documentId !== stamp && !(event.at >= started && !event.documentId));
  db.faceAlerts = (db.faceAlerts || []).filter((alert) => alert.documentId !== stamp && !(alert.at >= started && !alert.documentId));
  db.adminAudit = (db.adminAudit || []).filter((entry) => !String(entry.detail || "").includes(stamp));
  db.faceGuard = { count: 0, since: 0, until: 0, alerted: false };
  writeDb(db);
}

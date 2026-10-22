import { randomBytes, randomInt } from "crypto";
import { readDb, writeDb } from "./store.js";
import { hashPassword, checkPassword } from "./auth.js";
import { decryptTemplate, encryptTemplate } from "./faceCrypto.js";

export const CONSENT_TEXT = "Autorizo a Flores El Trigal, en El Carmen de Viboral, a guardar una plantilla cifrada de mi rostro solo para comprobar mi ingreso con NEXFLOR ID. No se guarda una foto. Un administrador debe aprobarme antes del primer ingreso y puedo pedir la actualización o la eliminación de estos datos. Ley 1581 de 2012 de Colombia.";
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const AUDIT_MS = 365 * 24 * 60 * 60 * 1000;
const FAIL_WINDOW = 15 * 60 * 1000;
const DUPLICATE_MS = 2 * 60 * 1000;
const MATCH_DISTANCE = 0.5;
const MATCH_MARGIN = 0.08;

const MESSAGES = {
  autorizado: "Acceso autorizado. Quedó registrada la entrada.",
  desconocido: "Persona no reconocida. El acceso fue denegado.",
  pendiente: "El registro está pendiente de aprobación. El acceso fue denegado.",
  rechazado: "Acceso denegado. El registro fue rechazado.",
  suspendido: "Acceso denegado. La autorización está suspendida.",
  presencia: "No se comprobó una persona presente. Parpadea, mueve un poco la cabeza y vuelve a intentar. El acceso no fue concedido.",
  imagen: "La imagen no alcanza para verificar la identidad. El acceso no fue concedido.",
  estatica: "La imagen parece una foto fija. El acceso fue denegado.",
  espera: "Hay varios intentos fallidos. Espera un momento antes de volver a intentar.",
  codigo: "El código o la identificación no coinciden. El acceso fue denegado.",
  listo: "Registro guardado. Un administrador debe aprobarlo antes de permitir el ingreso.",
  existe: "Esta identificación ya está registrada. No hace falta registrarla otra vez.",
};

function nid(prefix) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function bogotaDate(time = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(time));
}

export function ensureFace(db = readDb()) {
  let changed = false;
  if (!Array.isArray(db.facePeople)) { db.facePeople = []; changed = true; }
  if (!Array.isArray(db.accessEvents)) { db.accessEvents = []; changed = true; }
  if (!Array.isArray(db.faceAlerts)) { db.faceAlerts = []; changed = true; }
  if (!Array.isArray(db.adminAudit)) { db.adminAudit = []; changed = true; }
  if (!db.faceGuard) {
    db.faceGuard = { count: 0, since: 0, until: 0, alerted: false };
    changed = true;
  }
  if (changed) writeDb(db);
  return db;
}

function distance(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function bestMatch(descriptor, people) {
  const ranked = people
    .map((person) => {
      const stored = decryptTemplate(person.template);
      if (!stored) return null;
      return { person, distance: distance(descriptor, stored) };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  if (!best || best.distance > MATCH_DISTANCE) return null;
  const second = ranked[1];
  if (second && best.distance + MATCH_MARGIN > second.distance) return null;
  return best;
}

function publicPerson(person) {
  return {
    id: person.id,
    fullName: person.fullName,
    documentId: person.documentId,
    role: person.role || "",
    email: person.email || "",
    createdAt: person.createdAt,
    status: person.status,
    hasFace: Boolean(person.template),
    hasPin: Boolean(person.pinHash),
    consentAt: person.consentAt || null,
  };
}

function purge(db, now) {
  db.accessEvents = db.accessEvents.filter((event) => now - event.at < RETENTION_MS);
  db.faceAlerts = db.faceAlerts.filter((alert) => now - alert.at < RETENTION_MS);
  db.adminAudit = db.adminAudit.filter((entry) => now - entry.at < AUDIT_MS);
}

function audit(db, action, detail) {
  db.adminAudit.push({ id: nid("u"), at: Date.now(), action, detail });
}

function noteFailure(db, now, reason, person) {
  const guard = db.faceGuard;
  if (now - guard.since > FAIL_WINDOW) {
    guard.count = 0;
    guard.since = now;
    guard.alerted = false;
  }
  guard.count += 1;
  if (guard.count >= 5) guard.until = now + 60 * 1000;
  const known = person && (reason === "pendiente" || reason === "rechazado" || reason === "suspendido" || reason === "presencia");
  if (guard.count >= 3 && !guard.alerted) {
    guard.alerted = true;
    db.faceAlerts.push({
      id: nid("al"),
      at: now,
      kind: reason === "estatica" ? "suplantacion" : "fallos",
      personId: known ? person.id : null,
      name: known ? person.fullName : "Persona no reconocida",
      documentId: known ? person.documentId : "",
      reason,
      attempts: guard.count,
      reviewed: false,
      reviewedAt: null,
    });
  }
  if (reason === "estatica") {
    const recent = db.faceAlerts.some((alert) => alert.kind === "suplantacion" && !alert.reviewed && now - alert.at < FAIL_WINDOW);
    if (!recent) {
      db.faceAlerts.push({
        id: nid("al"),
        at: now,
        kind: "suplantacion",
        personId: person?.id || null,
        name: person?.fullName || "Persona no reconocida",
        documentId: person?.documentId || "",
        reason,
        attempts: guard.count,
        reviewed: false,
        reviewedAt: null,
      });
    }
  }
  return guard.count;
}

function recentEntry(db, personId, now) {
  return [...db.accessEvents].reverse().find((event) => (
    event.personId === personId && event.access === "permitido" && now - event.at < DUPLICATE_MS
  ));
}

function record(db, fields) {
  const event = {
    id: nid("a"),
    at: Date.now(),
    personId: fields.person?.id || null,
    name: fields.person?.fullName || null,
    documentId: fields.person?.documentId || "",
    result: fields.result,
    access: fields.access,
    reason: fields.reason || "",
    method: fields.method,
    attempts: fields.attempts || 0,
    by: fields.by || "",
  };
  db.accessEvents.push(event);
  return event;
}

export function summary(date = bogotaDate()) {
  const db = ensureFace();
  const events = db.accessEvents.filter((event) => bogotaDate(event.at) === date);
  return {
    date,
    entered: events.filter((event) => event.access === "permitido").length,
    denied: events.filter((event) => event.access === "denegado").length,
    pending: db.facePeople.filter((person) => person.status === "pendiente").length,
    modelReady: false,
  };
}

export function verifyFace({ descriptor, liveness, quality, staticImage }, actor = "") {
  const db = ensureFace();
  const now = Date.now();
  purge(db, now);
  if (db.faceGuard.until > now) {
    writeDb(db);
    return { access: "denegado", result: "denegado", reason: "espera", message: MESSAGES.espera, retry: true };
  }

  let person = null;
  let reason = "imagen";
  let access = "denegado";
  if (!quality || !descriptor) reason = "imagen";
  else if (staticImage) reason = "estatica";
  else {
    const match = bestMatch(descriptor, db.facePeople);
    person = match?.person || null;
    if (!person) reason = "desconocido";
    else if (!liveness) reason = "presencia";
    else if (person.status !== "autorizado") reason = person.status;
    else {
      access = "permitido";
      reason = "";
    }
  }

  let attempts = 0;
  if (access === "permitido") {
    db.faceGuard = { count: 0, since: now, until: 0, alerted: false };
    const previous = recentEntry(db, person.id, now);
    if (previous) {
      writeDb(db);
      return {
        access,
        result: previous.result,
        reason: "",
        message: "Esta persona ya tiene un ingreso en los últimos minutos. No se creó otro registro.",
        name: person.fullName,
        personId: person.id,
        eventId: previous.id,
        duplicate: true,
        retry: false,
        at: previous.at,
      };
    }
  } else {
    attempts = noteFailure(db, now, reason, person);
  }
  const event = record(db, {
    person: access === "permitido" || person ? person : null,
    result: access === "permitido" ? "autorizado" : "denegado",
    access,
    reason,
    method: "rostro",
    attempts,
    by: actor,
  });
  writeDb(db);
  return {
    access,
    result: event.result,
    reason,
    message: access === "permitido" ? MESSAGES.autorizado : MESSAGES[reason] || MESSAGES.imagen,
    name: access === "permitido" ? person.fullName : person && reason !== "desconocido" ? person.fullName : "Persona no reconocida",
    personId: person?.id || null,
    eventId: event.id,
    duplicate: false,
    retry: access !== "permitido",
    at: event.at,
  };
}

export function verifyCode({ documentId, pin }, actor = "") {
  const db = ensureFace();
  const now = Date.now();
  purge(db, now);
  if (db.faceGuard.until > now) {
    return { access: "denegado", result: "denegado", reason: "espera", message: MESSAGES.espera, retry: true };
  }
  const code = String(documentId || "").trim().toLowerCase();
  const person = db.facePeople.find((item) => item.documentId.toLowerCase() === code && item.pinHash);
  const valid = person ? checkPassword(String(pin || ""), person.pinHash) : false;
  let reason = "codigo";
  let access = "denegado";
  if (valid && person.status === "autorizado") {
    access = "permitido";
    reason = "";
    db.faceGuard = { count: 0, since: now, until: 0, alerted: false };
    const previous = recentEntry(db, person.id, now);
    if (previous) {
      writeDb(db);
      return {
        access,
        result: previous.result,
        reason: "",
        message: "Esta persona ya tiene un ingreso en los últimos minutos. No se creó otro registro.",
        name: person.fullName,
        personId: person.id,
        eventId: previous.id,
        duplicate: true,
        retry: false,
        at: previous.at,
      };
    }
  } else if (valid) {
    reason = person.status;
  }
  const attempts = access === "permitido" ? 0 : noteFailure(db, now, reason, valid ? person : null);
  const event = record(db, {
    person: valid ? person : null,
    result: access === "permitido" ? "autorizado" : "denegado",
    access,
    reason,
    method: "codigo",
    attempts,
    by: actor,
  });
  writeDb(db);
  return {
    access,
    result: access === "permitido" ? "autorizado" : "denegado",
    reason,
    message: access === "permitido" ? MESSAGES.autorizado : MESSAGES[reason] || MESSAGES.codigo,
    name: access === "permitido" ? person.fullName : "Persona no reconocida",
    personId: valid ? person.id : null,
    eventId: event.id,
    duplicate: false,
    retry: access !== "permitido",
    at: now,
  };
}

function cleanText(value, max) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function cleanCedula(value) {
  const document = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (!/^\d{6,10}$/.test(document)) {
    const error = new Error("La identificación es el número de la cédula, de 6 a 10 dígitos.");
    error.status = 400;
    throw error;
  }
  return document;
}

export function registerPerson({ fullName, documentId, role, email, consent, descriptor, liveness, quality, workerId }, actor = "") {
  if (consent !== true) {
    const error = new Error("Hace falta el consentimiento para guardar datos del rostro.");
    error.status = 400;
    throw error;
  }
  const name = cleanText(fullName, 80);
  const document = cleanCedula(documentId);
  const job = cleanText(role, 80);
  const mail = cleanText(email, 80);
  if (name.length < 3) {
    const error = new Error("Escribe el nombre completo.");
    error.status = 400;
    throw error;
  }
  if (job.length < 2) {
    const error = new Error("Escribe el cargo o el tipo de persona.");
    error.status = 400;
    throw error;
  }
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    const error = new Error("El correo no parece válido.");
    error.status = 400;
    throw error;
  }
  if (!quality || !descriptor) {
    const error = new Error(MESSAGES.imagen);
    error.status = 400;
    throw error;
  }
  if (!liveness) {
    const error = new Error(MESSAGES.presencia);
    error.status = 400;
    throw error;
  }
  const db = ensureFace();
  const existing = db.facePeople.find((person) => person.documentId.toLowerCase() === document.toLowerCase());
  if (existing) {
    return { already: true, status: existing.status, message: MESSAGES.existe, person: publicPerson(existing) };
  }
  const person = {
    id: nid("p"),
    fullName: name,
    documentId: document,
    role: job,
    email: mail,
    createdAt: Date.now(),
    status: "pendiente",
    consentAt: Date.now(),
    consentText: CONSENT_TEXT,
    template: encryptTemplate(descriptor),
    pinHash: "",
    workerId: workerId || "",
  };
  db.facePeople.push(person);
  audit(db, "registro", `${actor || "personal"} registró a ${person.fullName}. Quedó pendiente de aprobación.`);
  writeDb(db);
  return { already: false, status: "pendiente", message: MESSAGES.listo, person: publicPerson(person) };
}

function findPerson(db, id) {
  const person = db.facePeople.find((item) => item.id === id);
  if (!person) {
    const error = new Error("No encontré a esa persona.");
    error.status = 404;
    throw error;
  }
  return person;
}

function setStatus(id, status, action, actor) {
  const db = ensureFace();
  const person = findPerson(db, id);
  if (status === "autorizado" && !person.template && !person.pinHash) {
    const error = new Error("Aprueba solo si ya hay un rostro o un código alternativo.");
    error.status = 400;
    throw error;
  }
  person.status = status;
  audit(db, action, `${actor || "admin"} dejó a ${person.fullName} en ${status}.`);
  writeDb(db);
  return publicPerson(person);
}

export function approvePerson(id, actor) { return setStatus(id, "autorizado", "aprobar", actor); }
export function rejectPerson(id, actor) { return setStatus(id, "rechazado", "rechazar", actor); }
export function suspendPerson(id, actor) { return setStatus(id, "suspendido", "suspender", actor); }
export function reactivatePerson(id, actor) { return setStatus(id, "autorizado", "reactivar", actor); }

export function assignCode(id) {
  const db = ensureFace();
  const person = findPerson(db, id);
  const pin = String(randomInt(0, 1000000)).padStart(6, "0");
  person.pinHash = hashPassword(pin);
  audit(db, "codigo", `Se creó un código alternativo para ${person.fullName}.`);
  writeDb(db);
  return { person: publicPerson(person), pin };
}

export function removeFace(id) {
  const db = ensureFace();
  const person = findPerson(db, id);
  person.template = null;
  if (person.status === "autorizado" && !person.pinHash) person.status = "suspendido";
  audit(db, "eliminar-rostro", `Se eliminó la plantilla facial de ${person.fullName}.`);
  writeDb(db);
  return publicPerson(person);
}

export function updatePerson(id, { fullName, documentId, role, email }, actor) {
  const name = cleanText(fullName, 80);
  const document = cleanCedula(documentId);
  const job = cleanText(role, 80);
  const mail = cleanText(email, 80);
  if (name.length < 3) {
    const error = new Error("Escribe el nombre completo.");
    error.status = 400;
    throw error;
  }
  if (job.length < 2) {
    const error = new Error("Escribe el cargo o el tipo de persona.");
    error.status = 400;
    throw error;
  }
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    const error = new Error("El correo no parece válido.");
    error.status = 400;
    throw error;
  }
  const db = ensureFace();
  const person = findPerson(db, id);
  const taken = db.facePeople.find((item) => item.id !== id && item.documentId.toLowerCase() === document.toLowerCase());
  if (taken) {
    const error = new Error("Esa cédula ya pertenece a otra persona.");
    error.status = 409;
    throw error;
  }
  person.fullName = name;
  person.documentId = document;
  person.role = job;
  person.email = mail;
  audit(db, "actualizar", `${actor || "admin"} actualizó los datos de ${person.fullName}.`);
  writeDb(db);
  return publicPerson(person);
}

export function removePerson(id) {
  const db = ensureFace();
  const person = findPerson(db, id);
  db.facePeople = db.facePeople.filter((item) => item.id !== id);
  audit(db, "eliminar-persona", `Se eliminó el registro de ${person.fullName}.`);
  writeDb(db);
  return { ok: true };
}

export function listPeople() {
  return ensureFace().facePeople.map(publicPerson);
}

export function reviewAlert(id) {
  const db = ensureFace();
  const alert = db.faceAlerts.find((item) => item.id === id);
  if (!alert) {
    const error = new Error("No encontré esa alerta.");
    error.status = 404;
    throw error;
  }
  alert.reviewed = true;
  alert.reviewedAt = Date.now();
  audit(db, "alerta", `Se revisó la alerta de ${alert.name}.`);
  writeDb(db);
  return alert;
}

export function attendance(date = bogotaDate()) {
  const db = ensureFace();
  const day = db.accessEvents.filter((event) => bogotaDate(event.at) === date);
  const allowed = new Set(day.filter((event) => event.access === "permitido").map((event) => event.personId));
  const active = db.facePeople.filter((person) => person.status === "autorizado");
  const entered = active
    .filter((person) => allowed.has(person.id))
    .map((person) => {
      const first = day.find((event) => event.personId === person.id && event.access === "permitido");
      return { ...publicPerson(person), at: first?.at || null };
    });
  const absent = active.filter((person) => !allowed.has(person.id)).map(publicPerson);
  return {
    date,
    entered,
    absent,
    denied: day.filter((event) => event.access === "denegado").map(publicEvent),
    pending: db.facePeople.filter((person) => person.status === "pendiente").map(publicPerson),
    alerts: db.faceAlerts.filter((alert) => !alert.reviewed),
    history: day.map(publicEvent),
    counts: {
      entered: entered.length,
      absent: absent.length,
      denied: day.filter((event) => event.access === "denegado").length,
      pending: db.facePeople.filter((person) => person.status === "pendiente").length,
    },
  };
}

export function history({ date = "", from = "", to = "", documentId = "" } = {}) {
  const start = from || date;
  const end = to || date;
  const code = String(documentId || "").trim().toLowerCase();
  return ensureFace().accessEvents
    .filter((event) => {
      const day = bogotaDate(event.at);
      if (start && day < start) return false;
      if (end && day > end) return false;
      return true;
    })
    .filter((event) => !code || String(event.documentId || "").toLowerCase().includes(code) || String(event.name || "").toLowerCase().includes(code))
    .slice(-200)
    .reverse()
    .map(publicEvent);
}

function publicEvent(event) {
  return {
    id: event.id,
    at: event.at,
    personId: event.personId || null,
    name: event.name || "Persona no reconocida",
    documentId: event.documentId || "",
    result: event.result,
    access: event.access,
    reason: event.reason || "",
    method: event.method,
    attempts: event.attempts || 0,
  };
}

export function listAlerts() {
  return ensureFace().faceAlerts.slice().reverse();
}

export function listAudit() {
  return ensureFace().adminAudit.slice(-100).reverse();
}

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { readDb, writeDb } from "./store.js";

const SECRET = process.env.SESSION_SECRET || "serrania-admin-local";
const SESSION = 8 * 60 * 60 * 1000;
const LOCK_MS = 2 * 60 * 1000;
const MAX_TRIES = 5;
const attempts = { count: 0, until: 0 };

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  return next.length === prev.length && timingSafeEqual(next, prev);
}

const ACCOUNTS = [
  { id: "camilo", name: "Camilo Tobón", username: "camilo" },
  { id: "emiliano", name: "Emiliano Castañeda", username: "emiliano" },
];

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  const base = norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base || "trabajador";
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function guardAttempts() {
  if (Date.now() < attempts.until) {
    const minutes = Math.max(1, Math.ceil((attempts.until - Date.now()) / 60000));
    fail(`Demasiados intentos. Espera ${minutes} min para volver a entrar.`, 429);
  }
}

function rejectLogin() {
  attempts.count += 1;
  if (attempts.count >= MAX_TRIES) {
    attempts.count = 0;
    attempts.until = Date.now() + LOCK_MS;
  }
  fail("Usuario o contraseña incorrectos.", 401);
}

export function ensureAdmin() {
  const db = readDb();
  if (!Array.isArray(db.workers)) db.workers = [];
  const admins = Array.isArray(db.admins) ? db.admins : [];
  let changed = !Array.isArray(db.admins);
  db.admins = admins;
  for (const account of ACCOUNTS) {
    if (admins.some((item) => item.id === account.id)) continue;
    admins.push({ ...account, passwordHash: hashPassword("12345678") });
    changed = true;
  }
  if (changed) writeDb(db);
  return db.admins;
}

function sign(role, id) {
  const body = `${role}.${id}.${Date.now() + SESSION}`;
  const sig = createHmac("sha256", SECRET).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function readSession(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 4) return null;
  const [role, id, exp, sig] = parts;
  const body = `${role}.${id}.${exp}`;
  const expected = createHmac("sha256", SECRET).update(body).digest("hex");
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if ((role !== "admin" && role !== "worker") || Number(exp) <= Date.now()) return null;
  return { role, id };
}

export function verifyAdmin(token) {
  return readSession(token)?.role === "admin";
}

function samePerson(account, typed) {
  const value = norm(typed);
  if (!value) return false;
  return value === norm(account.name) || value === account.username || value === norm(account.name).split(" ")[0];
}

export function loginAdmin(username, password) {
  guardAttempts();
  const admins = ensureAdmin();
  const admin = admins.find((item) => samePerson(item, username));
  if (!admin || !checkPassword(password, admin.passwordHash)) rejectLogin();
  attempts.count = 0;
  attempts.until = 0;
  return { token: sign("admin", admin.id), name: admin.name, username: admin.username, role: "admin" };
}

function cleanWorkerName(name, password) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  if (clean.length < 3) fail("Escribe tu nombre completo.", 400);
  if (String(password || "").length < 4) fail("La contraseña necesita al menos 4 caracteres.", 400);
  return clean;
}

function rejectUnknown() {
  attempts.count += 1;
  if (attempts.count >= MAX_TRIES) {
    attempts.count = 0;
    attempts.until = Date.now() + LOCK_MS;
  }
  fail("No hay una cuenta con ese nombre. Créala primero.", 401);
}

function freshWorker(db, clean, password, shift) {
  let id = slug(clean);
  let n = 2;
  while (db.workers.some((item) => item.id === id) || db.team.some((item) => item.id === id)) {
    id = `${slug(clean)}-${n}`;
    n += 1;
  }
  const worker = {
    id,
    name: clean,
    passwordHash: hashPassword(password),
    role: "Trabajador",
    shift: shift === "Tarde" ? "Tarde" : "Mañana",
    focus: "Recién llegado",
    progress: 0,
    completedLessons: [],
    attempts: [],
    continueCourseId: "preparacion-segura",
  };
  db.workers.push(worker);
  db.team.push({
    id: worker.id,
    name: worker.name,
    role: "Trabajador",
    shift: worker.shift,
    focus: "Recién llegado",
    progress: 0,
  });
  return worker;
}

export function registerWorker(name, password, shift) {
  const clean = cleanWorkerName(name, password);
  ensureAdmin();
  const db = readDb();
  if ((db.admins || []).some((item) => samePerson(item, clean))) {
    fail("Ese nombre es de un administrador. Entra por esa opción.", 400);
  }
  if (!Array.isArray(db.workers)) db.workers = [];
  if (db.workers.some((item) => norm(item.name) === norm(clean))) {
    fail("Esa cuenta ya existe. Entra con tu nombre y contraseña.", 400);
  }
  const worker = freshWorker(db, clean, password, shift);
  writeDb(db);
  return { token: sign("worker", worker.id), name: worker.name, role: "worker" };
}

export function loginWorker(name, password) {
  guardAttempts();
  const clean = cleanWorkerName(name, password);
  ensureAdmin();
  const db = readDb();
  if ((db.admins || []).some((item) => samePerson(item, clean))) {
    fail("Ese nombre es de un administrador. Entra por esa opción.", 400);
  }
  if (!Array.isArray(db.workers)) db.workers = [];
  const worker = db.workers.find((item) => norm(item.name) === norm(clean));
  if (!worker) rejectUnknown();
  if (!checkPassword(password, worker.passwordHash)) rejectLogin();
  attempts.count = 0;
  attempts.until = 0;
  return { token: sign("worker", worker.id), name: worker.name, role: "worker" };
}

function publicStaff(person) {
  return {
    id: person.id,
    username: person.username,
    name: person.name,
    role: person.role,
    active: person.active === true,
    createdAt: person.createdAt,
  };
}

export function ensureStaff() {
  const db = readDb();
  if (!Array.isArray(db.staff)) {
    db.staff = [];
    writeDb(db);
  }
  return db.staff;
}

export function listStaff() {
  return ensureStaff().map(publicStaff);
}

export function createStaff(body) {
  const username = String(body?.username || "").trim().toLowerCase();
  const name = String(body?.name || "").trim().replace(/\s+/g, " ");
  const password = String(body?.password || "");
  if (!/^[a-z0-9]{3,20}$/.test(username)) fail("El usuario debe tener entre 3 y 20 letras o números.", 400);
  if (name.length < 3) fail("Escribe el nombre.", 400);
  if (password.length < 6) fail("La contraseña necesita al menos 6 caracteres.", 400);
  const db = readDb();
  if (!Array.isArray(db.staff)) db.staff = [];
  if (db.staff.some((item) => item.username === username)) fail("Ese usuario ya existe.", 409);
  const person = {
    id: `s_${randomBytes(4).toString("hex")}`,
    username,
    name,
    role: "portero",
    active: true,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
  };
  db.staff.push(person);
  writeDb(db);
  return publicStaff(person);
}

export function setStaffActive(id, active) {
  const db = readDb();
  const person = (db.staff || []).find((item) => item.id === id);
  if (!person) fail("Esa cuenta no está.", 404);
  person.active = active === true;
  writeDb(db);
  return publicStaff(person);
}

export function getWorkerById(id) {
  return (readDb().workers || []).find((item) => item.id === id) || null;
}

export function linkWorkerFace(workerId, personId) {
  const db = readDb();
  const worker = (db.workers || []).find((item) => item.id === workerId);
  if (!worker) return null;
  worker.facePersonId = personId;
  writeDb(db);
  return worker.id;
}

export function saveWorkerDocument(workerId, documentId) {
  const document = String(documentId || "").trim();
  if (!/^\d{6,10}$/.test(document)) return null;
  const db = readDb();
  const worker = (db.workers || []).find((item) => item.id === workerId);
  if (!worker) return null;
  worker.documentId = document;
  writeDb(db);
  return document;
}

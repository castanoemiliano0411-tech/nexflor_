import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readDb, writeDb } from "./store.js";

const uploadsDir = process.env.VERCEL
  ? path.join("/tmp", "nexflor-uploads")
  : path.join(path.dirname(fileURLToPath(import.meta.url)), "../uploads");

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function slug(value) {
  const base = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "item";
}

function uniqueId(list, wanted) {
  let id = wanted;
  let n = 2;
  while (list.some((item) => item.id === id)) {
    id = `${wanted}-${n}`;
    n += 1;
  }
  return id;
}

function courseOrFail(db, id) {
  const course = db.courses.find((item) => item.id === id);
  if (!course) fail("Ese curso no existe.", 404);
  return course;
}

export function overview() {
  const db = readDb();
  const pendingFaces = (db.facePeople || []).filter((person) => person.status === "pendiente").length;
  return {
    courses: db.courses.map((course) => ({
      id: course.id,
      title: course.title,
      summary: course.summary,
      category: course.category,
      minutes: course.minutes,
      level: course.level,
      image: course.image,
      lessons: course.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        minutes: lesson.minutes,
        kind: lesson.kind,
      })),
    })),
    team: db.team,
    files: listFiles(),
    pendingFaces,
  };
}

export function saveCourse(input, id) {
  const db = readDb();
  const title = String(input.title || "").trim();
  if (!title) fail("El curso necesita un título.");
  const fields = {
    title,
    summary: String(input.summary || "").trim(),
    category: String(input.category || "Taller").trim(),
    level: String(input.level || "Base").trim(),
    minutes: Number(input.minutes) || 10,
    image: String(input.image || "").trim(),
  };
  if (id) {
    const course = courseOrFail(db, id);
    Object.assign(course, fields);
    writeDb(db);
    return course;
  }
  const course = {
    id: uniqueId(db.courses, slug(title)),
    ...fields,
    gallery: [],
    lessons: [],
    quiz: [],
  };
  db.courses.push(course);
  writeDb(db);
  return course;
}

export function removeCourse(id) {
  const db = readDb();
  const index = db.courses.findIndex((item) => item.id === id);
  if (index < 0) fail("Ese curso no existe.", 404);
  db.courses.splice(index, 1);
  db.progress.completedLessons = db.progress.completedLessons.filter((key) => !key.startsWith(`${id}:`));
  db.progress.attempts = db.progress.attempts.filter((attempt) => attempt.courseId !== id);
  writeDb(db);
  return { ok: true };
}

export function saveLesson(courseId, input, lessonId) {
  const db = readDb();
  const course = courseOrFail(db, courseId);
  const title = String(input.title || "").trim();
  if (!title) fail("La lección necesita un título.");
  const fields = {
    title,
    minutes: Number(input.minutes) || 5,
    kind: ["video", "lectura", "practica"].includes(input.kind) ? input.kind : "lectura",
  };
  if (lessonId) {
    const lesson = course.lessons.find((item) => item.id === lessonId);
    if (!lesson) fail("Esa lección no existe.", 404);
    Object.assign(lesson, fields);
  } else {
    course.lessons.push({
      id: uniqueId(course.lessons, slug(title)),
      ...fields,
    });
  }
  course.minutes = course.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0) || course.minutes;
  writeDb(db);
  return course;
}

export function removeLesson(courseId, lessonId) {
  const db = readDb();
  const course = courseOrFail(db, courseId);
  const index = course.lessons.findIndex((item) => item.id === lessonId);
  if (index < 0) fail("Esa lección no existe.", 404);
  course.lessons.splice(index, 1);
  db.progress.completedLessons = db.progress.completedLessons.filter((key) => key !== `${courseId}:${lessonId}`);
  writeDb(db);
  return course;
}

export function moveLesson(courseId, lessonId, direction) {
  const db = readDb();
  const course = courseOrFail(db, courseId);
  const index = course.lessons.findIndex((item) => item.id === lessonId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= course.lessons.length) return course;
  const [lesson] = course.lessons.splice(index, 1);
  course.lessons.splice(next, 0, lesson);
  writeDb(db);
  return course;
}

export function savePerson(input, id) {
  const db = readDb();
  const name = String(input.name || "").trim();
  if (!name) fail("La persona necesita un nombre.");
  const fields = {
    name,
    role: String(input.role || "Florista").trim(),
    shift: input.shift === "Tarde" ? "Tarde" : "Mañana",
    focus: String(input.focus || "").trim(),
    progress: Math.max(0, Math.min(100, Number(input.progress) || 0)),
  };
  if (id) {
    const person = db.team.find((item) => item.id === id);
    if (!person) fail("Esa persona no está en el equipo.", 404);
    Object.assign(person, fields);
    writeDb(db);
    return person;
  }
  const person = { id: uniqueId(db.team, slug(name)), ...fields };
  db.team.push(person);
  writeDb(db);
  return person;
}

export function removePerson(id) {
  const db = readDb();
  if (id === "laura") fail("Laura es la cuenta del taller y no se puede borrar.");
  const index = db.team.findIndex((item) => item.id === id);
  if (index < 0) fail("Esa persona no está en el equipo.", 404);
  db.team.splice(index, 1);
  writeDb(db);
  return { ok: true };
}

export function listFiles() {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    return fs.readdirSync(uploadsDir)
      .filter((name) => fs.statSync(path.join(uploadsDir, name)).isFile())
      .map((name) => ({ name, url: `/api/uploads/${name}` }));
  } catch {
    return [];
  }
}

export function saveFile(name, dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!match) fail("Sube una imagen JPG, PNG, WEBP o GIF.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 3 * 1024 * 1024) fail("La imagen pesa más de 3 MB.");
  const ext = match[1].split("/")[1].replace("jpeg", "jpg");
  const safe = `${slug(path.parse(name || "imagen").name)}-${Date.now()}.${ext}`;
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, safe), buffer);
  return { name: safe, url: `/api/uploads/${safe}` };
}

export function removeFile(name) {
  const safe = path.basename(name);
  const root = path.resolve(uploadsDir);
  const target = path.resolve(uploadsDir, safe);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target)) fail("Ese archivo no está.", 404);
  fs.unlinkSync(target);
  return { ok: true };
}

export { uploadsDir };

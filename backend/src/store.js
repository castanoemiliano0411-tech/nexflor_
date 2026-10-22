import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enrich } from "./teach.js";

const bundled = path.join(path.dirname(fileURLToPath(import.meta.url)), "../data/db.json");

function dataFile() {
  if (!process.env.VERCEL) return bundled;
  const copy = path.join("/tmp", "nexflor-db.json");
  if (!fs.existsSync(copy)) fs.copyFileSync(bundled, copy);
  return copy;
}

function loadDatabase() {
  return JSON.parse(fs.readFileSync(dataFile(), "utf8"));
}

function write(data) {
  fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2));
}

export function readDb() {
  return loadDatabase();
}

export function writeDb(data) {
  write(data);
}

function lessonKey(courseId, lessonId) {
  return `${courseId}:${lessonId}`;
}

function courseProgress(course, completed) {
  const total = course.lessons.length;
  const done = course.lessons.filter((lesson) => completed.has(lessonKey(course.id, lesson.id))).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

function publicCourse(course, completed) {
  const progress = courseProgress(course, completed);
  return {
    id: course.id,
    title: course.title,
    summary: course.summary,
    category: course.category,
    minutes: course.minutes,
    level: course.level,
    image: course.image,
    lessons: course.lessons.length,
    progress,
    gameTitle: course.game?.title || null,
  };
}

function progressBag(db, workerId) {
  if (!workerId) return db.progress;
  const worker = (db.workers || []).find((item) => item.id === workerId);
  if (!worker) return { completedLessons: [], attempts: [] };
  if (!Array.isArray(worker.completedLessons)) worker.completedLessons = [];
  if (!Array.isArray(worker.attempts)) worker.attempts = [];
  return worker;
}

function completedSet(db, workerId) {
  return new Set(progressBag(db, workerId).completedLessons);
}

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function health() {
  return { ok: true };
}

export function me(workerId) {
  const db = loadDatabase();
  const worker = workerId && (db.workers || []).find((item) => item.id === workerId);
  if (!worker) return db.user;
  return {
    id: worker.id,
    name: worker.name.split(" ")[0],
    fullName: worker.name,
    role: "Trabajador",
    initials: initials(worker.name),
    continueCourseId: worker.continueCourseId || db.user.continueCourseId,
  };
}

export function listCourses(workerId) {
  const db = loadDatabase();
  const completed = completedSet(db, workerId);
  return db.courses.map((course) => publicCourse(enrich(course), completed));
}

export function getCourse(id, workerId) {
  const db = loadDatabase();
  const found = db.courses.find((item) => item.id === id);
  if (!found) return null;
  const course = enrich(found);
  const completed = completedSet(db, workerId);
  const progress = courseProgress(course, completed);
  const lastAttempt = [...progressBag(db, workerId).attempts].reverse().find((attempt) => attempt.courseId === id) || null;
  return {
    ...publicCourse(course, completed),
    gallery: course.gallery,
    lessons: course.lessons.map((lesson) => ({
      ...lesson,
      done: completed.has(lessonKey(course.id, lesson.id)),
    })),
    progress,
    game: course.game,
    quiz: {
      questions: course.quiz.length,
      lastScore: lastAttempt ? lastAttempt.percent : null,
    },
  };
}

export function toggleLesson(courseId, lessonId, workerId) {
  const db = loadDatabase();
  const course = db.courses.find((item) => item.id === courseId);
  if (!course) return null;
  const lesson = course.lessons.find((item) => item.id === lessonId);
  if (!lesson) return null;
  const key = lessonKey(courseId, lessonId);
  const bag = progressBag(db, workerId);
  const list = bag.completedLessons;
  const index = list.indexOf(key);
  if (index >= 0) list.splice(index, 1);
  else list.push(key);
  const all = db.courses.reduce((sum, item) => sum + item.lessons.length, 0);
  const percent = all ? Math.round(list.length / all * 100) : 0;
  const personId = workerId || "laura";
  const person = db.team.find((item) => item.id === personId);
  if (person) person.progress = percent;
  if (workerId) {
    const worker = (db.workers || []).find((item) => item.id === workerId);
    if (worker) worker.progress = percent;
  }
  write(db);
  return getCourse(courseId, workerId);
}

export function getQuiz(courseId, workerId) {
  const db = loadDatabase();
  const course = db.courses.find((item) => item.id === courseId);
  if (!course) return null;
  const lastAttempt = [...progressBag(db, workerId).attempts].reverse().find((attempt) => attempt.courseId === courseId) || null;
  return {
    courseId: course.id,
    courseTitle: course.title,
    title: "Pon en práctica lo que aprendiste",
    summary: "Cuatro situaciones del mesón. No hay trampa: es lo mismo que se hace en el turno.",
    questions: course.quiz.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options.map(({ id, text }) => ({ id, text })),
    })),
    lastAttempt: lastAttempt
      ? { percent: lastAttempt.percent, score: lastAttempt.score, total: lastAttempt.total, at: lastAttempt.at }
      : null,
  };
}

export function submitQuiz(courseId, answers, workerId) {
  const db = loadDatabase();
  const course = db.courses.find((item) => item.id === courseId);
  if (!course) return null;
  if (!answers || typeof answers !== "object") {
    const error = new Error("Faltan las respuestas.");
    error.status = 400;
    throw error;
  }
  const results = course.quiz.map((question) => {
    const chosen = answers[question.id] || null;
    return {
      id: question.id,
      chosen,
      correctOptionId: question.correct,
      correct: chosen === question.correct,
    };
  });
  const score = results.filter((item) => item.correct).length;
  const total = results.length;
  const attempt = {
    courseId,
    score,
    total,
    percent: total ? Math.round((score / total) * 100) : 0,
    at: new Date().toISOString(),
  };
  progressBag(db, workerId).attempts.push(attempt);
  write(db);
  return { ...attempt, results };
}

export function listTeam() {
  const db = loadDatabase();
  const average = db.team.length
    ? Math.round(db.team.reduce((sum, person) => sum + person.progress, 0) / db.team.length)
    : 0;
  return {
    title: "El equipo del cultivo",
    summary: "Cada persona tiene su recorrido. Aquí se ve quién va al día en las camas, la poscosecha y la seguridad.",
    stats: [
      { label: "Personas", value: String(db.team.length) },
      { label: "Turno mañana", value: String(db.team.filter((person) => person.shift === "Mañana").length) },
      { label: "Turno tarde", value: String(db.team.filter((person) => person.shift === "Tarde").length) },
      { label: "Avance del equipo", value: `${average}%` },
    ],
    people: db.team,
  };
}

export function progressReport(workerId) {
  const db = loadDatabase();
  const completed = completedSet(db, workerId);
  const bag = progressBag(db, workerId);
  const learner = workerId ? me(workerId).name : db.user.name;
  const courses = db.courses.map((course) => {
    const progress = courseProgress(course, completed);
    return {
      id: course.id,
      title: course.title,
      category: course.category,
      percent: progress.percent,
      done: progress.done,
      total: progress.total,
      minutes: course.minutes,
    };
  });
  const minutesDone = db.courses.reduce((sum, course) => {
    const doneMinutes = course.lessons
      .filter((lesson) => completed.has(lessonKey(course.id, lesson.id)))
      .reduce((inner, lesson) => inner + lesson.minutes, 0);
    return sum + doneMinutes;
  }, 0);
  const pendingPractice = db.courses.filter((course) => {
    const attempt = bag.attempts.some((item) => item.courseId === course.id);
    const progress = courseProgress(course, completed);
    return progress.percent > 0 && !attempt;
  }).length;
  return {
    title: "Aprendizaje de cada recorrido",
    summary: `Lo que ${learner} ya cerró y lo que sigue abierto en el taller.`,
    stats: [
      { label: "Cursos sin empezar", value: String(courses.filter((course) => course.percent === 0).length) },
      { label: "Lecciones listas", value: String(courses.reduce((sum, course) => sum + course.done, 0)) },
      { label: "Minutos vistos", value: String(minutesDone) },
      { label: "Prácticas pendientes", value: String(pendingPractice) },
    ],
    courses,
    people: db.team.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      focus: person.focus,
      progress: person.progress,
    })),
  };
}

export function dashboard(workerId) {
  const db = loadDatabase();
  const person = me(workerId);
  const completed = completedSet(db, workerId);
  const bag = progressBag(db, workerId);
  const courses = db.courses.map((course) => ({ course, progress: courseProgress(course, completed) }));
  const continueCourse = db.courses.find((course) => course.id === person.continueCourseId) || db.courses[0];
  const continueProgress = courseProgress(continueCourse, completed);
  const nextLesson = continueCourse.lessons.find((lesson) => !completed.has(lessonKey(continueCourse.id, lesson.id)))
    || continueCourse.lessons[0];
  const lessonsDone = courses.reduce((sum, item) => sum + item.progress.done, 0);
  const lessonsTotal = courses.reduce((sum, item) => sum + item.progress.total, 0);
  const average = lessonsTotal ? Math.round((lessonsDone / lessonsTotal) * 100) : 0;
  const openCourses = courses.filter((item) => item.progress.percent > 0 && item.progress.percent < 100).length;
  const pendingQuiz = courses.filter((item) => !bag.attempts.some((attempt) => attempt.courseId === item.course.id)).length;

  const tasks = db.courses.flatMap((course) => course.lessons
    .filter((lesson) => !completed.has(lessonKey(course.id, lesson.id)))
    .slice(0, 1)
    .map((lesson) => ({
      id: lessonKey(course.id, lesson.id),
      title: lesson.title,
      meta: course.title,
      href: `/cursos/${course.id}`,
    }))).slice(0, 4);

  const hour = new Date().getHours();
  const hello = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  return {
    greeting: `${hello}, ${person.name}`,
    subtitle: "Las plantas, las camas y el despacho, en el orden en que se trabaja.",
    banner: {
      kicker: "Sigue donde lo dejaste",
      title: "El cultivo, paso a paso.",
      text: `${continueCourse.title}. Lección abierta: ${nextLesson.title}.`,
      cta: "Continuar",
      href: `/cursos/${continueCourse.id}`,
      image: continueCourse.image,
    },
    stats: [
      { label: "Lecciones listas", value: String(lessonsDone), hint: `de ${lessonsTotal}` },
      { label: "Avance general", value: `${average}%`, hint: "de todo el recorrido" },
      { label: "Cursos abiertos", value: String(openCourses), hint: "empezados y sin cerrar" },
      { label: "Prácticas por hacer", value: String(pendingQuiz), hint: "aún sin intento" },
    ],
    tasks,
    tracks: courses.slice(0, 3).map((item) => ({
      id: item.course.id,
      label: item.course.title,
      value: item.progress.percent,
    })),
    continueProgress,
  };
}

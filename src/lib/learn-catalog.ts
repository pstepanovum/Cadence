import "server-only";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Lesson, LessonWord, Module } from "@/lib/learn";

interface LearnCatalog {
  modules: Module[];
  moduleBySlug: Map<string, Module>;
  lessonById: Map<string, Lesson>;
  lessonByModuleAndSlug: Map<string, Lesson>;
  lessonsByModuleId: Map<number, Lesson[]>;
}

let catalogPromise: Promise<LearnCatalog> | null = null;

export async function getLearnCatalog(): Promise<LearnCatalog> {
  if (!catalogPromise) {
    catalogPromise = loadLearnCatalog();
  }
  try {
    return await catalogPromise;
  } catch (err) {
    catalogPromise = null;
    throw err;
  }
}

export async function getModuleFromCatalog(slug: string) {
  const catalog = await getLearnCatalog();
  return catalog.moduleBySlug.get(slug) ?? null;
}

export async function getLessonFromCatalog(moduleId: number, lessonSlug: string) {
  const catalog = await getLearnCatalog();
  return catalog.lessonByModuleAndSlug.get(`${moduleId}:${lessonSlug}`) ?? null;
}

export async function getLessonByIdFromCatalog(lessonId: string) {
  const catalog = await getLearnCatalog();
  return catalog.lessonById.get(lessonId) ?? null;
}

const CATALOG_FILENAMES = ["modules.sql", "learn_catalog.sql"] as const;

function findCatalogSqlUnderDir(startDir: string): string | null {
  let current = path.resolve(startDir);

  for (let depth = 0; depth < 16; depth += 1) {
    for (const name of CATALOG_FILENAMES) {
      const candidate = path.join(current, "supabase", name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function resolveLearnCatalogSqlPath(): string {
  const tried: string[] = [];

  const envPath = process.env.CADENCE_MODULES_SQL_PATH;
  if (envPath) {
    tried.push(envPath);
    if (existsSync(envPath)) {
      return envPath;
    }
  }

  const fromCwd = findCatalogSqlUnderDir(process.cwd());
  if (fromCwd) {
    return fromCwd;
  }

  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const fromModule = findCatalogSqlUnderDir(moduleDir);
    if (fromModule) {
      return fromModule;
    }
  } catch {
    /* import.meta.url unavailable */
  }

  throw new Error(
    `Could not find module catalog SQL (supabase/modules.sql). cwd=${process.cwd()}. ` +
      `Set CADENCE_MODULES_SQL_PATH or ensure supabase/modules.sql exists. Tried env: ${tried.join(", ") || "(none)"}; walked from cwd and from learn-catalog module path.`,
  );
}

async function loadLearnCatalog(): Promise<LearnCatalog> {
  const seedPath = resolveLearnCatalogSqlPath();
  const sql = await readFile(seedPath, "utf8");

  const modules = parseModules(sql);
  const lessons = parseLessons(sql);
  const wordsByLessonId = parseLessonWords(sql);

  const hydratedLessons = lessons.map((lesson) => ({
    ...lesson,
    words: (wordsByLessonId.get(lesson.id) ?? []).sort(
      (left, right) => left.sort_order - right.sort_order,
    ),
  }));

  const moduleBySlug = new Map(modules.map((module) => [module.slug, module]));
  const lessonById = new Map(hydratedLessons.map((lesson) => [lesson.id, lesson]));
  const lessonByModuleAndSlug = new Map(
    hydratedLessons.map((lesson) => [`${lesson.module_id}:${lesson.slug}`, lesson]),
  );
  const lessonsByModuleId = new Map<number, Lesson[]>();

  for (const lesson of hydratedLessons) {
    const nextLessons = lessonsByModuleId.get(lesson.module_id) ?? [];
    nextLessons.push(lesson);
    lessonsByModuleId.set(lesson.module_id, nextLessons);
  }

  for (const [moduleId, moduleLessons] of lessonsByModuleId) {
    lessonsByModuleId.set(
      moduleId,
      [...moduleLessons].sort((left, right) => left.sort_order - right.sort_order),
    );
  }

  const sortedModules = modules.sort((left, right) => left.sort_order - right.sort_order);

  if (sortedModules.length === 0 || lessons.length === 0) {
    throw new Error(
      "Learn catalog parsed no modules or lessons — check supabase/modules.sql INSERT blocks and file encoding.",
    );
  }

  return {
    modules: sortedModules,
    moduleBySlug,
    lessonById,
    lessonByModuleAndSlug,
    lessonsByModuleId,
  };
}

function parseModules(sql: string): Module[] {
  const rows = getInsertRows(sql, "modules");
  return rows.map((row) => {
    const [id, slug, title, description, phonemeFocus, sortOrder] = splitSqlValues(row);

    return {
      id: Number(id),
      slug: readSqlString(slug) ?? "",
      title: readSqlString(title) ?? "",
      description: readSqlString(description) ?? "",
      phoneme_focus: readSqlArray(phonemeFocus),
      sort_order: Number(sortOrder),
    };
  });
}

function parseLessons(sql: string): Lesson[] {
  const rows = getInsertRows(sql, "lessons");
  return rows.map((row) => {
    const [id, moduleId, slug, title, lessonType, sortOrder, theoryHtml] =
      splitSqlValues(row);

    return {
      id: readSqlString(id) ?? "",
      module_id: Number(moduleId),
      slug: readSqlString(slug) ?? "",
      title: readSqlString(title) ?? "",
      lesson_type: (readSqlString(lessonType) ?? "theory") as Lesson["lesson_type"],
      sort_order: Number(sortOrder),
      theory_html: readSqlString(theoryHtml),
      words: [],
    };
  });
}

function parseLessonWords(sql: string): Map<string, LessonWord[]> {
  const rows = getInsertRows(sql, "lesson_words");
  const wordsByLessonId = new Map<string, LessonWord[]>();

  for (const row of rows) {
    const [lessonIdToken, wordToken, ipaToken, sortOrderToken] = splitSqlValues(row);
    const lessonId = readSqlString(lessonIdToken) ?? "";
    const word: LessonWord = {
      id: `${lessonId}:${Number(sortOrderToken)}`,
      word: readSqlString(wordToken) ?? "",
      ipa: readSqlString(ipaToken) ?? "",
      sort_order: Number(sortOrderToken),
    };

    const nextWords = wordsByLessonId.get(lessonId) ?? [];
    nextWords.push(word);
    wordsByLessonId.set(lessonId, nextWords);
  }

  return wordsByLessonId;
}

function getInsertRows(sql: string, tableName: string) {
  const match = sql.match(
    new RegExp(
      `INSERT INTO public\\.${tableName} \\([^)]*\\) VALUES([\\s\\S]*?)ON CONFLICT`,
      "m",
    ),
  );

  if (!match) {
    throw new Error(`Could not find seed data for ${tableName}.`);
  }

  return splitSqlRows(match[1]);
}

function splitSqlRows(valuesBlock: string) {
  const rows: string[] = [];
  let buffer = "";
  let depth = 0;
  let insideString = false;

  for (let index = 0; index < valuesBlock.length; index += 1) {
    const char = valuesBlock[index];
    const nextChar = valuesBlock[index + 1];

    if (char === "'") {
      if (depth > 0) {
        buffer += char;
      }

      if (insideString && nextChar === "'") {
        if (depth > 0) {
          buffer += nextChar;
        }
        index += 1;
        continue;
      }

      insideString = !insideString;
      continue;
    }

    if (insideString) {
      buffer += char;
      continue;
    }

    if (char === "(") {
      if (depth === 0) {
        buffer = "";
      }

      depth += 1;
      buffer += char;
      continue;
    }

    if (depth === 0) {
      continue;
    }

    buffer += char;

    if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        const trimmed = buffer.trim();
        if (trimmed) {
          rows.push(trimmed.slice(1, -1));
        }
        buffer = "";
      }
    }
  }

  return rows;
}

function splitSqlValues(row: string) {
  const values: string[] = [];
  let buffer = "";
  let depth = 0;
  let insideString = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const nextChar = row[index + 1];

    if (char === "'") {
      buffer += char;

      if (insideString && nextChar === "'") {
        buffer += nextChar;
        index += 1;
        continue;
      }

      insideString = !insideString;
      continue;
    }

    if (!insideString && (char === "(" || char === "[")) {
      depth += 1;
      buffer += char;
      continue;
    }

    if (!insideString && (char === ")" || char === "]")) {
      depth -= 1;
      buffer += char;
      continue;
    }

    if (!insideString && depth === 0 && char === ",") {
      values.push(buffer.trim());
      buffer = "";
      continue;
    }

    buffer += char;
  }

  const lastValue = buffer.trim();
  if (lastValue) {
    values.push(lastValue);
  }

  return values;
}

function readSqlString(token: string) {
  const trimmed = token.trim();

  if (trimmed === "NULL") {
    return null;
  }

  if (!trimmed.startsWith("'") || !trimmed.endsWith("'")) {
    return trimmed;
  }

  return trimmed.slice(1, -1).replaceAll("''", "'");
}

function readSqlArray(token: string) {
  const trimmed = token.trim();

  if (!trimmed.startsWith("ARRAY[")) {
    return [];
  }

  const inner = trimmed.slice("ARRAY[".length, -1);
  return splitSqlValues(inner)
    .map((value) => readSqlString(value))
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
}

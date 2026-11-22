/**
 * JSON file-based database — drop-in replacement for better-sqlite3.
 * Each table is stored as data/db/<table>.json (array of row objects).
 *
 * Supported API:
 *   db.prepare(sql).run(...params)
 *   db.prepare(sql).get(...params)
 *   db.prepare(sql).all(...params)
 *   db.transaction(fn)(args)
 *   db.exec(sql)   — no-op (DDL handled inline)
 *   db.pragma(...) — no-op
 *
 * Value binding: both `?` placeholders and inline literals ('pending', 42, NULL,
 * datetime('now')) are supported in WHERE, SET and VALUES clauses. Parameters are
 * numbered independently per clause, exactly like the queries in this project use
 * them.
 *
 * Known limitation: SELECT does not honour column aliases (`v.id AS video_id`),
 * so read the underlying column name instead of relying on an alias.
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

type Row = Record<string, unknown>;

// ─── Persistence ──────────────────────────────────────────────────────────────

function dbDir(): string {
  const dir = path.join(config.storage.dataDir, 'db');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readTable(table: string): Row[] {
  const p = path.join(dbDir(), `${table}.json`);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as Row[]; }
  catch { return []; }
}

function writeTable(table: string, rows: Row[]): void {
  fs.writeFileSync(path.join(dbDir(), `${table}.json`), JSON.stringify(rows, null, 2));
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

// ─── SQL normalizer ───────────────────────────────────────────────────────────
// Collapses all whitespace/newlines to single spaces before parsing.

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * Split a comma separated SQL list on top-level commas only — commas inside
 * quotes or inside parentheses (e.g. datetime('now')) stay untouched.
 */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string;

    if (quote) {
      current += ch;
      if (ch === quote) {
        if (input[i + 1] === quote) {
          current += input[i + 1] as string;
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;

    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  if (current.trim()) parts.push(current);
  return parts;
}

// ─── Value operands ───────────────────────────────────────────────────────────

type ValueOperand =
  | { source: 'param'; index: number }
  | { source: 'literal'; value: unknown }
  | { source: 'now' };

function resolveValue(operand: ValueOperand, params: unknown[]): unknown {
  if (operand.source === 'param') return params[operand.index];
  if (operand.source === 'now') return now();
  return operand.value;
}

/**
 * Parse a single SQL value: `?`, `datetime('now')`, a quoted string,
 * a number, NULL or a boolean. Returns null if it is not a supported value.
 */
function parseValue(raw: string, counter: { index: number }): ValueOperand | null {
  const v = raw.trim();
  if (!v) return null;

  if (v === '?') return { source: 'param', index: counter.index++ };

  if (/^(datetime\s*\(\s*'now'\s*\)|current_timestamp)$/i.test(v)) {
    return { source: 'now' };
  }

  const quoted = v.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) {
    const q = quoted[1] as string;
    const inner = (quoted[2] ?? '').split(q + q).join(q);
    return { source: 'literal', value: inner };
  }

  if (/^-?\d+(?:\.\d+)?$/.test(v)) return { source: 'literal', value: Number(v) };
  if (/^null$/i.test(v)) return { source: 'literal', value: null };
  if (/^true$/i.test(v)) return { source: 'literal', value: 1 };
  if (/^false$/i.test(v)) return { source: 'literal', value: 0 };

  return null;
}

// ─── Parsed query types ───────────────────────────────────────────────────────

type ParsedQuery =
  | { type: 'SELECT'; table: string; joins: JoinClause[]; where: WhereClause[]; orderBy: string; limit: number }
  | { type: 'INSERT'; table: string; columns: string[]; values: ValueOperand[]; orIgnore: boolean; orReplace: boolean }
  | { type: 'UPDATE'; table: string; sets: SetClause[]; where: WhereClause[] }
  | { type: 'DELETE'; table: string; where: WhereClause[] }
  | { type: 'NOOP' };

interface JoinClause  { table: string; leftCol: string; rightCol: string }
interface WhereClause { col: string; op: string; value: ValueOperand }
interface SetClause   { col: string; value: ValueOperand }

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseSQL(rawSql: string): ParsedQuery {
  const s = normalize(rawSql);

  // INSERT [OR IGNORE|REPLACE] INTO table (cols) VALUES (...)
  const ins = s.match(/^INSERT\s+(OR\s+(IGNORE|REPLACE)\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]*)\)/i);
  if (ins) {
    const counter = { index: 0 };
    return {
      type: 'INSERT',
      table: ins[3] ?? '',
      columns: (ins[4] ?? '').split(',').map((c) => c.trim()),
      values: splitTopLevel(ins[5] ?? '').map(
        (v) => parseValue(v, counter) ?? { source: 'literal', value: null },
      ),
      orIgnore:  /IGNORE/i.test(ins[2] ?? ''),
      orReplace: /REPLACE/i.test(ins[2] ?? ''),
    };
  }

  // UPDATE table SET col=?,... WHERE col=?
  const upd = s.match(/^UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
  if (upd) {
    return {
      type: 'UPDATE',
      table: upd[1] ?? '',
      sets:  parseSets(upd[2] ?? ''),
      where: parseWhere(upd[3] ?? ''),
    };
  }

  // DELETE FROM table [WHERE ...]
  const del = s.match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+))?$/i);
  if (del) {
    return { type: 'DELETE', table: del[1] ?? '', where: del[2] ? parseWhere(del[2]) : [] };
  }

  // SELECT ... FROM table ...
  const sel = s.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)(.*)/i);
  if (sel) {
    const rest = sel[3] ?? '';
    return {
      type: 'SELECT',
      table: sel[2] ?? '',
      joins: parseJoins(rest),
      where: parseWhere(rest.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+LIMIT|$)/i)?.[1] ?? ''),
      orderBy: rest.match(/ORDER\s+BY\s+([\s\S]+?)(?:\s+LIMIT|$)/i)?.[1] ?? '',
      limit: parseInt(rest.match(/LIMIT\s+(\d+)/i)?.[1] ?? 'Infinity', 10) || Infinity,
    };
  }

  return { type: 'NOOP' };
}

function parseSets(setStr: string): SetClause[] {
  const clauses: SetClause[] = [];
  const counter = { index: 0 };

  for (const part of splitTopLevel(setStr)) {
    const m = part.trim().match(/^([\w.]+)\s*=\s*([\s\S]+)$/);
    if (!m) continue;

    const col = (m[1] ?? '').replace(/^\w+\./, '');
    const value = parseValue(m[2] ?? '', counter);
    if (!value) continue; // unsupported expression (e.g. subquery) — skip
    clauses.push({ col, value });
  }
  return clauses;
}

function parseWhere(whereStr: string): WhereClause[] {
  if (!whereStr.trim()) return [];

  const clauses: WhereClause[] = [];
  const counter = { index: 0 };

  for (const part of whereStr.split(/\s+AND\s+/i)) {
    const m = part.trim().match(/^([\w.]+)\s*(==|!=|<>|<=|>=|=|<|>)\s*([\s\S]+)$/);
    if (!m) continue;

    const value = parseValue(m[3] ?? '', counter);
    if (!value) continue;
    clauses.push({ col: (m[1] ?? '').replace(/^\w+\./, ''), op: m[2] ?? '=', value });
  }
  return clauses;
}

function parseJoins(rest: string): JoinClause[] {
  const joins: JoinClause[] = [];
  const re = /(?:LEFT\s+)?JOIN\s+(\w+)\s+\w+\s+ON\s+([\w.]+)\s*=\s*([\w.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    joins.push({
      table: m[1] ?? '',
      leftCol:  (m[2] ?? '').split('.').pop() ?? '',
      rightCol: (m[3] ?? '').split('.').pop() ?? '',
    });
  }
  return joins;
}

// ─── Query executors ──────────────────────────────────────────────────────────

function applyWhere(rows: Row[], where: WhereClause[], params: unknown[]): Row[] {
  if (!where.length) return rows;
  return rows.filter((row) =>
    where.every(({ col, op, value }) => {
      const v = row[col];
      const p = resolveValue(value, params);
      if (op === '=' || op === '==') return v === p;
      if (op === '!=' || op === '<>') return v !== p;
      if (op === '<')  return (v as number) < (p as number);
      if (op === '>')  return (v as number) > (p as number);
      if (op === '<=') return (v as number) <= (p as number);
      if (op === '>=') return (v as number) >= (p as number);
      return true;
    }),
  );
}

function executeSelect(q: Extract<ParsedQuery, {type:'SELECT'}>, params: unknown[]): Row[] {
  let rows = readTable(q.table);

  for (const join of q.joins) {
    const right = readTable(join.table);
    rows = rows.map((row) => {
      const match = right.find((r) => r[join.rightCol] === row[join.leftCol]);
      return match ? { ...match, ...row } : row;
    });
  }

  if (q.where.length) rows = applyWhere(rows, q.where, params);

  if (q.orderBy) {
    const col = q.orderBy.split(/\s+/)[0]?.replace(/^\w+\./, '') ?? '';
    const desc = /DESC/i.test(q.orderBy);
    rows = [...rows].sort((a, b) =>
      desc
        ? String(b[col] ?? '').localeCompare(String(a[col] ?? ''))
        : String(a[col] ?? '').localeCompare(String(b[col] ?? '')),
    );
  }

  return q.limit !== Infinity ? rows.slice(0, q.limit) : rows;
}

function executeInsert(q: Extract<ParsedQuery, {type:'INSERT'}>, params: unknown[]): void {
  const rows = readTable(q.table);
  const row: Row = {};

  q.columns.forEach((col, i) => {
    const value = q.values[i];
    if (value) row[col] = resolveValue(value, params);
  });

  const n = now();
  if (q.table !== 'settings') {
    if (!('created_at' in row)) row['created_at'] = n;
    if (!('updated_at' in row)) row['updated_at'] = n;
  }
  if (q.table === 'scripts') {
    if (!('status' in row) || row['status'] === undefined) row['status'] = 'draft';
  }
  if (q.table === 'jobs') {
    if (!('status'       in row)) row['status']       = 'pending';
    if (!('progress'     in row)) row['progress']     = 0;
    if (!('current_step' in row)) row['current_step'] = 'pending';
    if (!('retry_count'  in row)) row['retry_count']  = 0;
    if (!('error'        in row)) row['error']        = null;
    if (!('config_json'  in row)) row['config_json']  = '{}';
  }

  // Primary key: every table in this project uses `id`, except settings (`key`).
  const pk = row['id'] !== undefined ? 'id' : row['key'] !== undefined ? 'key' : null;
  const idx = pk ? rows.findIndex((r) => r[pk] === row[pk]) : -1;

  if (idx >= 0) {
    if (q.orIgnore) return;
    rows[idx] = q.orReplace ? row : { ...rows[idx], ...row };
  } else {
    rows.push(row);
  }
  writeTable(q.table, rows);
}

function executeUpdate(q: Extract<ParsedQuery, {type:'UPDATE'}>, params: unknown[]): void {
  const rows = readTable(q.table);

  // SET parameters come first in the argument list, WHERE parameters after them.
  const setParamCount = q.sets.filter((s) => s.value.source === 'param').length;
  const whereParams = params.slice(setParamCount);
  const matched = new Set(applyWhere(rows, q.where, whereParams));

  for (const row of matched) {
    for (const { col, value } of q.sets) {
      row[col] = resolveValue(value, params);
    }
  }
  writeTable(q.table, rows);
}

function executeDelete(q: Extract<ParsedQuery, {type:'DELETE'}>, params: unknown[]): void {
  let rows = readTable(q.table);
  if (q.where.length) {
    const toRemove = new Set(applyWhere(rows, q.where, params));
    rows = rows.filter((r) => !toRemove.has(r));
  } else {
    rows = [];
  }
  writeTable(q.table, rows);
}

// ─── Statement ────────────────────────────────────────────────────────────────

class Statement {
  private parsed: ParsedQuery;
  constructor(sql: string) { this.parsed = parseSQL(sql); }

  run(...params: unknown[]): { changes: number } {
    const p = this.parsed;
    if (p.type === 'INSERT') executeInsert(p, params);
    else if (p.type === 'UPDATE') executeUpdate(p, params);
    else if (p.type === 'DELETE') executeDelete(p, params);
    return { changes: 1 };
  }

  get(...params: unknown[]): unknown {
    const p = this.parsed;
    if (p.type !== 'SELECT') return undefined;
    return executeSelect(p, params)[0];
  }

  all(...params: unknown[]): unknown[] {
    const p = this.parsed;
    if (p.type !== 'SELECT') return [];
    return executeSelect(p, params);
  }
}

// ─── Database ─────────────────────────────────────────────────────────────────

class JsonDatabase {
  prepare(sql: string): Statement { return new Statement(sql); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction<T extends (...args: any[]) => any>(fn: T): T { return fn as T; }
  exec(_sql: string): void { /* DDL handled by migrations.ts */ }
  pragma(_p: string): void { /* no-op */ }
  close(): void { /* no-op */ }
}

let _db: JsonDatabase | null = null;
export function getDb(): JsonDatabase {
  if (!_db) _db = new JsonDatabase();
  return _db;
}
export function closeDb(): void { _db = null; }

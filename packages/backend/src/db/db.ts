/**
 * JSON file-based database that mimics the better-sqlite3 synchronous API.
 * Layout on disk:  data/db/<table>.json  — each file is an array of row objects.
 *
 * Supported subset of the better-sqlite3 API used by this project:
 *   db.prepare(sql).run(...params)
 *   db.prepare(sql).get(...params)
 *   db.prepare(sql).all(...params)
 *   db.transaction(fn)(args)
 *   db.exec(sql)           — no-op (DDL is handled by migrations.ts inline)
 *   db.pragma(...)         — no-op
 *   db.close()             — no-op
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

// ─── Persistence helpers ──────────────────────────────────────────────────────

function dbDir(): string {
  const dir = path.join(config.storage.dataDir, 'db');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tablePath(table: string): string {
  return path.join(dbDir(), `${table}.json`);
}

function readTable(table: string): Row[] {
  const p = tablePath(table);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Row[];
  } catch {
    return [];
  }
}

function writeTable(table: string, rows: Row[]): void {
  fs.writeFileSync(tablePath(table), JSON.stringify(rows, null, 2), 'utf-8');
}

// ─── SQL parser (minimal, just enough for our queries) ────────────────────────

type ParsedQuery =
  | { type: 'SELECT'; table: string; joins: JoinClause[]; where: WhereClause[]; orderBy: string; limit: number }
  | { type: 'INSERT'; table: string; columns: string[]; orIgnore: boolean; orReplace: boolean }
  | { type: 'UPDATE'; table: string; sets: string[]; where: WhereClause[] }
  | { type: 'DELETE'; table: string; where: WhereClause[] }
  | { type: 'NOOP' };

interface JoinClause { table: string; leftCol: string; rightCol: string }
interface WhereClause { col: string; op: string; paramIndex: number }

function parseSQL(sql: string): ParsedQuery {
  const s = sql.replace(/\s+/g, ' ').trim();

  // INSERT OR IGNORE / INSERT OR REPLACE / INSERT
  const insertMatch = s.match(/^INSERT\s+(OR\s+(IGNORE|REPLACE)\s+)?INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (insertMatch) {
    const cols = (insertMatch[4] ?? '').split(',').map((c) => c.trim());
    return {
      type: 'INSERT',
      table: insertMatch[3] ?? '',
      columns: cols,
      orIgnore: /IGNORE/i.test(insertMatch[2] ?? ''),
      orReplace: /REPLACE/i.test(insertMatch[2] ?? ''),
    };
  }

  // UPDATE
  const updateMatch = s.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (updateMatch) {
    const sets = (updateMatch[2] ?? '').split(',').map((x) => x.trim());
    const where = parseWhere(updateMatch[3] ?? '');
    return { type: 'UPDATE', table: updateMatch[1] ?? '', sets, where };
  }

  // DELETE
  const deleteMatch = s.match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
  if (deleteMatch) {
    const where = deleteMatch[2] ? parseWhere(deleteMatch[2]) : [];
    return { type: 'DELETE', table: deleteMatch[1] ?? '', where };
  }

  // SELECT
  const selectMatch = s.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)(.*)/i);
  if (selectMatch) {
    const rest = selectMatch[3] ?? '';
    const joins = parseJoins(rest);
    const whereMatch = rest.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
    const orderMatch = rest.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
    const limitMatch = rest.match(/LIMIT\s+(\d+)/i);
    const where = whereMatch ? parseWhere(whereMatch[1] ?? '') : [];
    return {
      type: 'SELECT',
      table: selectMatch[2] ?? '',
      joins,
      where,
      orderBy: orderMatch?.[1] ?? '',
      limit: limitMatch ? parseInt(limitMatch[1] ?? '0', 10) : Infinity,
    };
  }

  return { type: 'NOOP' };
}

function parseWhere(whereStr: string): WhereClause[] {
  const clauses: WhereClause[] = [];
  const parts = whereStr.split(/\s+AND\s+/i);
  let paramIndex = 0;
  for (const part of parts) {
    const m = part.trim().match(/^([\w.]+)\s*(=|!=|<|>|<=|>=)\s*\?$/i);
    if (m) {
      const col = (m[1] ?? '').replace(/^\w+\./, ''); // strip table prefix
      clauses.push({ col, op: m[2] ?? '=', paramIndex });
      paramIndex++;
    }
  }
  return clauses;
}

function parseJoins(rest: string): JoinClause[] {
  const joins: JoinClause[] = [];
  const regex = /(?:LEFT\s+)?JOIN\s+(\w+)\s+\w+\s+ON\s+([\w.]+)\s*=\s*([\w.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(rest)) !== null) {
    const left = (m[2] ?? '').split('.').pop() ?? '';
    const right = (m[3] ?? '').split('.').pop() ?? '';
    joins.push({ table: m[1] ?? '', leftCol: left, rightCol: right });
  }
  return joins;
}

// ─── Query executor ───────────────────────────────────────────────────────────

function applyWhere(rows: Row[], where: WhereClause[], params: unknown[]): Row[] {
  return rows.filter((row) =>
    where.every(({ col, op, paramIndex }) => {
      const val = row[col];
      const param = params[paramIndex];
      switch (op) {
        case '=':  return val === param;
        case '!=': return val !== param;
        case '<':  return (val as number) < (param as number);
        case '>':  return (val as number) > (param as number);
        case '<=': return (val as number) <= (param as number);
        case '>=': return (val as number) >= (param as number);
        default:   return true;
      }
    }),
  );
}

function executeSelect(q: Extract<ParsedQuery, { type: 'SELECT' }>, params: unknown[]): Row[] {
  let rows = readTable(q.table);

  // Apply JOINs (left join — attach matching fields from joined table)
  for (const join of q.joins) {
    const right = readTable(join.table);
    rows = rows.map((row) => {
      const match = right.find((r) => r[join.rightCol] === row[join.leftCol]);
      return match ? { ...match, ...row } : row; // left row wins on collision
    });
  }

  if (q.where.length) rows = applyWhere(rows, q.where, params);

  if (q.orderBy) {
    const col = q.orderBy.split(/\s+/)[0]?.replace(/^\w+\./, '') ?? '';
    const desc = /DESC/i.test(q.orderBy);
    rows = [...rows].sort((a, b) => {
      const av = a[col] ?? '';
      const bv = b[col] ?? '';
      return desc
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
  }

  if (q.limit !== Infinity) rows = rows.slice(0, q.limit);
  return rows;
}

function executeInsert(q: Extract<ParsedQuery, { type: 'INSERT' }>, params: unknown[]): void {
  const rows = readTable(q.table);
  const newRow: Row = {};
  q.columns.forEach((col, i) => { newRow[col] = params[i]; });

  // Set defaults for timestamp columns if not provided
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  if (!('created_at' in newRow)) newRow['created_at'] = now;
  if (!('updated_at' in newRow)) newRow['updated_at'] = now;
  if (!('status' in newRow) && q.table === 'jobs') newRow['status'] = 'pending';
  if (!('progress' in newRow) && q.table === 'jobs') newRow['progress'] = 0;
  if (!('current_step' in newRow) && q.table === 'jobs') newRow['current_step'] = 'pending';
  if (!('retry_count' in newRow) && q.table === 'jobs') newRow['retry_count'] = 0;
  if (!('error' in newRow) && q.table === 'jobs') newRow['error'] = null;

  const id = newRow['id'];
  const existingIdx = id !== undefined ? rows.findIndex((r) => r['id'] === id) : -1;

  if (existingIdx >= 0) {
    if (q.orIgnore) return;           // INSERT OR IGNORE — skip
    if (q.orReplace) { rows[existingIdx] = newRow; writeTable(q.table, rows); return; }
    // plain INSERT with duplicate key — overwrite (lenient)
    rows[existingIdx] = newRow;
  } else {
    rows.push(newRow);
  }
  writeTable(q.table, rows);
}

function executeUpdate(q: Extract<ParsedQuery, { type: 'UPDATE' }>, params: unknown[]): void {
  const rows = readTable(q.table);

  // Sets come first in params, then where params
  const setCols: Array<{ col: string; paramIndex: number }> = [];
  let paramOffset = 0;
  for (const setExpr of q.sets) {
    const m = setExpr.match(/^([\w.]+)\s*=\s*\?$/);
    if (m) {
      setCols.push({ col: (m[1] ?? '').replace(/^\w+\./, ''), paramIndex: paramOffset++ });
    } else {
      // e.g. updated_at = datetime('now') — set to current timestamp
      const colName = setExpr.split('=')[0]?.trim() ?? '';
      if (colName) {
        const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
        setCols.push({ col: colName, paramIndex: -1 }); // -1 = use now
        // Don't increment paramOffset — no ? placeholder
      }
    }
  }

  // Adjust where param indices to start after set params
  const adjustedWhere = q.where.map((w) => ({ ...w, paramIndex: w.paramIndex + paramOffset }));
  const matched = applyWhere(rows, adjustedWhere, params);

  for (const row of matched) {
    for (const { col, paramIndex } of setCols) {
      if (paramIndex === -1) {
        row[col] = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
      } else {
        row[col] = params[paramIndex];
      }
    }
  }
  writeTable(q.table, rows);
}

function executeDelete(q: Extract<ParsedQuery, { type: 'DELETE' }>, params: unknown[]): void {
  let rows = readTable(q.table);
  if (q.where.length) {
    const toDelete = applyWhere(rows, q.where, params);
    const ids = new Set(toDelete.map((r) => r['id']));
    rows = rows.filter((r) => !ids.has(r['id']));
  } else {
    rows = [];
  }
  writeTable(q.table, rows);
}

// ─── Statement ────────────────────────────────────────────────────────────────

class Statement {
  private parsed: ParsedQuery;

  constructor(sql: string) {
    this.parsed = parseSQL(sql);
  }

  run(...params: unknown[]): { changes: number } {
    const p = this.parsed;
    if (p.type === 'INSERT') executeInsert(p, params);
    else if (p.type === 'UPDATE') executeUpdate(p, params);
    else if (p.type === 'DELETE') executeDelete(p, params);
    return { changes: 1 };
  }

  get(...params: unknown[]): Row | undefined {
    const p = this.parsed;
    if (p.type !== 'SELECT') return undefined;
    const rows = executeSelect(p, params);
    return rows[0];
  }

  all(...params: unknown[]): Row[] {
    const p = this.parsed;
    if (p.type !== 'SELECT') return [];
    return executeSelect(p, params);
  }
}

// ─── Database facade ──────────────────────────────────────────────────────────

class JsonDatabase {
  prepare(sql: string): Statement {
    return new Statement(sql);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    // JSON writes are synchronous so no real transaction needed
    return fn as T;
  }

  exec(_sql: string): void {
    // DDL is handled by migrations.ts — nothing to do here
  }

  pragma(_pragma: string): void {
    // No-op
  }

  close(): void {
    // No-op
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _db: JsonDatabase | null = null;

export function getDb(): JsonDatabase {
  if (!_db) _db = new JsonDatabase();
  return _db;
}

export function closeDb(): void {
  _db = null;
}

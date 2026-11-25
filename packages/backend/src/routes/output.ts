import express from 'express';
import fs from 'fs';
import path from 'path';
import type { Dirent, Stats } from 'fs';
import { config } from '../config.js';

/**
 * Human-browsable static mount for generated files.
 *
 * A directory request used to answer with `text/plain` names, so in a browser
 * `/output` was a wall of text: nothing was clickable and no file could be
 * downloaded. This mount renders an HTML index with breadcrumbs, folder
 * navigation, sizes, modification times and a download link per file, while
 * files themselves are still served by `express.static` so video range
 * requests and streaming keep working.
 *
 * Mounted twice on purpose: the app is normally reached through a tunnel/proxy
 * that may forward only `/api`, so `/api/output` is the same directory.
 */

interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: Date;
}

const FOLDER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';

const FILE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/>' +
  '<path d="M14 3v5h5"/></svg>';

const PARENT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';

const BASE_CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #0b1020;
  color: #e7ecf8;
  font: 15px/1.5 system-ui, 'Segoe UI', sans-serif;
}
main { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px; letter-spacing: 0.2px; }
p.sub { margin: 0 0 18px; color: #93a1c4; font-size: 13px; }
nav.crumbs { font-size: 14px; margin-bottom: 20px; color: #93a1c4; }
nav.crumbs a { color: #8fb4ff; text-decoration: none; }
nav.crumbs a:hover { text-decoration: underline; }
nav.crumbs .sep { margin: 0 6px; opacity: 0.5; }
table { width: 100%; border-collapse: collapse; }
th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7483a8;
  padding: 8px 10px;
  border-bottom: 1px solid #1e2946;
}
th.size, td.size { width: 96px; }
th.time, td.time { width: 170px; }
td { padding: 10px; border-bottom: 1px solid #151d34; vertical-align: middle; }
tr:hover td { background: #111a30; }
td a { color: #dbe6ff; text-decoration: none; }
td a:hover { color: #fff; text-decoration: underline; }
.icon { display: inline-flex; width: 18px; height: 18px; margin-right: 10px; color: #7aa2ff; vertical-align: -4px; }
.icon svg { width: 18px; height: 18px; }
td.size, td.time { color: #8b99bb; font-size: 13px; font-variant-numeric: tabular-nums; }
td.actions { text-align: right; }
a.download {
  display: inline-block;
  padding: 3px 10px;
  border: 1px solid #2a3b63;
  border-radius: 999px;
  font-size: 12px;
  color: #a9c2ff;
}
a.download:hover { border-color: #4776d0; background: #14203c; color: #fff; text-decoration: none; }
a.up { color: #8fb4ff; text-decoration: none; font-size: 14px; }
a.up:hover { text-decoration: underline; }
p.empty { color: #8b99bb; margin: 22px 0 0; }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[unit] ?? 'B'}`;
}

function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return '—';
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function readEntries(dir: string): DirEntry[] {
  let dirents: Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return dirents
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => {
      const full = path.join(dir, entry.name);
      let stat: Stats | null = null;
      try {
        stat = fs.statSync(full);
      } catch {
        stat = null;
      }
      return {
        name: entry.name,
        isDir: stat?.isDirectory() ?? entry.isDirectory(),
        size: stat?.isFile() ? stat.size : 0,
        mtime: stat?.mtime ?? new Date(0),
      };
    })
    .sort((a, b) =>
      a.isDir === b.isDir
        ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        : a.isDir
          ? -1
          : 1,
    );
}

/** Path below the mount, decoded for display and breadcrumbs. */
function relativeSegments(urlPath: string, prefix: string): string[] {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    // A malformed escape keeps the raw name; it is escaped again for HTML.
  }
  return decoded.slice(prefix.length).split('/').filter((segment) => segment.length > 0);
}

function renderListing(prefix: string, urlPath: string, entries: DirEntry[]): string {
  const segments = relativeSegments(urlPath, prefix);

  let href = `${prefix}/`;
  const crumbs = [`<a href="${escapeHtml(href)}">output</a>`];
  for (const segment of segments) {
    href += `${encodeURIComponent(segment)}/`;
    crumbs.push(`<a href="${escapeHtml(href)}">${escapeHtml(segment)}</a>`);
  }

  const files = entries.filter((entry) => !entry.isDir);
  const folders = entries.length - files.length;
  const totalBytes = files.reduce((sum, entry) => sum + entry.size, 0);
  const title = segments.length > 0 ? (segments[segments.length - 1] ?? 'output') : 'output';
  const summary = [
    `${folders} folder${folders === 1 ? '' : 's'}`,
    `${files.length} file${files.length === 1 ? '' : 's'}`,
    formatBytes(totalBytes),
  ].join(' · ');

  const parentRow = segments.length > 0
    ? `<tr>
        <td class="name"><span class="icon">${PARENT_ICON}</span><a href="../">Parent folder</a></td>
        <td class="size"></td>
        <td class="time"></td>
        <td class="actions"></td>
      </tr>`
    : '';

  const rows = entries
    .map((entry) => {
      const entryHref = encodeURIComponent(entry.name) + (entry.isDir ? '/' : '');
      const icon = entry.isDir ? FOLDER_ICON : FILE_ICON;
      const size = entry.isDir ? '—' : formatBytes(entry.size);
      const download = entry.isDir
        ? ''
        : `<a class="download" href="${escapeHtml(entryHref)}?download=1">Download</a>`;

      return `<tr>
        <td class="name"><span class="icon">${icon}</span><a href="${escapeHtml(entryHref)}">${escapeHtml(entry.name)}${entry.isDir ? '/' : ''}</a></td>
        <td class="size">${escapeHtml(size)}</td>
        <td class="time">${escapeHtml(formatDate(entry.mtime))}</td>
        <td class="actions">${download}</td>
      </tr>`;
    })
    .join('\n');

  const table = entries.length > 0
    ? `<table>
      <thead>
        <tr><th>Name</th><th class="size">Size</th><th class="time">Modified (UTC)</th><th></th></tr>
      </thead>
      <tbody>
        ${parentRow}
        ${rows}
      </tbody>
    </table>`
    : `${parentRow ? `<p><a class="up" href="../">↑ Parent folder</a></p>` : ''}
      <p class="empty">This folder is empty.</p>`;

  const crumbsHtml = crumbs
    .map((crumb, index) => (index === 0 ? crumb : `<span class="sep">/</span>${crumb}`))
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Anupam Classes output</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="sub">${escapeHtml(summary)}</p>
    <nav class="crumbs">${crumbsHtml}</nav>
    ${table}
  </main>
</body>
</html>
`;
}

function errorPage(message: string, prefix: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(message)} — Anupam Classes output</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <main>
    <nav class="crumbs"><a href="${escapeHtml(`${prefix}/`)}">output</a></nav>
    <h1>${escapeHtml(message)}</h1>
    <p class="empty">Nothing to show here.</p>
  </main>
</body>
</html>
`;
}

export function mountOutputStatic(app: express.Express): void {
  const root = config.storage.outputDir;

  let realRoot = root;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    // Root is created by ensureDirectories() before this mount is used.
  }

  /** Map a request path to a path inside the output directory, or null. */
  const resolveWithin = (urlPath: string, prefix: string): string | null => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }

    if (decoded.includes('\0') || !decoded.startsWith(prefix)) return null;

    const relative = decoded.slice(prefix.length).replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    const relation = path.relative(root, target);
    if (relation.startsWith('..') || path.isAbsolute(relation)) return null;

    return target;
  };

  /** A symlink inside the output tree must not point outside it. */
  const withinRealRoot = (target: string): boolean => {
    try {
      const real = fs.realpathSync(target);
      return real === realRoot || real.startsWith(realRoot + path.sep);
    } catch {
      return false;
    }
  };

  const notFound = (prefix: string) => (_req: express.Request, res: express.Response): void => {
    res.status(404).type('html').send(errorPage('Not found', prefix));
  };

  const downloadHandler = (prefix: string) => (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    if (req.query['download'] === undefined) {
      next();
      return;
    }

    const target = resolveWithin(req.path, prefix);
    if (!target) {
      res.status(400).type('html').send(errorPage('Invalid path', prefix));
      return;
    }

    let stat: Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      notFound(prefix)(req, res);
      return;
    }

    if (!stat.isFile() || !withinRealRoot(target)) {
      notFound(prefix)(req, res);
      return;
    }

    // Content-Disposition: attachment, so the browser saves instead of opening.
    res.download(target, path.basename(target));
  };

  const listingHandler = (prefix: string) => (
    req: express.Request,
    res: express.Response,
  ): void => {
    const target = resolveWithin(req.path, prefix);
    if (!target) {
      res.status(400).type('html').send(errorPage('Invalid path', prefix));
      return;
    }

    let stat: Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      notFound(prefix)(req, res);
      return;
    }

    if (!stat.isDirectory() || !withinRealRoot(target)) {
      notFound(prefix)(req, res);
      return;
    }

    // Relative links and downloads only resolve correctly under a trailing slash.
    if (!req.path.endsWith('/')) {
      res.redirect(301, `${req.path}/`);
      return;
    }

    res
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(renderListing(prefix, req.path, readEntries(target)));
  };

  for (const prefix of ['/output', '/api/output']) {
    // Checked before express.static so `?download=1` can force an attachment.
    app.get(`${prefix}/*`, downloadHandler(prefix));
    app.use(prefix, express.static(root, { index: false, dotfiles: 'ignore' }));
    app.get([prefix, `${prefix}/*`], listingHandler(prefix));
  }

  const countJobFolders = (): number => {
    try {
      return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).length;
    } catch {
      return 0;
    }
  };
  console.log(
    `[Server] Static: /output (+ /api/output) -> ${root} ` +
      `(${countJobFolders()} job folder(s))`,
  );
}

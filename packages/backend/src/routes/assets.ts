import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

/**
 * Preview endpoint for the artwork library.
 *
 * Matched artwork is inlined into the storyboard as `data:` URLs so a render
 * never downloads anything, which also meant the files themselves were not
 * reachable from the browser: the render page could only show file names. This
 * serves the same files, read-only and images only, from the artwork folders so
 * the UI can show what was actually picked.
 */

const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Roots the artwork matcher indexes; an id is relative to one of them. */
function artworkRoots(): string[] {
  return [config.storage.resourcesDir, config.storage.assetsDir];
}

function findAsset(relativePath: string): string | null {
  const segments = relativePath.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === '..' || segment === '.' || segment.includes('\0'))) {
    return null;
  }

  for (const root of artworkRoots()) {
    let realRoot: string;
    try {
      realRoot = fs.realpathSync(root);
    } catch {
      continue;
    }

    const target = path.resolve(realRoot, ...segments);
    if (!target.startsWith(realRoot + path.sep)) continue;

    try {
      // A symlink inside the library must not point at files outside it.
      const real = fs.realpathSync(target);
      if (!real.startsWith(realRoot + path.sep)) continue;
      if (!fs.statSync(real).isFile()) continue;
      return real;
    } catch {
      continue;
    }
  }

  return null;
}

const router = Router();

router.get('/*', (req, res) => {
  let requested: string;
  try {
    requested = decodeURIComponent(req.path);
  } catch {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PATH', message: 'Invalid asset path' },
    });
    return;
  }

  const file = findAsset(requested.replace(/^\/+/, ''));
  if (!file) {
    res.status(404).json({
      success: false,
      error: { code: 'ASSET_NOT_FOUND', message: 'Asset not found' },
    });
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    // Only images are ever previewable; CREDITS.txt and friends stay private.
    res.status(404).json({
      success: false,
      error: { code: 'ASSET_NOT_FOUND', message: 'Asset not found' },
    });
    return;
  }

  res.set({
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // An SVG opened directly must not run script, even if a local file has some.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  });

  fs.readFile(file, (err, body) => {
    if (err) {
      res.status(404).json({
        success: false,
        error: { code: 'ASSET_NOT_FOUND', message: 'Asset not found' },
      });
      return;
    }
    res.send(body);
  });
});

export default router;

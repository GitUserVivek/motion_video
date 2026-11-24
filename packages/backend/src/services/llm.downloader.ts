import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  mbps: number;
}

export interface DownloadResult {
  modelPath: string;
  alreadyExisted: boolean;
}

/**
 * Resolve the absolute path where the GGUF file should live.
 * Layout: <modelsDir>/<modelName>/<hfFile>
 */
export function resolveModelPath(): string {
  const { modelsDir, modelName, modelFile, hfFile } = config.localLlm;
  const filename = modelFile || hfFile;
  return path.join(modelsDir, modelName, filename);
}

/**
 * Download a GGUF model from Hugging Face into the models directory.
 * Skips the download silently if the file already exists and is > 0 bytes.
 * Streams with progress reporting; uses a .part temp file to avoid corrupt
 * partial files surviving a crash.
 */
export async function downloadModel(
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadResult> {
  const modelPath = resolveModelPath();
  const modelDir = path.dirname(modelPath);

  // Skip if already downloaded
  if (fs.existsSync(modelPath) && fs.statSync(modelPath).size > 0) {
    const size = fs.statSync(modelPath).size;
    console.log(
      `[Downloader] Model already present: ${modelPath} (${(size / 1024 / 1024).toFixed(1)} MB)`,
    );
    await warnIfSizeMismatch(size);
    return { modelPath, alreadyExisted: true };
  }

  fs.mkdirSync(modelDir, { recursive: true });

  const { hfRepo, hfFile } = config.localLlm;
  // HuggingFace direct download URL (no auth required for public repos)
  const url = `https://huggingface.co/${hfRepo}/resolve/main/${hfFile}`;

  console.log(`[Downloader] Downloading ${hfFile}`);
  console.log(`[Downloader] From:  ${url}`);
  console.log(`[Downloader] Into:  ${modelPath}`);

  const partPath = modelPath + '.part';

  await streamDownload(url, partPath, onProgress);

  // Rename .part → final only after a complete download
  fs.renameSync(partPath, modelPath);

  const sizeMB = (fs.statSync(modelPath).size / 1024 / 1024).toFixed(1);
  console.log(`[Downloader] Done — ${sizeMB} MB saved to ${modelPath}`);
  await warnIfSizeMismatch(fs.statSync(modelPath).size);

  return { modelPath, alreadyExisted: false };
}

function streamDownload(
  url: string,
  destPath: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl: string, redirectCount = 0): void => {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'));
        return;
      }

      const lib = requestUrl.startsWith('https') ? https : http;

      lib.get(requestUrl, (res) => {
        // Follow redirects (HuggingFace uses them)
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          const location = res.headers['location'];
          if (!location) { reject(new Error('Redirect with no Location header')); return; }
          makeRequest(location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} downloading model from ${requestUrl}`));
          return;
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;
        const startTime = Date.now();

        const fileStream = fs.createWriteStream(destPath);

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (onProgress && total > 0) {
            const elapsedSec = (Date.now() - startTime) / 1000 || 0.001;
            onProgress({
              downloaded,
              total,
              percent: Math.round((downloaded / total) * 100),
              mbps: downloaded / 1024 / 1024 / elapsedSec,
            });
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          // A dropped connection ends the response early but still lets the
          // file stream finish. A truncated GGUF loads and then generates
          // garbage, so treat a short body as a failed download.
          if (total > 0 && downloaded < total) {
            fs.unlink(destPath, () => undefined);
            reject(
              new Error(
                `Download incomplete: got ${downloaded} of ${total} bytes from ${requestUrl}`,
              ),
            );
            return;
          }
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => undefined);
          reject(err);
        });

        res.on('error', (err) => {
          fs.unlink(destPath, () => undefined);
          reject(err);
        });
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

/**
 * Byte size the HuggingFace API reports for the configured file, or null when
 * the API is unreachable (offline runs must still work).
 */
async function fetchExpectedSize(): Promise<number | null> {
  const { hfRepo, hfFile } = config.localLlm;
  const url = `https://huggingface.co/api/models/${hfRepo}/tree/main`;

  return new Promise((resolve) => {
    const request = https.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => {
        try {
          const entries = JSON.parse(body) as Array<{ path?: string; size?: number }>;
          const match = entries.find((entry) => entry.path === hfFile);
          resolve(typeof match?.size === 'number' ? match.size : null);
        } catch {
          resolve(null);
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

/**
 * Compare the local GGUF against the published size. A short file is the most
 * common reason a model loads but answers with undecodable tokens.
 */
async function warnIfSizeMismatch(localSize: number): Promise<void> {
  const expected = await fetchExpectedSize();
  if (expected === null || expected === localSize) return;

  console.warn(
    `[Downloader] Model size mismatch: ${localSize} bytes on disk, ${expected} expected. ` +
      'The file is truncated — delete it so it can be downloaded again.',
  );
}

/**
 * CLI entry point — called by setup scripts via:
 *   node -e "require('./dist/services/llm.downloader').downloadModel(cb)"
 * or directly compiled and run.
 */
async function main(): Promise<void> {
  let lastPercent = -1;
  await downloadModel((p) => {
    if (p.percent !== lastPercent && p.percent % 5 === 0) {
      process.stdout.write(
        `\r  Downloading... ${p.percent}%  (${(p.downloaded / 1024 / 1024).toFixed(0)} / ${(p.total / 1024 / 1024).toFixed(0)} MB  ${p.mbps.toFixed(1)} MB/s)`,
      );
      lastPercent = p.percent;
    }
  });
  process.stdout.write('\n');
}

// Run as a standalone script when invoked directly
const isMain = process.argv[1] === __filename || process.argv[1]?.endsWith('llm.downloader.js');
if (isMain) {
  main().catch((err) => {
    console.error('\n[Downloader] Failed:', String(err));
    process.exit(1);
  });
}

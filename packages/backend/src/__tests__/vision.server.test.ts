import { describe, expect, it, vi } from 'vitest';
import {
  VisionSupervisor,
  hasModel,
  ollamaBaseUrl,
  ollamaHost,
  type SupervisorOptions,
} from '../services/vision.server.js';

function tagsBody(names: string[]): unknown {
  return { models: names.map((name) => ({ name })) };
}

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function options(overrides: Partial<SupervisorOptions> = {}): SupervisorOptions {
  return {
    provider: 'ollama',
    apiUrl: 'http://127.0.0.1:11434/v1',
    model: 'moondream',
    autostart: true,
    startTimeoutMs: 5000,
    pullTimeoutMs: 5000,
    sleep: async () => undefined,
    ...overrides,
  };
}

describe('ollamaBaseUrl', () => {
  it('drops the OpenAI path and keeps scheme and port', () => {
    expect(ollamaBaseUrl('http://127.0.0.1:11434/v1')).toBe('http://127.0.0.1:11434');
    expect(ollamaBaseUrl('http://127.0.0.1:11434/v1/chat/completions')).toBe('http://127.0.0.1:11434');
    expect(ollamaBaseUrl('https://vision.example.com/v1')).toBe('https://vision.example.com');
    expect(ollamaBaseUrl('')).toBeNull();
    expect(ollamaBaseUrl('not a url')).toBeNull();
  });
});

describe('ollamaHost', () => {
  it('formats host:port for OLLAMA_HOST', () => {
    expect(ollamaHost('http://127.0.0.1:11434')).toBe('127.0.0.1:11434');
    expect(ollamaHost('http://127.0.0.1:11435')).toBe('127.0.0.1:11435');
    expect(ollamaHost('https://vision.example.com')).toBe('vision.example.com:443');
  });
});

describe('hasModel', () => {
  it('matches the bare name and any tag Ollama reports', () => {
    expect(hasModel(tagsBody(['moondream:latest']), 'moondream')).toBe(true);
    expect(hasModel(tagsBody(['moondream']), 'moondream')).toBe(true);
    expect(hasModel(tagsBody(['qwen2.5-coder:7b']), 'moondream')).toBe(false);
    expect(hasModel(null, 'moondream')).toBe(false);
    expect(hasModel(tagsBody(['moondream:latest']), '')).toBe(false);
  });
});

describe('VisionSupervisor', () => {
  it('leaves a hosted endpoint alone', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const spawnImpl = vi.fn();
    const supervisor = new VisionSupervisor(options({
      provider: 'openrouter',
      apiUrl: 'https://openrouter.ai/api/v1',
      model: 'some-vl-model',
      fetchImpl,
      spawnImpl: spawnImpl as never,
    }));

    await expect(supervisor.ensure()).resolves.toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(supervisor.status().state).toBe('external');
  });

  it('accepts an already running server with the model installed', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response(tagsBody(['moondream:latest'])));
    const spawnImpl = vi.fn();
    const supervisor = new VisionSupervisor(options({ fetchImpl, spawnImpl: spawnImpl as never }));

    await expect(supervisor.ensure()).resolves.toBe(true);
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(supervisor.status().state).toBe('ready');
    expect(supervisor.status().detail).toContain('moondream');
  });

  it('starts the server itself when nothing is listening', async () => {
    let calls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      calls += 1;
      // Nothing answers before the spawn, then the server reports the model.
      if (calls === 1) throw new Error('ECONNREFUSED');
      return response(tagsBody(['moondream:latest']));
    });
    const spawnImpl = vi.fn(() => ({ unref: () => undefined, kill: () => true }) as never);
    const supervisor = new VisionSupervisor(options({ fetchImpl, spawnImpl: spawnImpl as never }));

    await expect(supervisor.ensure()).resolves.toBe(true);
    expect(spawnImpl).toHaveBeenCalledWith(
      'ollama',
      ['serve'],
      expect.objectContaining({ env: expect.objectContaining({ OLLAMA_HOST: '127.0.0.1:11434' }) }),
    );
    expect(supervisor.status().state).toBe('ready');
  });

  it('refuses to start when autostart is off and says what to run', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('ECONNREFUSED');
    });
    const spawnImpl = vi.fn();
    const supervisor = new VisionSupervisor(options({
      autostart: false,
      fetchImpl,
      spawnImpl: spawnImpl as never,
    }));

    await expect(supervisor.ensure()).resolves.toBe(false);
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(supervisor.status().state).toBe('failed');
    expect(supervisor.status().detail).toContain('ollama serve');
  });

  it('reports off when no endpoint or model is configured', async () => {
    const supervisor = new VisionSupervisor(options({ model: '' }));

    await expect(supervisor.ensure()).resolves.toBe(false);
    expect(supervisor.status().state).toBe('off');
  });
});

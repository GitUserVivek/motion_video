import { describe, it, expect } from 'vitest';
import {
  parseNvidiaSmi,
  selectProfile,
  chooseGlBackend,
} from '../services/hardware.service.js';

describe('parseNvidiaSmi', () => {
  it('parses CSV rows', () => {
    const out = `0, Tesla T4, 15360\n1, Tesla T4, 15360\n`;
    expect(parseNvidiaSmi(out)).toEqual([
      { index: 0, name: 'Tesla T4', memoryMB: 15360 },
      { index: 1, name: 'Tesla T4', memoryMB: 15360 },
    ]);
  });

  it('ignores blank lines', () => {
    expect(parseNvidiaSmi('\n\n')).toEqual([]);
  });
});

describe('selectProfile', () => {
  const hw1 = { cpuCores: 4, totalRamGB: 32, gpus: [{ index: 0, name: 'T4', memoryMB: 15360 }], nvencAvailable: true, glBackend: 'angle-egl' as const };
  const hw2 = { ...hw1, gpus: [...hw1.gpus, { index: 1, name: 'T4', memoryMB: 15360 }] };
  const hw0 = { ...hw1, gpus: [], nvencAvailable: false, glBackend: null };

  it('cpu request stays cpu', () => {
    expect(selectProfile(hw2, 'cpu', true)).toBe('cpu');
  });

  it('auto picks dual-gpu when two GPUs and env flag', () => {
    expect(selectProfile(hw2, 'auto', true)).toBe('dual-gpu');
  });

  it('auto picks gpu with one GPU', () => {
    expect(selectProfile(hw1, 'auto', true)).toBe('gpu');
  });

  it('auto picks cpu with no GPU', () => {
    expect(selectProfile(hw0, 'auto', false)).toBe('cpu');
  });
});

describe('chooseGlBackend', () => {
  const hw = { cpuCores: 4, totalRamGB: 32, gpus: [{ index: 0, name: 'T4', memoryMB: 15360 }], nvencAvailable: true, glBackend: 'angle-egl' as const };
  it('returns angle-egl for gpu profile', () => {
    expect(chooseGlBackend(hw, 'gpu')).toBe('angle-egl');
  });
  it('returns null for cpu profile', () => {
    expect(chooseGlBackend(hw, 'cpu')).toBeNull();
  });
});
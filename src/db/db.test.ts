import { describe, expect, it } from 'vitest';
import { normaliseConnectionString, toVectorLiteral } from './db.js';

describe('db helpers', () => {
  it('asks for verify-full instead of require', () => {
    expect(normaliseConnectionString('postgresql://u:p@h/db?sslmode=require')).toBe('postgresql://u:p@h/db?sslmode=verify-full');
    expect(normaliseConnectionString('postgresql://u:p@h/db?a=1&sslmode=require&b=2')).toBe('postgresql://u:p@h/db?a=1&sslmode=verify-full&b=2');
  });

  it('leaves other modes and URLs without sslmode alone', () => {
    expect(normaliseConnectionString('postgresql://u:p@h/db?sslmode=disable')).toBe('postgresql://u:p@h/db?sslmode=disable');
    expect(normaliseConnectionString('postgresql://u:p@h/db')).toBe('postgresql://u:p@h/db');
  });

  it('formats a vector literal', () => {
    expect(toVectorLiteral([1, 0.5])).toBe('[1,0.5]');
  });
});

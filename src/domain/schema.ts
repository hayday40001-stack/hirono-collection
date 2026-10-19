// Small runtime validator (no third-party dependency). Every byte that enters
// the app from a file or the network goes through one of these schemas before
// anything is written to IndexedDB.

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface Schema<T> {
  parse(input: unknown, path?: string): Result<T>;
}

function fail(path: string, msg: string): Result<never> {
  return { ok: false, errors: [`${path || 'root'}: ${msg}`] };
}

export const s = {
  string(opts: { min?: number; max?: number; pattern?: RegExp } = {}): Schema<string> {
    return {
      parse(v, p = '') {
        if (typeof v !== 'string') return fail(p, 'expected text');
        if (opts.min !== undefined && v.length < opts.min) return fail(p, `must have at least ${opts.min} characters`);
        if (opts.max !== undefined && v.length > opts.max) return fail(p, `must have at most ${opts.max} characters`);
        if (opts.pattern && !opts.pattern.test(v)) return fail(p, 'has an invalid format');
        return { ok: true, value: v };
      },
    };
  },
  number(opts: { min?: number; max?: number; int?: boolean } = {}): Schema<number> {
    return {
      parse(v, p = '') {
        if (typeof v !== 'number' || !Number.isFinite(v)) return fail(p, 'expected a number');
        if (opts.int && !Number.isInteger(v)) return fail(p, 'expected a whole number');
        if (opts.min !== undefined && v < opts.min) return fail(p, `must be ≥ ${opts.min}`);
        if (opts.max !== undefined && v > opts.max) return fail(p, `must be ≤ ${opts.max}`);
        return { ok: true, value: v };
      },
    };
  },
  boolean(): Schema<boolean> {
    return { parse: (v, p = '') => (typeof v === 'boolean' ? { ok: true, value: v } : fail(p, 'expected true/false')) };
  },
  literal<T extends string | number>(lit: T): Schema<T> {
    return { parse: (v, p = '') => (v === lit ? { ok: true, value: lit } : fail(p, `expected ${JSON.stringify(lit)}`)) };
  },
  enumOf<T extends string | number>(values: readonly T[]): Schema<T> {
    return {
      parse(v, p = '') {
        return values.includes(v as T) ? { ok: true, value: v as T } : fail(p, `must be one of ${values.join(', ')}`);
      },
    };
  },
  nullable<T>(inner: Schema<T>): Schema<T | null> {
    return { parse: (v, p = '') => (v === null || v === undefined ? { ok: true, value: null } : inner.parse(v, p)) };
  },
  optional<T>(inner: Schema<T>, fallback: T): Schema<T> {
    return { parse: (v, p = '') => (v === undefined ? { ok: true, value: fallback } : inner.parse(v, p)) };
  },
  array<T>(inner: Schema<T>, opts: { max?: number } = {}): Schema<T[]> {
    return {
      parse(v, p = '') {
        if (!Array.isArray(v)) return fail(p, 'expected a list');
        if (opts.max !== undefined && v.length > opts.max) return fail(p, `list is longer than ${opts.max}`);
        const out: T[] = [];
        const errors: string[] = [];
        v.forEach((el, i) => {
          const r = inner.parse(el, `${p}[${i}]`);
          if (r.ok) out.push(r.value);
          else errors.push(...r.errors);
        });
        return errors.length ? { ok: false, errors: errors.slice(0, 50) } : { ok: true, value: out };
      },
    };
  },
  object<T extends object>(shape: { [K in keyof T]: Schema<T[K]> }): Schema<T> {
    return {
      parse(v, p = '') {
        if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(p, 'expected an object');
        const src = v as Record<string, unknown>;
        const out = {} as T;
        const errors: string[] = [];
        for (const key of Object.keys(shape) as (keyof T)[]) {
          const r = shape[key].parse(src[key as string], p ? `${p}.${String(key)}` : String(key));
          if (r.ok) out[key] = r.value;
          else errors.push(...r.errors);
        }
        return errors.length ? { ok: false, errors } : { ok: true, value: out };
      },
    };
  },
};

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
export const ID = /^[a-z0-9][a-z0-9._-]{0,159}$/;

/** Only http(s) links are ever rendered as clickable, which blocks javascript: and data: URLs. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export const httpUrl: Schema<string> = {
  parse(v, p = '') {
    if (typeof v !== 'string') return fail(p, 'expected a link');
    return safeHttpUrl(v) ? { ok: true, value: v } : fail(p, 'must be an http(s) link');
  },
};

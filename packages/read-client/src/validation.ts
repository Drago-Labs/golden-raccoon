import { CompatibilityError } from "./errors.js";

export type Validator<T> = (value: unknown, path?: string) => T;
export const text: Validator<string> = (v, p = "value") => {
  if (typeof v !== "string") throw new CompatibilityError(p);
  return v;
};
export const number: Validator<number> = (v, p = "value") => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new CompatibilityError(p);
  return v;
};
export const boolean: Validator<boolean> = (v, p = "value") => {
  if (typeof v !== "boolean") throw new CompatibilityError(p);
  return v;
};
export const record: Validator<Record<string, unknown>> = (v, p = "value") => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new CompatibilityError(p);
  return v as Record<string, unknown>;
};
export function array<T>(validate: Validator<T>): Validator<T[]> {
  return (v, p = "value") => {
    if (!Array.isArray(v)) throw new CompatibilityError(p);
    return v.map((item, i) => validate(item, `${p}[${i}]`));
  };
}
export function optional<T>(validate: Validator<T>): Validator<T | undefined> {
  return (v, p) => v === undefined ? undefined : validate(v, p);
}
export function nullable<T>(validate: Validator<T>): Validator<T | null> {
  return (v, p) => v === null ? null : validate(v, p);
}
export function literal<T extends string | boolean>(expected: T): Validator<T> {
  return (v, p = "value") => { if (v !== expected) throw new CompatibilityError(p); return expected; };
}
export function shape<S extends Record<string, Validator<unknown>>>(fields: S): Validator<{ [K in keyof S]: ReturnType<S[K]> } & Record<string, unknown>> {
  return (value, path = "response") => {
    const obj = record(value, path);
    for (const [key, validate] of Object.entries(fields)) validate(obj[key], `${path}.${key}`);
    // Preserve additive fields byte-for-byte; only exported typed fields are guaranteed.
    return obj as { [K in keyof S]: ReturnType<S[K]> } & Record<string, unknown>;
  };
}

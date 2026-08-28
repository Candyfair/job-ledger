import { vi } from "vitest";

// Drizzle query builders are chainable AND thenable (awaitable at any point
// in the chain — e.g. both `await db.select().from(t)` and
// `await db.select().from(t).where(...).orderBy(...)` resolve). This mock
// reproduces that: every chain method returns another instance of the same
// mock, and the mock itself is a resolved Promise for `value`.
export function mockDrizzleChain(value: unknown) {
  // Each builder method accepts (and records) arbitrary args so tests can
  // assert on the payload passed to `.values(...)` / `.set(...)` / etc.
  const link = (...args: unknown[]) => {
    void args;
    return mockDrizzleChain(value);
  };
  const chain = Object.assign(Promise.resolve(value), {
    from: vi.fn(link),
    where: vi.fn(link),
    orderBy: vi.fn(link),
    values: vi.fn(link),
    set: vi.fn(link),
    onConflictDoUpdate: vi.fn(link),
    onConflictDoNothing: vi.fn(link),
    returning: vi.fn((...args: unknown[]) => {
      void args;
      return Promise.resolve(value);
    }),
  });
  return chain;
}

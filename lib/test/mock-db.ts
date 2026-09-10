import { vi } from "vitest";

// Drizzle query builders are chainable AND thenable (awaitable at any point
// in the chain — e.g. both `await db.select().from(t)` and
// `await db.select().from(t).where(...).orderBy(...)` resolve). This mock
// reproduces that: every chain method returns the SAME mock instance (so a
// test can assert on e.g. `.for` regardless of where in the chain it sits),
// and the mock itself is a resolved Promise for `value`.
export function mockDrizzleChain(value: unknown) {
  // Each builder method is its own spy (so `.values(...)` / `.set(...)` calls
  // stay distinguishable) but they all return this same `chain`.
  const link = (...args: unknown[]) => {
    void args;
    return chain;
  };
  const chain = Object.assign(Promise.resolve(value), {
    from: vi.fn(link),
    where: vi.fn(link),
    orderBy: vi.fn(link),
    groupBy: vi.fn(link),
    limit: vi.fn(link),
    // Drizzle's `.for("update")` row-lock clause — chainable, resolves like
    // any other point in the chain.
    for: vi.fn(link),
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

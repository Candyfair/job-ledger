import { vi } from "vitest";

// Drizzle query builders are chainable AND thenable (awaitable at any point
// in the chain — e.g. both `await db.select().from(t)` and
// `await db.select().from(t).where(...).orderBy(...)` resolve). This mock
// reproduces that: every chain method returns another instance of the same
// mock, and the mock itself is a resolved Promise for `value`.
export function mockDrizzleChain(value: unknown) {
  const chain = Object.assign(Promise.resolve(value), {
    from: vi.fn(() => mockDrizzleChain(value)),
    where: vi.fn(() => mockDrizzleChain(value)),
    orderBy: vi.fn(() => mockDrizzleChain(value)),
    values: vi.fn(() => mockDrizzleChain(value)),
    set: vi.fn(() => mockDrizzleChain(value)),
    returning: vi.fn(() => Promise.resolve(value)),
  });
  return chain;
}

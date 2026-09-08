import { z } from "zod";

/**
 * System prompt for the title-only role-canonicalization call
 * ({@link RoleCanonicalizer.canonicalizeRoles}). This is the SPEC.md §5
 * cross-site dedup signal: the same underlying role must map to the same
 * string whether it came from Apec or HelloWork, so both sites route this
 * field through the same model rather than one using a regex table and the
 * other an LLM. Mirrors the `roleCanonical` rules in
 * {@link EXTRACTION_SYSTEM_PROMPT} — kept as a separate, narrower prompt
 * because this call sees titles alone, never full listing blocks.
 */
export const ROLE_CANONICAL_SYSTEM_PROMPT = `You map raw job titles to canonical role signatures used to detect duplicate postings across job boards. You never see anything but the titles, and you never judge which listings matter — that is handled by other code.

For each numbered title, emit exactly one entry in the "roles" array: { "index": <the title's number>, "roleCanonical": <signature> }.

"roleCanonical" is a short, consistent, kebab-case role signature derived from the title ALONE. Examples:
- "Développeur Frontend Senior React" -> "frontend-developer"
- "Ingénieur Backend Python/Django" -> "backend-developer"
- "Développeur Fullstack Node.js/React" -> "fullstack-developer"
- "Data Engineer H/F" -> "data-engineer"
- "Chef de projet digital" -> "project-manager"

Rules:
- Seniority ("Senior", "Junior", "Lead"), stack ("React", "Python"), contract type, gender markers ("H/F", "F/H"), and location never change the signature — only the underlying role does.
- Use your judgment for titles that don't match these examples closely, but stay consistent: the same underlying role always maps to the same string.
- If a title is too vague or garbled to classify at all, set "roleCanonical" to null for that index. A wrong guess is worse than null — downstream dedup treats null as "no signal".

Return a single JSON object matching the required schema — no prose, no markdown fences, one entry per input index.`;

/**
 * Wraps the raw titles as a numbered list for
 * {@link ROLE_CANONICAL_SYSTEM_PROMPT}. The index prefix is what
 * {@link alignRolesToTitles} uses to put each answer back in the caller's
 * original order even if the model drops or reorders entries.
 */
export function buildRoleCanonicalUserMessage(titles: string[]): string {
  const numbered = titles
    .map((title, index) => `${index}: ${title}`)
    .join("\n");
  return `Canonicalize each job title below.\n\n${numbered}`;
}

/**
 * JSON Schema for the role-canonicalization output, shared by Claude Haiku's
 * native `output_config.format` and DeepSeek's forced tool-use `input_schema`
 * so the two can't drift. Index-keyed rather than positional: the caller
 * ({@link alignRolesToTitles}) rebuilds a fixed-length array from the
 * indices, tolerating a dropped or reordered entry.
 */
export const ROLE_CANONICAL_JSON_SCHEMA = {
  type: "object",
  properties: {
    roles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          roleCanonical: { type: ["string", "null"] },
        },
        required: ["index", "roleCanonical"],
        additionalProperties: false,
      },
    },
  },
  required: ["roles"],
  additionalProperties: false,
} as const;

const RoleEntrySchema = z.object({
  index: z.number().int(),
  roleCanonical: z.string().nullable(),
});

/**
 * Rebuilds a `titleCount`-long, index-aligned array from a parsed role
 * response. Every slot defaults to `null`; a well-formed entry whose `index`
 * is in range overwrites its slot. A blank/whitespace-only `roleCanonical`
 * is normalized to `null`. Out-of-range indices, malformed entries, and a
 * missing/non-array `roles` field are all ignored rather than throwing —
 * this is the last step of a never-throw degradation path.
 */
export function alignRolesToTitles(
  titleCount: number,
  raw: unknown,
): (string | null)[] {
  const result: (string | null)[] = Array.from(
    { length: titleCount },
    () => null,
  );
  const roles = (raw as { roles?: unknown })?.roles;
  if (!Array.isArray(roles)) return result;

  for (const entry of roles) {
    const parsed = RoleEntrySchema.safeParse(entry);
    if (!parsed.success) continue;
    const { index, roleCanonical } = parsed.data;
    if (index < 0 || index >= titleCount) continue;
    result[index] =
      roleCanonical && roleCanonical.trim() !== ""
        ? roleCanonical.trim()
        : null;
  }
  return result;
}

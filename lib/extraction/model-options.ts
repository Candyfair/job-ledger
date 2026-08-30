import type { ModelUsed } from "./adapter-registry";

/**
 * Display copy for the trigger form's model radio cards (design/trigger.jpeg,
 * design/trigger-anonymous.jpeg). Kept as a typed data file per CLAUDE.md's
 * convention for static/config-shaped content, separate from the adapter
 * registry itself so UI copy changes never touch adapter-resolution logic.
 */
export const MODEL_OPTIONS: {
  value: ModelUsed;
  label: string;
  description: string;
}[] = [
  {
    value: "claude_haiku",
    label: "Claude Haiku",
    description: "Faster, cheaper — good default for routine runs.",
  },
  {
    value: "deepseek_v4_flash",
    label: "DeepSeek V4 Flash",
    description: "Alternate classifier — useful for cross-checking edge cases.",
  },
];

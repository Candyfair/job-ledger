export const SITES = ["apec", "hellowork"] as const;

export type Site = (typeof SITES)[number];

export const SITE_LABELS: Record<Site, string> = {
  apec: "Apec.fr",
  hellowork: "HelloWork",
};

/** Short badge text for the trigger form's site checklist (design/trigger.jpeg). */
export const SITE_CODES: Record<Site, string> = {
  apec: "APEC",
  hellowork: "HW",
};

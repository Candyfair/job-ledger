export const SITES = ["apec", "hellowork"] as const;

export type Site = (typeof SITES)[number];

export const SITE_LABELS: Record<Site, string> = {
  apec: "Apec.fr",
  hellowork: "HelloWork",
};

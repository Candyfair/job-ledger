export const SITES = ["welcome_to_the_jungle", "apec", "hellowork"] as const;

export type Site = (typeof SITES)[number];

export const SITE_LABELS: Record<Site, string> = {
  welcome_to_the_jungle: "Welcome to the Jungle",
  apec: "Apec.fr",
  hellowork: "HelloWork",
};

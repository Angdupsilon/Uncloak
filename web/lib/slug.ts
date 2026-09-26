/** URL slug for an organization (parent) name: "State Farm Mutual Auto Ins." -> "state-farm-mutual-auto-ins". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const orgHref = (name: string) => `/org/${slugify(name)}`;
export const siteHref = (id: number) => `/site/${id}`;

/**
 * "Roof tank low" at "Roof tank" reads "Roof tank low"; "Leak" at
 * "B2 booster pump room" reads "Leak, B2 booster pump room". Say the place once.
 */
export function incidentHeadline(title: string, location: string): string {
  const [head, ...rest] = location.split(", ");
  if (head && title.toLowerCase().includes(head.toLowerCase())) return rest.length ? `${title}, ${rest.join(", ")}` : title;
  return `${title}, ${location}`;
}

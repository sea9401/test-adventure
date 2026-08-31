export function friendlySparringHref(name: string): string {
  return `/battle/sparring?mode=friendly&target=${encodeURIComponent(name)}`;
}

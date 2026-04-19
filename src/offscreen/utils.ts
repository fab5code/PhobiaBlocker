export function setsEqual(a: Set<any>, b: Set<any>): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

export function arraysEqual(a: any[], b: any[]): boolean {
  a = Array.prototype.slice.call(a);
  b = Array.prototype.slice.call(b);
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  a.sort();
  b.sort();
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

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

type Shift = { code: string; name: string; periods: { start: number; end: number }[] };
export const shiftFamily = (code: string) => ({ Day: "D", Night: "N", X: "x", "อ": "x" }[code.trim()] || code.trim());
export function getShiftOptions(shifts: Shift[]) {
  const groups = new Map<string, Shift>();
  for (const shift of shifts) {
    const code = shift.code.trim();
    if (!code || /^\?+$/.test(code)) continue;
    const periods = [...shift.periods].sort((a, b) => a.start - b.start || a.end - b.end);
    const key = shiftFamily(code) + JSON.stringify(periods);
    if (!groups.has(key)) groups.set(key, { ...shift, code });
  }
  return [...groups.values()];
}

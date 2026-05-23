export function endOfMonthIso(date = new Date()) {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

export type AvailabilityRecord = {
  weekStart: string | Date;
  amount: string | number | null;
};

export type AvailabilityWeek = {
  key: string;
  label: string;
  timestamp: number;
  totals: Record<number, number>;
};

export function buildAvailabilityHistory(records: AvailabilityRecord[] = []) {
  const weeklyHistory = new Map<string, AvailabilityWeek>();
  const yearsWithData = new Set<number>();

  for (const record of records) {
    const rawWeekStart = String(record.weekStart).slice(0, 10);
    const dateParts = rawWeekStart.split("-").map(Number);
    if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) continue;

    const [year, month, day] = dateParts;
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekDate = new Date(year, month - 1, day);

    if (!weeklyHistory.has(key)) {
      weeklyHistory.set(key, {
        key,
        label: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).slice(-2)}`,
        timestamp: weekDate.getTime(),
        totals: {},
      });
    }

    const week = weeklyHistory.get(key)!;
    week.totals[year] = (week.totals[year] || 0) + (Number.parseFloat(String(record.amount)) || 0);
    yearsWithData.add(year);
  }

  return {
    allWeeks: Array.from(weeklyHistory.values()).sort((a, b) => a.timestamp - b.timestamp),
    yearsWithData: Array.from(yearsWithData).sort((a, b) => a - b),
  };
}

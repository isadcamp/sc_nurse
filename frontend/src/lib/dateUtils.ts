export const THAI_MONTH_NAMES = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

export const THAI_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
] as const;

export function toBuddhistYear(year: number): number {
  return year > 2400 ? year : year + 543;
}

export function getThaiMonthName(month: number): string {
  return THAI_MONTH_NAMES[month - 1] || "";
}

export function formatThaiMonthYear(monthInput: string | number, yearInput?: number): string {
  let month = 1;
  let year = new Date().getFullYear();

  if (typeof monthInput === "string" && monthInput.includes("-")) {
    const parts = monthInput.split("-").map(Number);
    year = parts[0] || year;
    month = parts[1] || 1;
  } else if (typeof monthInput === "number") {
    month = monthInput;
    if (yearInput !== undefined) {
      year = yearInput;
    }
  }

  const thaiMonth = getThaiMonthName(month);
  const thaiYear = toBuddhistYear(year);
  return `${thaiMonth} ${thaiYear}`;
}

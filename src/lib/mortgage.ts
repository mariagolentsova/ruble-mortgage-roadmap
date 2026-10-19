// Pure annuity mortgage math. Values are never rounded here — only on display.

export type PrepaymentType = "term" | "payment";

export interface Prepayment {
  id: string;
  /** Calendar month index: year * 12 + month (0-based month). */
  monthKey: number;
  amount: number;
  type: PrepaymentType;
}

export interface ScheduleRow {
  index: number; // 1-based
  monthKey: number;
  payment: number;
  principal: number;
  interest: number;
  extra: number;
  balance: number;
}

export interface ScheduleInput {
  principal: number;
  months: number;
  annualRate: number;
  startMonthKey: number;
  prepayments?: Prepayment[];
}

export interface ScheduleResult {
  rows: ScheduleRow[];
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  overpaymentPct: number;
  lastMonthKey: number;
}

const EPS = 1e-7;

export function calcAnnuity(principal: number, months: number, annualRate: number): number {
  if (months <= 0 || principal <= 0) return 0;
  const r = annualRate / 12 / 100;
  if (r === 0) return principal / months;
  const k = Math.pow(1 + r, months);
  return (principal * r * k) / (k - 1);
}

export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const { principal: S, months: n, annualRate, startMonthKey } = input;
  const r = annualRate / 12 / 100;
  const P0 = calcAnnuity(S, n, annualRate);
  const prepays = [...(input.prepayments ?? [])]
    .filter((p) => p.amount > 0)
    .sort((a, b) => a.monthKey - b.monthKey);

  const rows: ScheduleRow[] = [];
  let balance = S;
  let P = P0;

  for (let i = 0; i < n && balance > EPS; i++) {
    const monthKey = startMonthKey + i;
    const interest = balance * r;
    let principalPart = P - interest;
    let payment = P;
    const isLast = i === n - 1 || principalPart >= balance - EPS;
    if (isLast) {
      principalPart = balance;
      payment = balance + interest;
    }
    balance -= principalPart;

    let extra = 0;
    for (const p of prepays) {
      if (p.monthKey !== monthKey || balance <= EPS) continue;
      const amt = Math.min(p.amount, balance);
      extra += amt;
      balance -= amt;
      if (p.type === "payment" && balance > EPS) {
        P = calcAnnuity(balance, n - i - 1, annualRate);
      }
    }
    if (balance < EPS) balance = 0;

    rows.push({ index: i + 1, monthKey, payment, principal: principalPart, interest, extra, balance });
  }

  const hasPrepay = rows.some((x) => x.extra > 0);
  const totalInterest = hasPrepay
    ? rows.reduce((s, x) => s + x.interest, 0)
    : P0 * n - S;

  return {
    rows,
    monthlyPayment: P0,
    totalInterest,
    totalPaid: S + totalInterest,
    overpaymentPct: S > 0 ? (totalInterest / S) * 100 : 0,
    lastMonthKey: rows.length ? rows[rows.length - 1]!.monthKey : startMonthKey,
  };
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export const monthKeyOf = (d: Date) => d.getFullYear() * 12 + d.getMonth();
export const keyYear = (k: number) => Math.floor(k / 12);
export const keyMonth = (k: number) => k % 12;
export const monthName = (k: number) => MONTHS[keyMonth(k)];
export const formatMonthShort = (k: number) => `${MONTHS_SHORT[keyMonth(k)]} ${keyYear(k)}`;
export const formatMonthLong = (k: number) => `${MONTHS[keyMonth(k)]} ${keyYear(k)}`;

const money2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const fmtMoney = (v: number) => money2.format(v);
export const fmtInt = (v: number) => int0.format(v);
export const fmtPct = (v: number) => money2.format(v);

/** Parse "8 000 000", "6,5", "6.5" → number or NaN. */
export function parseNum(s: string): number {
  const clean = s.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (clean === "" || clean === ".") return NaN;
  return Number(clean);
}

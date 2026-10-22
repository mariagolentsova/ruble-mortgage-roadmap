// Pure annuity mortgage math. Values are never rounded here — only on display.

export type Frequency = "monthly" | "bimonthly" | "quarterly" | "semiannual" | "yearly";
export type Effect = "reduceTerm" | "reducePayment";

export interface EarlyPayment {
  id: string;
  kind: "once" | "recurring";
  /** Calendar month 'YYYY-MM' of the first (or only) prepayment. */
  startDate: string;
  /** Recurring only: 'YYYY-MM' of the last prepayment; empty = until the loan ends. */
  endDate?: string;
  /** Recurring only. */
  frequency?: Frequency;
  amount: number;
  effect: Effect;
}

export const FREQ_STEP: Record<Frequency, number> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };

/** 'YYYY-MM' → calendar month index (year * 12 + 0-based month). */
export function ymToKey(ym: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return NaN;
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}

export const keyToYm = (k: number) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;

export interface ExpandedPrepay {
  monthKey: number;
  amount: number;
  effect: Effect;
}

/**
 * Expand entries in the order they were added: a recurring record becomes one
 * occurrence per frequency step until endDate or the loan end; a one-off — a
 * single date. Entries that cannot take part in the calculation are skipped.
 */
export function expandEarlyPayments(list: EarlyPayment[], loanStart: number, loanEnd: number): ExpandedPrepay[] {
  const out: ExpandedPrepay[] = [];
  for (const p of list) {
    if (!(p.amount > 0)) continue;
    const start = ymToKey(p.startDate);
    if (!Number.isFinite(start) || start < loanStart || start > loanEnd) continue;
    if (p.kind === "recurring") {
      const step = FREQ_STEP[p.frequency ?? "monthly"];
      const rawEnd = p.endDate ? ymToKey(p.endDate) : NaN;
      const end = Math.min(Number.isFinite(rawEnd) ? rawEnd : loanEnd, loanEnd);
      for (let k = start; k <= end; k += step) out.push({ monthKey: k, amount: p.amount, effect: p.effect });
    } else {
      out.push({ monthKey: start, amount: p.amount, effect: p.effect });
    }
  }
  return out;
}

/** Error message for a record that must not take part in the calculation, or null when it is valid. */
export function validateEarlyPayment(p: EarlyPayment, loanStart: number, loanEnd: number): string | null {
  if (!(p.amount > 0)) return "Сумма должна быть больше 0";
  const start = ymToKey(p.startDate);
  if (!Number.isFinite(start)) {
    return p.kind === "recurring" ? "Выберите месяц первого погашения" : "Выберите дату погашения";
  }
  if (start < loanStart) {
    return p.kind === "recurring"
      ? "«Начиная с» не может быть раньше начала выплат"
      : "Дата не может быть раньше месяца начала выплат";
  }
  if (start > loanEnd) {
    return p.kind === "recurring"
      ? "«Начиная с» не может выходить за срок кредита"
      : "Дата не может выходить за срок кредита";
  }
  if (p.kind === "recurring" && p.endDate) {
    const end = ymToKey(p.endDate);
    if (Number.isFinite(end) && end < start) return "«Заканчивая» не может быть раньше «Начиная с»";
  }
  return null;
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
}

export interface ScheduleResult {
  rows: ScheduleRow[];
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  overpaymentPct: number;
  lastMonthKey: number;
  totalPrepaid: number;
}

const EPS = 1e-7;

export function calcAnnuity(principal: number, months: number, annualRate: number): number {
  if (months <= 0 || principal <= 0) return 0;
  const r = annualRate / 12 / 100;
  if (r === 0) return principal / months;
  const k = Math.pow(1 + r, months);
  return (principal * r * k) / (k - 1);
}

export function buildSchedule(input: ScheduleInput, earlyPayments: EarlyPayment[] = []): ScheduleResult {
  const { principal: S, months: n, annualRate, startMonthKey } = input;
  const r = annualRate / 12 / 100;
  const P0 = calcAnnuity(S, n, annualRate);
  const prepays = expandEarlyPayments(earlyPayments, startMonthKey, startMonthKey + n - 1).sort(
    (a, b) => a.monthKey - b.monthKey, // stable: same-month entries keep the order they were added
  );

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
      if (p.effect === "reducePayment" && balance > EPS) {
        P = calcAnnuity(balance, n - i - 1, annualRate);
      }
    }
    if (balance < EPS) balance = 0;

    rows.push({ index: i + 1, monthKey, payment, principal: principalPart, interest, extra, balance });
  }

  const hasPrepay = rows.some((x) => x.extra > 0);
  const totalInterest = hasPrepay ? rows.reduce((s, x) => s + x.interest, 0) : P0 * n - S;
  const totalPrepaid = rows.reduce((s, x) => s + x.extra, 0);

  return {
    rows,
    monthlyPayment: P0,
    totalInterest,
    totalPaid: S + totalInterest,
    overpaymentPct: S > 0 ? (totalInterest / S) * 100 : 0,
    lastMonthKey: rows.length ? rows[rows.length - 1]!.monthKey : startMonthKey,
    totalPrepaid,
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

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const money2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const fmtMoney = (v: number) => money2.format(v);
export const fmtInt = (v: number) => int0.format(v);
export const fmtPct = (v: number) => money2.format(v);

/** "161 платёж" */
export const formatPayments = (n: number) => `${fmtInt(n)} ${plural(n, "платёж", "платежа", "платежей")}`;

/** "12 лет 3 мес." */
export function formatTermRu(m: number): string {
  const y = Math.floor(m / 12);
  const mm = m % 12;
  const parts: string[] = [];
  if (y) parts.push(`${fmtInt(y)} ${plural(y, "год", "года", "лет")}`);
  if (mm) parts.push(`${mm} мес.`);
  return parts.join(" ") || "0 мес.";
}

/** Parse "8 000 000", "6,5", "6.5" → number or NaN. */
export function parseNum(s: string): number {
  const clean = s.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (clean === "" || clean === ".") return NaN;
  return Number(clean);
}

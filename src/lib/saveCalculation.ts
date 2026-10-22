// Builds the "Сохранить расчёт" payload and sends it to the bot backend (n8n).
// The user is identified on the server from Telegram initData, never from this payload.

import { fmtInt, keyToYm, type EarlyPayment, type ScheduleResult } from "./mortgage";

/** Same-origin path; Nginx proxies it to the n8n webhook. Override with VITE_SAVE_URL for local tests. */
export const SAVE_URL: string = import.meta.env["VITE_SAVE_URL"] ?? "/api/save-calculation";

export interface CalculationInput {
  price: number;
  downPayment: number;
  loan: number;
  months: number;
  rate: number;
  startMonthKey: number;
  prepays: EarlyPayment[];
  result: ScheduleResult;
  /** Interest saved by prepayments vs. the same loan without them; 0 when there are none. */
  savedInterest: number;
}

/** Flat record: one key per Data Table column. */
export interface CalculationRecord {
  price: number;
  down_payment: number;
  loan_amount: number;
  term_months: number;
  rate: number;
  start_month: string;
  prepayments: string;
  monthly_payment: number;
  total_interest: number;
  overpayment_pct: number;
  total_paid: number;
  actual_term_months: number;
  last_payment_month: string;
  prepaid_total: number;
  saved_interest: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

const FREQ_TEXT: Record<string, string> = {
  monthly: "ежемесячно",
  bimonthly: "раз в 2 месяца",
  quarterly: "ежеквартально",
  semiannual: "раз в полгода",
  yearly: "раз в год",
};

/** "500 000 ₽ раз в 2 месяца с 2027-10 по 2030-12, уменьшить срок" */
export function describePrepayment(p: EarlyPayment): string {
  const effect = p.effect === "reducePayment" ? "уменьшить платёж" : "уменьшить срок";
  const sum = `${fmtInt(p.amount)} ₽`;
  if (p.kind === "once") return `${sum} в ${p.startDate}, ${effect}`;
  const freq = FREQ_TEXT[p.frequency ?? "monthly"] ?? "ежемесячно";
  const until = p.endDate ? ` по ${p.endDate}` : " до конца срока";
  return `${sum} ${freq} с ${p.startDate}${until}, ${effect}`;
}

export function buildCalculationRecord(c: CalculationInput): CalculationRecord {
  const r = c.result;
  return {
    price: round2(c.price),
    down_payment: round2(c.downPayment),
    loan_amount: round2(c.loan),
    term_months: c.months,
    rate: c.rate,
    start_month: keyToYm(c.startMonthKey),
    prepayments: c.prepays.length ? c.prepays.map(describePrepayment).join("; ") : "нет",
    monthly_payment: round2(r.monthlyPayment),
    total_interest: round2(r.totalInterest),
    overpayment_pct: round2(r.overpaymentPct),
    total_paid: round2(r.totalPaid),
    actual_term_months: r.rows.length,
    last_payment_month: keyToYm(r.lastMonthKey),
    prepaid_total: round2(r.totalPrepaid),
    saved_interest: round2(c.savedInterest),
  };
}

export type SaveOutcome =
  | { ok: true; created: boolean }
  | { ok: false; reason: "no-telegram" | "auth" | "network" | "server" };

/** POSTs the record with Telegram initData; the server checks the signature and upserts by Telegram ID. */
export async function saveCalculation(
  initData: string | undefined,
  record: CalculationRecord,
  fetchImpl: typeof fetch = fetch,
): Promise<SaveOutcome> {
  if (!initData) return { ok: false, reason: "no-telegram" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetchImpl(SAVE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData, calculation: record }),
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "auth" };
    if (!res.ok) return { ok: false, reason: "server" };
    const body = (await res.json().catch(() => ({}))) as { created?: boolean };
    return { ok: true, created: !!body.created };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export const SAVE_MESSAGES: Record<Exclude<SaveOutcome, { ok: true }>["reason"], string> = {
  "no-telegram": "Сохранение работает, когда калькулятор открыт из Telegram-бота",
  auth: "Не удалось подтвердить вход через Telegram. Закройте калькулятор и откройте его из бота заново",
  network: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз",
  server: "Не удалось сохранить расчёт. Попробуйте ещё раз через минуту",
};

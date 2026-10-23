import { describe, expect, it, vi } from "vitest";
import { buildSchedule, keyToYm, type EarlyPayment } from "./mortgage";
import { buildCalculationRecord, describePrepayment, formatCalculationText, saveCalculation } from "./saveCalculation";

const start = 2026 * 12 + 9; // October 2026
const result = buildSchedule({ principal: 6_500_000, months: 180, annualRate: 6, startMonthKey: start });
const record = buildCalculationRecord({
  price: 8_000_000,
  downPayment: 1_500_000,
  loan: 6_500_000,
  months: 180,
  rate: 6,
  startMonthKey: start,
  prepays: [],
  result,
  savedInterest: 0,
});

describe("buildCalculationRecord", () => {
  it("flattens parameters and results into table columns, rounded to kopecks", () => {
    expect(record).toMatchObject({
      price: 8_000_000,
      down_payment: 1_500_000,
      loan_amount: 6_500_000,
      term_months: 180,
      rate: 6,
      start_month: "2026-10",
      prepayments: "нет",
      monthly_payment: 54_850.69,
      actual_term_months: 180,
      last_payment_month: "2041-09",
      prepaid_total: 0,
    });
    expect(record.total_interest).toBeCloseTo(3_373_124.89, 2);
  });
});

describe("describePrepayment", () => {
  const base: EarlyPayment = { id: "a", kind: "once", startDate: keyToYm(start + 12), amount: 500_000, effect: "reduceTerm" };
  it("one-off", () => {
    expect(describePrepayment(base)).toBe("500 000 ₽ в 2027-10, уменьшить срок");
  });
  it("recurring every 2 months without an end date", () => {
    expect(describePrepayment({ ...base, kind: "recurring", frequency: "bimonthly", effect: "reducePayment" })).toBe(
      "500 000 ₽ раз в 2 месяца с 2027-10 до конца срока, уменьшить платёж",
    );
  });
});

describe("saveCalculation", () => {
  const ok = (body: unknown, status = 200) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("needs Telegram initData", async () => {
    const f = ok({});
    expect(await saveCalculation(undefined, record, f)).toEqual({ ok: false, reason: "no-telegram" });
    expect(f).not.toHaveBeenCalled();
  });
  it("sends initData with the record and reports created vs updated", async () => {
    const f = ok({ ok: true, created: true });
    expect(await saveCalculation("query_id=1&hash=x", record, f)).toEqual({ ok: true, created: true });
    const body = JSON.parse(f.mock.calls[0]![1].body as string);
    expect(body.initData).toBe("query_id=1&hash=x");
    expect(body.calculation.loan_amount).toBe(6_500_000);
  });
  it("maps a rejected signature to an auth error", async () => {
    expect(await saveCalculation("x", record, ok({}, 401))).toEqual({ ok: false, reason: "auth" });
  });
  it("maps a server failure and a network failure", async () => {
    expect(await saveCalculation("x", record, ok({}, 500))).toEqual({ ok: false, reason: "server" });
    expect(await saveCalculation("x", record, vi.fn().mockRejectedValue(new TypeError("offline")))).toEqual({
      ok: false,
      reason: "network",
    });
  });
});

describe("formatCalculationText", () => {
  it("lists parameters, results and the disclaimer", () => {
    const t = formatCalculationText(record);
    expect(t).toContain("Сумма кредита: 6 500 000 ₽");
    expect(t).toContain("Срок: 15 лет, ставка 6,00 %");
    expect(t).toContain("Начало выплат: октябрь 2026");
    expect(t).toContain("Ежемесячный платёж: 54 850,69 ₽");
    expect(t).toContain("Последний платёж: сентябрь 2041");
    expect(t).toContain("не является публичной офертой");
    expect(t).not.toContain("Досрочные");
  });
});

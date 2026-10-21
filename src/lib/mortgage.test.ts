import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  calcAnnuity,
  expandEarlyPayments,
  keyToYm,
  validateEarlyPayment,
  ymToKey,
  type EarlyPayment,
} from "./mortgage";

const base = { principal: 6_500_000, months: 180, annualRate: 6, startMonthKey: 2026 * 12 };
const loanEnd = base.startMonthKey + base.months - 1;

const once = (over: Partial<EarlyPayment> = {}): EarlyPayment => ({
  id: "a",
  kind: "once",
  startDate: keyToYm(base.startMonthKey + 11),
  amount: 1_000_000,
  effect: "reduceTerm",
  ...over,
});

describe("mortgage annuity", () => {
  it("monthly payment for 6.5M / 180m / 6% is 54 850,69", () => {
    expect(calcAnnuity(6_500_000, 180, 6).toFixed(2)).toBe("54850.69");
  });
  it("totals match reference", () => {
    const s = buildSchedule(base);
    // Brief gives "≈ 3 373 125,28"; the exact P×n−S is 3 373 124,89 — allow < 1 ₽.
    expect(Math.abs(s.totalInterest - 3_373_125.28)).toBeLessThan(1);
    expect(s.overpaymentPct.toFixed(2)).toBe("51.89");
    expect(Math.abs(s.totalPaid - 9_873_125.28)).toBeLessThan(1);
  });
  it("first month split", () => {
    const r = buildSchedule(base).rows[0]!;
    expect(r.interest.toFixed(2)).toBe("32500.00");
    expect(r.principal.toFixed(2)).toBe("22350.69");
    expect(r.balance.toFixed(2)).toBe("6477649.31");
  });
  it("ends with zero balance in month 180", () => {
    const s = buildSchedule(base);
    expect(s.rows.length).toBe(180);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });
  it("zero rate: P = S / n", () => {
    expect(calcAnnuity(1200, 12, 0)).toBe(100);
  });
  it("reduce-term prepayment shortens the loan and saves interest", () => {
    const s = buildSchedule(base, [once()]);
    expect(s.rows.length).toBeLessThan(180);
    expect(s.totalInterest).toBeLessThan(3_373_125.28);
    expect(s.totalPrepaid).toBe(1_000_000);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });
  it("reduce-payment prepayment keeps the term and lowers payment from the next month", () => {
    const s = buildSchedule(base, [once({ effect: "reducePayment" })]);
    expect(s.rows.length).toBe(180);
    expect(s.rows[11]!.payment).toBeCloseTo(54_850.69, 1);
    expect(s.rows[12]!.payment).toBeLessThan(54_850);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });
  it("prepayment larger than the balance closes the loan that month", () => {
    const s = buildSchedule(base, [once({ startDate: keyToYm(base.startMonthKey + 11), amount: 10_000_000 })]);
    expect(s.rows.length).toBe(12);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });
  it("expandEarlyPayments: quarterly recurring expands into dates 3 months apart", () => {
    const list = [once({ kind: "recurring", frequency: "quarterly", startDate: keyToYm(base.startMonthKey), endDate: keyToYm(base.startMonthKey + 11) })];
    const xs = expandEarlyPayments(list, base.startMonthKey, loanEnd);
    expect(xs.map((x) => x.monthKey)).toEqual([base.startMonthKey, base.startMonthKey + 3, base.startMonthKey + 6, base.startMonthKey + 9]);
    expect(xs.every((x) => x.amount === 1_000_000 && x.effect === "reduceTerm")).toBe(true);
  });
  it("expandEarlyPayments: recurring without endDate runs to the loan end", () => {
    const xs = expandEarlyPayments([once({ kind: "recurring", frequency: "yearly", startDate: keyToYm(base.startMonthKey) })], base.startMonthKey, loanEnd);
    expect(xs.length).toBe(15);
    expect(xs.at(-1)!.monthKey).toBe(base.startMonthKey + 168);
  });
  it("expandEarlyPayments: clamps endDate beyond the loan and skips invalid entries", () => {
    const xs = expandEarlyPayments(
      [
        once({ kind: "recurring", frequency: "monthly", startDate: keyToYm(loanEnd - 2), endDate: keyToYm(loanEnd + 5) }),
        once({ amount: 0 }),
        once({ startDate: keyToYm(base.startMonthKey - 1) }),
        once({ startDate: keyToYm(loanEnd + 1) }),
      ],
      base.startMonthKey,
      loanEnd,
    );
    expect(xs.length).toBe(3);
    expect(xs.at(-1)!.monthKey).toBe(loanEnd);
  });
  it("same-month entries keep the order they were added", () => {
    const xs = expandEarlyPayments([once({ startDate: keyToYm(base.startMonthKey + 5), effect: "reduceTerm" }), once({ id: "b", startDate: keyToYm(base.startMonthKey + 5), effect: "reducePayment" })], base.startMonthKey, loanEnd);
    expect(xs.map((x) => x.effect)).toEqual(["reduceTerm", "reducePayment"]);
  });
  it("validateEarlyPayment flags out-of-range dates and bad sums", () => {
    expect(validateEarlyPayment(once({ amount: 0 }), base.startMonthKey, loanEnd)).toContain("больше 0");
    expect(validateEarlyPayment(once({ startDate: keyToYm(base.startMonthKey - 1) }), base.startMonthKey, loanEnd)).toContain("раньше");
    expect(validateEarlyPayment(once({ startDate: keyToYm(loanEnd + 1) }), base.startMonthKey, loanEnd)).toContain("за срок");
    expect(
      validateEarlyPayment(
        once({ kind: "recurring", startDate: keyToYm(base.startMonthKey + 5), endDate: keyToYm(base.startMonthKey + 2) }),
        base.startMonthKey,
        loanEnd,
      ),
    ).toContain("раньше");
    expect(validateEarlyPayment(once(), base.startMonthKey, loanEnd)).toBeNull();
  });
  it("recurring prepayments reduce total interest vs baseline", () => {
    const list = [once({ kind: "recurring", frequency: "monthly", startDate: keyToYm(base.startMonthKey + 12), amount: 50_000 })];
    const s = buildSchedule(base, list);
    const plain = buildSchedule(base);
    expect(s.totalInterest).toBeLessThan(plain.totalInterest);
    expect(s.rows.length).toBeLessThan(180); // 50 000 ₽/мес. закрывает кредит раньше срока
    expect(s.totalPrepaid).toBeGreaterThan(0);
    expect(s.rows.every((r) => r.extra <= 50_000)).toBe(true);
    expect(ymToKey("2026-03")).toBe(2026 * 12 + 2);
  });
});

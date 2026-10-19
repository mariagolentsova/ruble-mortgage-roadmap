import { describe, expect, it } from "vitest";
import { buildSchedule, calcAnnuity } from "./mortgage";

const base = { principal: 6_500_000, months: 180, annualRate: 6, startMonthKey: 2026 * 12 };

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
    const s = buildSchedule({ ...base, prepayments: [{ id: "a", monthKey: base.startMonthKey + 11, amount: 1_000_000, type: "term" }] });
    expect(s.rows.length).toBeLessThan(180);
    expect(s.totalInterest).toBeLessThan(3_373_125.28);
  });
  it("reduce-payment prepayment keeps the term and lowers payment", () => {
    const s = buildSchedule({ ...base, prepayments: [{ id: "a", monthKey: base.startMonthKey + 11, amount: 1_000_000, type: "payment" }] });
    expect(s.rows.length).toBe(180);
    expect(s.rows[20]!.payment).toBeLessThan(54_850);
  });
});

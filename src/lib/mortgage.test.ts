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
    // calcus.ru and the original brief: 3 373 125,28 ₽ (interest rounded to kopecks each month).
    expect(s.totalInterest).toBe(3_373_125.28);
    expect(s.overpaymentPct.toFixed(2)).toBe("51.89");
    expect(s.totalPaid).toBe(9_873_125.28);
    expect(s.rows.at(-1)!.payment).toBe(54_851.77); // the last payment closes the loan
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
  it("expandEarlyPayments: bimonthly recurring expands into dates 2 months apart", () => {
    const list = [once({ kind: "recurring", frequency: "bimonthly", startDate: keyToYm(base.startMonthKey + 1), endDate: keyToYm(base.startMonthKey + 10) })];
    const xs = expandEarlyPayments(list, base.startMonthKey, loanEnd);
    expect(xs.map((x) => x.monthKey - base.startMonthKey)).toEqual([1, 3, 5, 7, 9]);
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

// Reference results from calcus.ru/kalkulyator-ipoteki (checked 27.10.2026, schedules identical row by row
// except calcus's last row, which leaves a few kopecks unpaid). Loan starts October 2026.
describe("matches calcus.ru", () => {
  const start = 2026 * 12 + 9;
  type Case = [string, number, number, number, Partial<EarlyPayment> | null, number, number, number];
  // name, loan ₽, years, rate %, prepayment, interest ₽, months, total prepaid ₽
  const monthly = { kind: "recurring" as const, frequency: "monthly" as const };
  const cases: Case[] = [
    ["7M/25y/8% without prepayments", 7_000_000, 25, 8, null, 9_208_137.64, 300, 0],
    ["customer example: 10 000 monthly, reduce term", 7_000_000, 25, 8, { ...monthly, amount: 10_000, effect: "reduceTerm" }, 5_576_166.22, 197, 1_960_000],
    ["10 000 monthly, reduce payment", 7_000_000, 25, 8, { ...monthly, amount: 10_000, effect: "reducePayment" }, 7_385_324.93, 296, 2_951_929.05],
    ["100 000 every 2 months from month 2, reduce term", 7_000_000, 25, 8, { kind: "recurring", frequency: "bimonthly", amount: 100_000, effect: "reduceTerm", startDate: keyToYm(start + 1) }, 2_340_453.97, 90, 4_478_011.37],
    ["100 000 quarterly from month 3, reduce payment", 7_000_000, 25, 8, { kind: "recurring", frequency: "quarterly", amount: 100_000, effect: "reducePayment", startDate: keyToYm(start + 2) }, 4_085_258.71, 177, 5_890_808.99],
    ["100 000 twice a year from month 6, reduce term", 7_000_000, 25, 8, { kind: "recurring", frequency: "semiannual", amount: 100_000, effect: "reduceTerm", startDate: keyToYm(start + 5) }, 4_562_682.41, 165, 2_700_000],
    ["100 000 yearly from month 12, reduce payment", 7_000_000, 25, 8, { kind: "recurring", frequency: "yearly", amount: 100_000, effect: "reducePayment", startDate: keyToYm(start + 11) }, 7_749_014.27, 300, 2_400_000.03],
    ["1 000 000 once in month 13, reduce term", 7_000_000, 25, 8, { kind: "once", amount: 1_000_000, effect: "reduceTerm", startDate: keyToYm(start + 12) }, 5_290_923.29, 209, 1_000_000],
    ["1 000 000 once in month 13, reduce payment", 7_000_000, 25, 8, { kind: "once", amount: 1_000_000, effect: "reducePayment", startDate: keyToYm(start + 12) }, 7_961_051.98, 300, 1_000_000],
    ["3M/10y/21.5%, 25 000 monthly, reduce payment", 3_000_000, 10, 21.5, { ...monthly, amount: 25_000, effect: "reducePayment" }, 2_433_337.3, 92, 2_278_462.84],
    ["12M/30y/9.9%, 150 000 quarterly from month 3, reduce term", 12_000_000, 30, 9.9, { kind: "recurring", frequency: "quarterly", amount: 150_000, effect: "reduceTerm", startDate: keyToYm(start + 2) }, 7_349_369.76, 126, 6_192_083.1],
  ];
  it.each(cases)("%s", (_name, loan, years, rate, prepay, interest, months, prepaid) => {
    const list: EarlyPayment[] = prepay ? [{ id: "x", kind: "once", startDate: keyToYm(start), amount: 0, effect: "reduceTerm", ...prepay } as EarlyPayment] : [];
    const s = buildSchedule({ principal: loan, months: years * 12, annualRate: rate, startMonthKey: start }, list);
    expect(s.totalInterest).toBe(interest);
    expect(s.rows.length).toBe(months);
    expect(s.totalPrepaid).toBe(prepaid);
    expect(s.rows.at(-1)!.balance).toBe(0);
  });
});

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown, Info, Plus, Trash2, Share2, Save, RotateCcw, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Donut, RepaymentBars } from "@/components/mortgage/Charts";
import {
  buildSchedule,
  expandEarlyPayments,
  fmtInt,
  fmtMoney,
  fmtPct,
  formatMonthLong,
  formatMonthShort,
  formatPayments,
  formatTermRu,
  keyMonth,
  keyToYm,
  keyYear,
  monthKeyOf,
  parseNum,
  validateEarlyPayment,
  ymToKey,
  type EarlyPayment,
  type Frequency,
  type ScheduleRow,
} from "@/lib/mortgage";
import { buildCalculationRecord, formatCalculationText, saveCalculation, SAVE_MESSAGES } from "@/lib/saveCalculation";
import { copyText } from "@/lib/clipboard";

// Logos live in public/. Relative paths, so the app works at / and under a prefix like /calc/.
const LOGO_MILK = "logo-milk.png";
const LOGO_GOLD = "logo-gold.png";


/* ---------- state ---------- */

type FormState = {
  price: string;
  down: string;
  downUnit: "rub" | "pct";
  term: string;
  termUnit: "y" | "m";
  rate: string;
  startKey: number;
  prepays: EarlyPayment[];
  prepayOpen: boolean;
};

/** Key used by earlier versions to remember the form; now only cleared on open. */
const OLD_STORAGE = "mortgage-form-v1";
// The calculator always opens empty: no sample numbers, nothing restored from a previous visit.
const defaults = (): FormState => ({
  price: "",
  down: "",
  downUnit: "rub",
  term: "",
  termUnit: "y",
  rate: "",
  startKey: monthKeyOf(new Date()),
  prepays: [],
  prepayOpen: false,
});

type TgWebApp = {
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  switchInlineQuery?: (q: string, types?: string[]) => void;
  initData?: string;
};
const tg = (): TgWebApp | undefined =>
  typeof window !== "undefined" ? (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp : undefined;

const uid = () => Math.random().toString(36).slice(2, 9);
const groupDigits = (s: string) => {
  const n = parseNum(s);
  return Number.isFinite(n) ? fmtInt(Math.trunc(n)) : s;
};

/* ---------- page ---------- */

export default function Calculator() {
  const [f, setF] = useState<FormState>(defaults);
  const [shown, setShown] = useState(false);
  const [theme, setTheme] = useState<"milk" | "gold">("milk");
  const resultsRef = useRef<HTMLDivElement>(null);
  // Errors appear only for a field the person has left, or after «Рассчитать» — never on an untouched empty form.
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<"price" | "down" | "term" | "rate", boolean>>>({});
  const touch = (k: "price" | "down" | "term" | "rate") => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  useEffect(() => {
    try {
      localStorage.removeItem(OLD_STORAGE); // drop numbers a previous version may have kept
    } catch {
      /* storage unavailable */
    }
    const t = (document.documentElement.dataset["theme"] as "milk" | "gold") || "milk";
    setTheme(t);
    const obs = new MutationObserver(() => setTheme((document.documentElement.dataset["theme"] as "milk" | "gold") || "milk"));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const w = tg();
    if (w) {
      try {
        w.ready();
        w.expand();
        w.setHeaderColor?.("#0B1F44");
        w.setBackgroundColor?.("#F7F3E9");
      } catch {
        /* outside Telegram */
      }
    }
    return () => obs.disconnect();
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  /* ---- parse + validate ---- */
  const price = parseNum(f.price);
  const downRaw = parseNum(f.down);
  const downRub = f.downUnit === "pct" ? (price * downRaw) / 100 : downRaw;
  const termRaw = parseNum(f.term);
  const months = f.termUnit === "y" ? Math.round(termRaw * 12) : Math.round(termRaw);
  const rate = parseNum(f.rate);
  const loan = price - downRub;

  const errors: Partial<Record<"price" | "down" | "term" | "rate", string>> = {};
  if (!Number.isFinite(price)) errors.price = "Введите стоимость";
  else if (price < 100_000 || price > 1_000_000_000) errors.price = "От 100 000 до 1 000 000 000 ₽";
  if (!Number.isFinite(downRaw)) errors.down = "Введите взнос";
  else if (downRub < 0) errors.down = "Взнос не может быть отрицательным";
  else if (Number.isFinite(price) && downRub > price - 1) errors.down = "Взнос должен быть меньше стоимости";
  if (!Number.isFinite(termRaw) || months < 1) errors.term = "Минимум 1 месяц";
  else if (months > 600) errors.term = "Максимум 50 лет";
  if (!Number.isFinite(rate)) errors.rate = "Введите ставку";
  else if (rate < 0.01 || rate > 100) errors.rate = "От 0,01 до 100 %";
  const valid = Object.keys(errors).length === 0;
  const shownErr = (k: "price" | "down" | "term" | "rate") => (submitted || touched[k] ? errors[k] : undefined);
  // The loan amount depends only on price and down payment, so it shows as soon as those two are filled.
  const loanReady = !errors.price && !errors.down;
  const lowDown = loanReady && downRub < price * 0.2;

  /* ---- early prepayments ---- */
  const loanEndKey = f.startKey + Math.max(1, months) - 1;
  const prepayErrors: (string | null)[] = f.prepays.map((p) =>
    valid ? validateEarlyPayment(p, f.startKey, loanEndKey) : "Сначала исправьте параметры кредита",
  );
  const validPrepays = f.prepays.filter((_, i) => !prepayErrors[i]);
  // Schedule without prepayments: baseline for the effect block and the "loan closed in full" hint.
  const plain = useMemo(
    () => (valid ? buildSchedule({ principal: loan, months, annualRate: rate, startMonthKey: f.startKey }) : null),
    [valid, loan, months, rate, f.startKey],
  );
  const closesLoan = (p: EarlyPayment) => {
    if (p.kind !== "once" || !(p.amount > 0) || !plain) return false;
    const row = plain.rows.find((r) => r.monthKey === ymToKey(p.startDate));
    return !!row && p.amount >= row.balance - 0.01;
  };

  /* ---- debounced inputs ---- */
  const key = valid ? JSON.stringify([loan, months, rate, f.startKey, validPrepays]) : "";
  const [debKey, setDebKey] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebKey(key), 300);
    return () => clearTimeout(t);
  }, [key]);

  const calc = useMemo(() => {
    if (!debKey) return null;
    const [S, n, r, start, prepays] = JSON.parse(debKey) as [number, number, number, number, EarlyPayment[]];
    const res = buildSchedule({ principal: S, months: n, annualRate: r, startMonthKey: start }, prepays);
    const baseline = prepays.length ? buildSchedule({ principal: S, months: n, annualRate: r, startMonthKey: start }) : null;
    // Monthly payments recalculated after each "reduce payment" prepayment, in order.
    const paymentChanges: number[] = [];
    for (const e of expandEarlyPayments(prepays, start, start + n - 1)) {
      if (e.effect !== "reducePayment") continue;
      const i = res.rows.findIndex((rw) => rw.monthKey === e.monthKey);
      if (i >= 0 && i + 1 < res.rows.length) paymentChanges.push(res.rows[i + 1]!.payment);
    }
    return { S, n, r, start, prepays, res, baseline, paymentChanges };
  }, [debKey]);

  const onCalculate = () => {
    setSubmitted(true);
    if (!valid) {
      toast.error("Проверьте поля формы");
      return;
    }
    setDebKey(key);
    setShown(true);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const onReset = () => {
    setF(defaults());
    setShown(false);
    setSubmitted(false);
    setTouched({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleDownUnit = (u: "rub" | "pct") => {
    if (u === f.downUnit) return;
    if (u === "pct" && Number.isFinite(downRub) && price > 0) set("down", String(+((downRub / price) * 100).toFixed(2)));
    if (u === "rub" && Number.isFinite(downRub)) set("down", String(Math.round(downRub)));
    setF((p) => ({ ...p, downUnit: u }));
  };
  const toggleTermUnit = (u: "y" | "m") => {
    if (u === f.termUnit) return;
    const v = Number.isFinite(termRaw) ? (u === "m" ? Math.round(termRaw * 12) : Math.max(1, Math.round(termRaw / 12))) : "";
    setF((p) => ({ ...p, termUnit: u, term: String(v) }));
  };

  /** The current result as a table row; also the source of the copied text. */
  const currentRecord = () => {
    if (!calc) return null;
    const { S, n, r, start, prepays, res, baseline } = calc;
    return buildCalculationRecord({
      price,
      downPayment: downRub,
      loan: S,
      months: n,
      rate: r,
      startMonthKey: start,
      prepays,
      result: res,
      savedInterest: baseline ? baseline.totalInterest - res.totalInterest : 0,
    });
  };

  const share = async () => {
    const record = currentRecord();
    if (!record) return;
    const text = formatCalculationText(record);
    const w = tg();
    if (w?.initData && w.switchInlineQuery) {
      try {
        w.switchInlineQuery(text, ["users", "groups", "channels"]);
        return;
      } catch {
        /* inline mode is off for the bot — copy instead */
      }
    }
    if (await copyText(text)) toast.success("Расчёт скопирован в буфер обмена");
    else toast.error("Не удалось скопировать расчёт");
  };

  const [saving, setSaving] = useState(false);
  // «Сохранить расчёт» saves the result to the bot's table and copies it as text to the clipboard.
  const save = async () => {
    const record = currentRecord();
    if (!record || saving) return;
    // Copy first, while the tap still counts: after the network request the WebView may refuse.
    const copying = copyText(formatCalculationText(record));
    setSaving(true);
    const [out, copied] = await Promise.all([saveCalculation(tg()?.initData, record), copying]);
    setSaving(false);
    const copyNote = copied ? "Текст расчёта скопирован в буфер обмена" : undefined;
    if (out.ok) {
      toast.success(out.created ? "Расчёт сохранён" : "Сохранённый расчёт обновлён", { description: copyNote });
    } else if (out.reason === "no-telegram") {
      if (copied) toast.success("Расчёт скопирован в буфер обмена", { description: SAVE_MESSAGES[out.reason] });
      else toast.info(SAVE_MESSAGES[out.reason]);
    } else {
      toast.error(SAVE_MESSAGES[out.reason], { description: copyNote });
    }
  };

  const logo = theme === "gold" ? LOGO_GOLD : LOGO_MILK;

  return (
    <div className="mx-auto min-h-screen w-full max-w-[480px] overflow-x-hidden">
      <header className="safe-top bg-navy px-5 pb-5 text-navy-foreground">
        <div className="flex items-center justify-center">
          <img src={logo} alt="Центр недвижимости «Совесть»" className="h-10 w-auto" />
        </div>
        <h1 className="mt-3 text-center text-lg font-semibold tracking-tight text-brand">Ипотечный калькулятор</h1>
      </header>

      <main className="safe-bottom space-y-4 px-4 pt-4">
        {/* Parameters */}
        <Card title="Параметры">
          <Field label="Стоимость недвижимости" error={shownErr("price")}>
            <NumInput value={f.price} onChange={(v) => set("price", v)} suffix="₽" invalid={!!shownErr("price")} onBlur={() => touch("price")} integer />
          </Field>

          <Field
            label="Первоначальный взнос"
            error={shownErr("down")}
            hint={
              !errors.down && Number.isFinite(downRub) && price > 0
                ? f.downUnit === "rub"
                  ? `= ${fmtPct((downRub / price) * 100)} %`
                  : `= ${fmtInt(downRub)} ₽`
                : undefined
            }
            warn={lowDown ? "Многие банки требуют взнос от 20 %" : undefined}
          >
            <div className="flex gap-2">
              <NumInput
                value={f.down}
                onChange={(v) => set("down", v)}
                invalid={!!shownErr("down")}
                onBlur={() => touch("down")}
                integer={f.downUnit === "rub"}
              />
              <Segmented value={f.downUnit} onChange={toggleDownUnit} options={[["rub", "₽"], ["pct", "%"]]} />
            </div>
          </Field>

          <div className="rounded-md bg-muted px-4 py-3">
            <div className="text-xs text-muted-foreground">Сумма кредита</div>
            <div className="text-xl font-bold">{loanReady ? `${fmtInt(loan)} ₽` : "—"}</div>
          </div>

          <Field label="Срок кредита" error={shownErr("term")}>
            <div className="flex gap-2">
              <NumInput value={f.term} onChange={(v) => set("term", v)} invalid={!!shownErr("term")} onBlur={() => touch("term")} integer />
              <Segmented value={f.termUnit} onChange={toggleTermUnit} options={[["y", "лет"], ["m", "мес."]]} />
            </div>
            <Slider
              className="mt-4 py-2"
              min={1}
              max={f.termUnit === "y" ? 50 : 600}
              step={1}
              value={[Math.min(Math.max(Number.isFinite(termRaw) ? termRaw : 1, 1), f.termUnit === "y" ? 50 : 600)]}
              onValueChange={([v]) => set("term", String(v))}
            />
          </Field>

          <Field label="Процентная ставка" error={shownErr("rate")}>
            <NumInput value={f.rate} onChange={(v) => set("rate", v)} suffix="%" invalid={!!shownErr("rate")} onBlur={() => touch("rate")} />
          </Field>

          <Field label="Начало выплат">
            <MonthPicker value={f.startKey} onChange={(k) => set("startKey", k)} />
          </Field>

          <button
            type="button"
            onClick={() => set("prepayOpen", !f.prepayOpen)}
            className="flex min-h-11 items-center gap-2 text-sm font-semibold text-navy-soft"
          >
            <Plus className={`h-4 w-4 transition-transform duration-200 ${f.prepayOpen ? "rotate-45" : ""}`} />
            Досрочные погашения
          </button>

          {f.prepayOpen && (
            <div className="fade-in-up space-y-3">
              {f.prepays.length === 0 && <p className="text-sm text-muted-foreground">Пока нет досрочных погашений.</p>}
              {f.prepays.map((p, i) => (
                <PrepayCard
                  key={p.id}
                  p={p}
                  index={i}
                  error={submitted ? (prepayErrors[i] ?? undefined) : undefined}
                  showErrors={submitted}
                  closesLoan={closesLoan(p)}
                  onChange={(np) => set("prepays", f.prepays.map((x) => (x.id === p.id ? np : x)))}
                  onRemove={() => set("prepays", f.prepays.filter((x) => x.id !== p.id))}
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  set("prepays", [
                    ...f.prepays,
                    { id: uid(), kind: "once", startDate: keyToYm(f.startKey + 12), amount: 0, effect: "reduceTerm" },
                  ])
                }
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-input text-sm font-medium"
              >
                <Plus className="h-4 w-4" /> {f.prepays.length ? "Добавить ещё" : "Добавить"}
              </button>
            </div>
          )}
        </Card>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onCalculate}
            className="min-h-13 w-full rounded-lg bg-primary py-4 text-sm font-bold tracking-[0.15em] text-primary-foreground shadow-soft transition active:scale-[0.99]"
          >
            РАССЧИТАТЬ
          </button>
          <button
            type="button"
            onClick={onReset}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-muted-foreground"
          >
            <RotateCcw className="h-4 w-4" /> Очистить
          </button>
        </div>

        <div ref={resultsRef} className="scroll-mt-4 space-y-4">
          {!shown || !calc ? (
            <EmptyState pending={shown && !calc} />
          ) : (
            <Results calc={calc} onShare={share} onSave={save} saving={saving} />
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- results ---------- */

function Results({
  calc,
  onShare,
  onSave,
  saving,
}: {
  calc: {
    S: number;
    res: ReturnType<typeof buildSchedule>;
    baseline: ReturnType<typeof buildSchedule> | null;
    paymentChanges: number[];
  };
  onShare: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { S, res, baseline, paymentChanges } = calc;
  const savedInterest = baseline ? baseline.totalInterest - res.totalInterest : 0;
  const savedMonths = baseline ? baseline.rows.length - res.rows.length : 0;
  const lastPayment = res.rows.at(-1)?.payment ?? 0;
  const changedPayment = baseline && paymentChanges.length > 0;
  const firstNewPayment = paymentChanges[0];
  const lastNewPayment = paymentChanges.length > 1 ? paymentChanges[paymentChanges.length - 1] : undefined;

  return (
    <div className="fade-in-up space-y-4">
      <section className="rounded-xl bg-navy-soft p-5 text-navy-foreground shadow-soft">
        <div className="text-xs uppercase tracking-widest opacity-70">Ежемесячный платёж</div>
        <div className="mt-1 text-3xl font-extrabold text-brand">{fmtMoney(res.monthlyPayment)} ₽</div>
        {changedPayment && (
          <div className="mt-1 text-xs opacity-75">После досрочных погашений платёж уменьшается — см. график</div>
        )}
        {Math.abs(lastPayment - res.monthlyPayment) > 0.01 && !changedPayment && (
          <div className="mt-1 text-xs opacity-75">Последний платёж: {fmtMoney(lastPayment)} ₽</div>
        )}
      </section>

      <Card title="Результат">
        <dl className="space-y-3 text-sm">
          <Row label="Сумма кредита" value={`${fmtMoney(S)} ₽`} />
          <Row label="Проценты по кредиту" value={`${fmtMoney(res.totalInterest)} ₽`} />
          <Row
            label={
              <span className="inline-flex items-center gap-1">
                Переплата
                <Popover>
                  <PopoverTrigger aria-label="Что такое переплата" className="inline-flex h-6 w-6 items-center justify-center">
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </PopoverTrigger>
                  <PopoverContent className="w-60 text-xs">Переплата = проценты / сумма кредита</PopoverContent>
                </Popover>
              </span>
            }
            value={`${fmtPct(res.overpaymentPct)} %`}
          />
          <Row label="Кредит + проценты" value={`${fmtMoney(res.totalPaid)} ₽`} strong />
          <Row label="Последний платёж" value={formatMonthLong(res.lastMonthKey)} />
        </dl>
        <div className="border-t pt-4">
          <Donut principal={S} interest={res.totalInterest} />
        </div>
      </Card>

      {baseline && (
        <Card title="Эффект досрочных погашений">
          <dl className="space-y-3 text-sm">
            <Row label="Экономия на процентах" value={`${fmtMoney(savedInterest)} ₽`} strong />
            <Row label="Новый срок кредита" value={formatTermRu(res.rows.length)} />
            {savedMonths > 0 && <Row label="Сокращение срока" value={`на ${formatTermRu(savedMonths)}`} />}
            <Row label="Сумма досрочных погашений" value={`${fmtMoney(res.totalPrepaid)} ₽`} />
            <Row label="Новая дата последнего платежа" value={formatMonthLong(res.lastMonthKey)} />
            {changedPayment && lastNewPayment === undefined && (
              <Row label="Новый ежемесячный платёж" value={`${fmtMoney(firstNewPayment!)} ₽`} strong />
            )}
            {lastNewPayment !== undefined && (
              <>
                <Row label="Новый платёж (первый)" value={`${fmtMoney(firstNewPayment!)} ₽`} />
                <Row label="Новый платёж (последний)" value={`${fmtMoney(lastNewPayment)} ₽`} strong />
              </>
            )}
          </dl>
        </Card>
      )}

      <Card title="График погашения">
        <RepaymentBars rows={res.rows} />
        <Legend />
      </Card>

      <ScheduleCard rows={res.rows} />

      <div className="grid gap-2 pb-2">
        <button
          type="button"
          onClick={onShare}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-primary bg-card text-sm font-semibold"
        >
          <Share2 className="h-4 w-4" /> Поделиться расчётом
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-busy={saving}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-soft disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Сохраняем…" : "Сохранить расчёт"}
        </button>
      </div>
    </div>
  );
}

function ScheduleCard({ rows }: { rows: ScheduleRow[] }) {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [all, setAll] = useState(false);
  const [byYear, setByYear] = useState(false);
  // Recalculation collapses the "show all" expansion; the open state itself is kept.
  useEffect(() => setAll(false), [rows]);
  // Keep content mounted briefly after closing so the height animation can play.
  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const t = setTimeout(() => setRendered(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  const hasExtra = rows.some((r) => r.extra > 0);
  const years = useMemo(() => {
    const m = new Map<number, ScheduleRow[]>();
    rows.forEach((r) => {
      const y = keyYear(r.monthKey);
      m.set(y, [...(m.get(y) ?? []), r]);
    });
    return [...m.entries()];
  }, [rows]);

  return (
    <section className="overflow-hidden rounded-xl bg-card text-card-foreground shadow-soft">
      <Collapsible
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setAll(false); // after collapsing, the next opening shows the first 12 rows again
        }}
      >
        <CollapsibleTrigger className="flex min-h-16 w-full items-center justify-between gap-3 px-5 py-3 text-left">
          <span className="min-w-0">
            <span className="block text-base font-bold">График платежей</span>
            <span className="block truncate text-xs text-muted-foreground">
              {formatPayments(rows.length)} · до {formatMonthShort(rows[rows.length - 1]!.monthKey)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-chart-principal">
            <span className="text-sm font-semibold">{open ? "Скрыть" : "Показать"}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent
          forceMount
          className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        >
          {rendered && (
            <div className="min-h-0 overflow-hidden">
              <div className="space-y-3 px-5 pb-5">
                <div className="flex justify-end">
                  <Segmented
                    small
                    value={byYear ? "y" : "m"}
                    onChange={(v) => setByYear(v === "y")}
                    options={[["m", "Списком"], ["y", "По годам"]]}
                  />
                </div>
                {byYear ? (
                  <Accordion type="multiple" className="-mx-1">
                    {years.map(([y, rs]) => {
                      const sum = (k: "payment" | "principal" | "interest" | "extra") => rs.reduce((s, r) => s + r[k], 0);
                      return (
                        <AccordionItem key={y} value={String(y)}>
                          <AccordionTrigger className="min-h-11 px-1 text-sm">
                            <span className="flex flex-1 justify-between pr-2">
                              <span className="font-semibold">{y}</span>
                              <span className="text-muted-foreground">{fmtMoney(sum("payment") + sum("extra"))} ₽</span>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <Table rows={rs} hasExtra={hasExtra} />
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                ) : (
                  <>
                    <Table rows={all ? rows : rows.slice(0, 12)} hasExtra={hasExtra} tall={all} />
                    {rows.length > 12 && (
                      <button
                        type="button"
                        onClick={() => setAll(!all)}
                        className="min-h-11 w-full rounded-md bg-muted text-sm font-semibold"
                      >
                        {all ? "Свернуть" : `Показать все (${rows.length})`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function Table({ rows, hasExtra, tall }: { rows: ScheduleRow[]; hasExtra: boolean; tall?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(false);
  // Right-edge gradient is a scroll hint: visible while the table overflows and is not scrolled to the end.
  const update = () => {
    const el = scroller.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth > 4;
    setHint(overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [rows]);

  return (
    <div className="relative -mx-5">
      <div ref={scroller} onScroll={update} className={`overflow-auto ${tall ? "max-h-[70vh]" : ""}`}>
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-right text-xs tabular-nums">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-muted-foreground">
              {["№", "Месяц", "Платёж", "Основной долг", "Проценты", ...(hasExtra ? ["Досрочно"] : []), "Остаток"].map((h, i) => (
                <th key={h} className={`border-b px-2 py-2 font-medium ${i < 2 ? "text-left" : ""} ${i === 0 ? "pl-5" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index} className="even:bg-muted" style={r.extra ? { background: "var(--accent)" } : undefined}>
                <td className="py-2 pl-5 pr-2 text-left align-top text-muted-foreground">{r.index}</td>
                <td className="whitespace-nowrap px-2 py-2 text-left align-top">
                  {formatMonthShort(r.monthKey)}
                  {r.extra > 0 && (
                    <div className="whitespace-nowrap text-[10px] font-semibold text-accent-foreground">
                      + досрочно {fmtMoney(r.extra)} ₽
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 font-semibold align-top">{fmtMoney(r.payment)}</td>
                <td className="whitespace-nowrap px-2 py-2 align-top">{fmtMoney(r.principal)}</td>
                <td className="whitespace-nowrap px-2 py-2 align-top">{fmtMoney(r.interest)}</td>
                {hasExtra && <td className="whitespace-nowrap px-2 py-2 align-top">{r.extra ? fmtMoney(r.extra) : "—"}</td>}
                <td className="whitespace-nowrap py-2 pl-2 pr-5 align-top">{fmtMoney(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hint && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-card via-card/60 to-transparent" />
      )}
    </div>
  );
}

function EmptyState({ pending }: { pending: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-input bg-card p-5">
      {pending ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Заполните параметры и нажмите «Рассчитать» — здесь появятся платёж, переплата и график.
        </p>
      )}
    </div>
  );
}

/* ---------- small UI ---------- */

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl bg-card p-5 text-card-foreground shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  error,
  hint,
  warn,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  warn?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-muted-foreground">{label}</label>
        {hint && <span className="text-sm font-semibold">{hint}</span>}
      </div>
      {children}
      {error && <p className="fade-in-up mt-1 text-xs text-destructive">{error}</p>}
      {!error && warn && <p className="fade-in-up mt-1 text-xs text-warning">{warn}</p>}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  suffix,
  invalid,
  integer,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  invalid?: boolean;
  integer?: boolean;
  onBlur?: () => void;
}) {
  const display = integer ? groupDigits(value) : value.replace(".", ",");
  return (
    <div
      className={`flex min-h-12 flex-1 items-center rounded-md border bg-background px-4 transition-colors focus-within:border-ring ${
        invalid ? "border-destructive" : "border-input"
      }`}
    >
      <input
        inputMode={integer ? "numeric" : "decimal"}
        value={display}
        onChange={(e) => {
          const raw = e.target.value.replace(/[\s\u00a0\u202f]/g, "");
          const cleaned = integer ? raw.replace(/\D/g, "") : raw.replace(/[^\d.,]/g, "").replace(",", ".");
          onChange(cleaned);
        }}
        onBlur={onBlur}
        className="w-full min-w-0 bg-transparent text-base font-semibold outline-none"
      />
      {suffix && <span className="ml-2 text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  small,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  small?: boolean;
}) {
  return (
    <div className={`flex shrink-0 rounded-md bg-muted p-1 ${small ? "text-xs" : "text-sm"}`}>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-sm px-3 font-semibold transition-colors duration-200 ${small ? "min-h-9" : "min-h-10 min-w-11"} ${
            value === v ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

function MonthPicker({
  value,
  onChange,
  emptyLabel,
}: {
  value: number | null;
  onChange: (k: number) => void;
  /** Helper shown under the pickers while the value is empty, e.g. "Пусто — до конца срока кредита". */
  emptyLabel?: string;
}) {
  const nowY = new Date().getFullYear();
  const years = Array.from({ length: 81 }, (_, i) => nowY - 10 + i);
  const hasValue = value != null && Number.isFinite(value);
  const y = hasValue ? keyYear(value) : NaN;
  const m = hasValue ? keyMonth(value) : NaN;
  return (
    <div>
      <div className="flex gap-2">
        <select
          aria-label="Месяц"
          className={`${selectBase} min-w-0 flex-1`}
          value={Number.isFinite(m) ? m : ""}
          onChange={(e) => {
            if (e.target.value === "") return;
            onChange((Number.isFinite(y) ? y : nowY) * 12 + Number(e.target.value));
          }}
        >
          {!hasValue && <option value="">Месяц</option>}
          {MONTH_NAMES.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <select
          aria-label="Год"
          className={`${selectBase} w-28 shrink-0`}
          value={Number.isFinite(y) ? y : ""}
          onChange={(e) => {
            if (e.target.value === "") return;
            onChange(Number(e.target.value) * 12 + (Number.isFinite(m) ? m : 0));
          }}
        >
          {!hasValue && <option value="">Год</option>}
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
      </div>
      {!hasValue && emptyLabel && <p className="mt-1 text-xs text-muted-foreground">{emptyLabel}</p>}
    </div>
  );
}

const FREQ_OPTIONS: [Frequency, string][] = [
  ["monthly", "Ежемесячно"],
  ["bimonthly", "Раз в 2 месяца"],
  ["quarterly", "Ежеквартально"],
  ["semiannual", "Раз в полгода"],
  ["yearly", "Раз в год"],
];

const selectBase =
  "min-h-12 rounded-md border border-input bg-background px-3 text-base font-semibold outline-none focus:border-ring";
const selectCls = `${selectBase} w-full`;

function PrepayCard({
  p,
  index,
  error,
  closesLoan,
  showErrors,
  onChange,
  onRemove,
}: {
  p: EarlyPayment;
  index: number;
  error?: string | undefined;
  closesLoan: boolean;
  showErrors: boolean;
  onChange: (p: EarlyPayment) => void;
  onRemove: () => void;
}) {
  const labelCls = "mb-1.5 text-sm font-medium text-muted-foreground";
  return (
    <div className={`fade-in-up space-y-3 rounded-lg border bg-background p-3 ${error ? "border-destructive" : "border-input"}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Погашение {index + 1}</span>
        <button
          type="button"
          aria-label="Удалить"
          onClick={onRemove}
          className="flex h-9 w-9 items-center justify-center rounded-md text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <Segmented
        value={p.kind}
        onChange={(k) =>
          onChange(
            k === "once"
              ? { id: p.id, kind: "once", startDate: p.startDate, amount: p.amount, effect: p.effect }
              : {
                  id: p.id,
                  kind: "recurring",
                  startDate: p.startDate,
                  frequency: p.frequency ?? "monthly",
                  amount: p.amount,
                  effect: p.effect,
                },
          )
        }
        options={[["once", "Единоразово"], ["recurring", "Периодически"]]}
      />

      {p.kind === "once" ? (
        <div>
          <div className={labelCls}>Дата погашения</div>
          <MonthPicker value={ymToKey(p.startDate)} onChange={(k) => onChange({ ...p, startDate: keyToYm(k) })} />
          {closesLoan && <p className="mt-1 text-xs text-warning">Кредит будет погашен полностью</p>}
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="prepay-frequency" className={labelCls}>
              Частота
            </label>
            <select
              id="prepay-frequency"
              className={selectCls}
              value={p.frequency ?? "monthly"}
              onChange={(e) => onChange({ ...p, frequency: e.target.value as Frequency })}
            >
              {FREQ_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={labelCls}>Начиная с</div>
            <MonthPicker value={ymToKey(p.startDate)} onChange={(k) => onChange({ ...p, startDate: keyToYm(k) })} />
          </div>
          <div>
            <div className={labelCls}>Заканчивая</div>
            <MonthPicker
              value={p.endDate ? ymToKey(p.endDate) : null}
              onChange={(k) => onChange({ ...p, endDate: keyToYm(k) })}
              emptyLabel="Пусто — до конца срока кредита"
            />
          </div>
        </>
      )}

      <div>
        <div className={labelCls}>{p.kind === "recurring" ? "Сумма каждого погашения" : "Сумма"}</div>
        <NumInput
          value={p.amount ? String(p.amount) : ""}
          onChange={(v) => onChange({ ...p, amount: parseNum(v) || 0 })}
          suffix="₽"
          integer
          invalid={showErrors && !(p.amount > 0)}
        />
      </div>

      <div>
        <div className={labelCls}>Результат погашения</div>
        <Segmented
          value={p.effect}
          onChange={(t) => onChange({ ...p, effect: t })}
          options={[["reduceTerm", "Уменьшить срок"], ["reducePayment", "Уменьшить платёж"]]}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Row({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${strong ? "font-bold" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex justify-center gap-5 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-chart-principal" /> Основной долг
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-chart-interest" /> Проценты
      </span>
    </div>
  );
}


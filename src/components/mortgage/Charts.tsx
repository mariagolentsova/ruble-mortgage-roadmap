import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtInt, fmtMoney, fmtPct, formatMonthShort, keyYear, type ScheduleRow } from "@/lib/mortgage";

const PRINCIPAL = "var(--chart-principal)";
const INTEREST = "var(--chart-interest)";

export function Donut({ principal, interest }: { principal: number; interest: number }) {
  const total = principal + interest || 1;
  const data = [
    { name: "Основной долг", value: principal, color: PRINCIPAL },
    { name: "Проценты", value: interest, color: INTEREST },
  ];
  return (
    <div className="flex items-center gap-4">
      <div className="h-32 w-32 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={38} outerRadius={60} stroke="none" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 space-y-3 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-start gap-2">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
            <span>
              <span className="block text-muted-foreground">{d.name}</span>
              <span className="font-semibold">{fmtPct((d.value / total) * 100)} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RepaymentBars({ rows }: { rows: ScheduleRow[] }) {
  const byYear = rows.length > 60;
  let data: { label: string; principal: number; interest: number }[];
  if (byYear) {
    const m = new Map<number, { label: string; principal: number; interest: number }>();
    for (const r of rows) {
      const y = keyYear(r.monthKey);
      const e = m.get(y) ?? { label: String(y), principal: 0, interest: 0 };
      e.principal += r.principal + r.extra;
      e.interest += r.interest;
      m.set(y, e);
    }
    data = [...m.values()];
  } else {
    data = rows.map((r) => ({ label: formatMonthShort(r.monthKey), principal: r.principal + r.extra, interest: r.interest }));
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={12} />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
            formatter={(v: number, n: string) => [`${fmtMoney(v)} ₽`, n === "principal" ? "Основной долг" : "Проценты"]}
          />
          <Bar dataKey="principal" stackId="a" fill={PRINCIPAL} isAnimationActive={false} />
          <Bar dataKey="interest" stackId="a" fill={INTEREST} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        {byYear ? "Суммы за год" : "Помесячно"} · всего {fmtInt(rows.length)} платежей
      </p>
    </div>
  );
}

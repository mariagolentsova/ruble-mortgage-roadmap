// Generates n8n/data-cleanup.workflow.json: once a day deletes personal data older than 3 years
// (privacy policy, section 7.2):
//   • bot_users — people who have not written to the bot for more than 3 years
//     (`updatedAt` changes on every message or button press);
//   • news_subscribers — the mailing subscription of every user deleted from bot_users;
//   • mortgage_calculations — saved calculations not updated for more than 3 years;
//   • broadcasts — broadcast reports older than 3 years (they may list Telegram IDs).
// Run:  node n8n/build-cleanup.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

export const RETENTION_YEARS = 3;
const CUTOFF = `={{ $now.minus({ years: ${RETENTION_YEARS} }).toISO() }}`;

const deleteOlderThanCutoff = (id, name, table, position) => ({
  id,
  name,
  type: "n8n-nodes-base.dataTable",
  typeVersion: 1.1,
  position,
  parameters: {
    resource: "row",
    operation: "deleteRows",
    dataTableId: { __rl: true, mode: "name", value: table },
    matchType: "allConditions",
    filters: { conditions: [{ keyName: "updatedAt", condition: "lt", keyValue: CUTOFF }] },
    options: {},
  },
  // The table may not exist yet (nobody has used the bot / saved a calculation): end quietly.
  onError: "continueRegularOutput",
});

const nodes = [
  {
    id: "5d7e9b1a-3c2f-4e6a-8b90-7f1e2d3c0001",
    name: "Каждый день в 03:00",
    type: "n8n-nodes-base.scheduleTrigger",
    typeVersion: 1.2,
    position: [0, 0],
    parameters: { rule: { interval: [{ field: "days", daysInterval: 1, triggerAtHour: 3, triggerAtMinute: 0 }] } },
  },
  deleteOlderThanCutoff(
    "5d7e9b1a-3c2f-4e6a-8b90-7f1e2d3c0002",
    "Пользователи: удалить неактивных больше 3 лет",
    "bot_users",
    [260, -100],
  ),
  {
    id: "5d7e9b1a-3c2f-4e6a-8b90-7f1e2d3c0004",
    name: "Кого удалили",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [520, -100],
    parameters: {
      jsCode:
        "// Deleted rows come out of the previous node; an error item has no telegram_id.\n" +
        "return $input.all().filter((i) => i.json.telegram_id).map((i) => ({ json: { telegram_id: String(i.json.telegram_id) } }));",
    },
  },
  {
    id: "5d7e9b1a-3c2f-4e6a-8b90-7f1e2d3c0005",
    name: "Подписка: удалить вместе с пользователем",
    type: "n8n-nodes-base.dataTable",
    typeVersion: 1.1,
    position: [780, -100],
    parameters: {
      resource: "row",
      operation: "deleteRows",
      dataTableId: { __rl: true, mode: "name", value: "news_subscribers" },
      matchType: "allConditions",
      filters: { conditions: [{ keyName: "telegram_id", condition: "eq", keyValue: "={{ $json.telegram_id }}" }] },
      options: {},
    },
    onError: "continueRegularOutput",
  },
  deleteOlderThanCutoff(
    "5d7e9b1a-3c2f-4e6a-8b90-7f1e2d3c0006",
    "Рассылки: удалить отчёты старше 3 лет",
    "broadcasts",
    [260, 300],
  ),
  deleteOlderThanCutoff(
    "5d7e9b1a-3c2f-4e6a-8b90-7f1e2d3c0003",
    "Расчёты: удалить старше 3 лет",
    "mortgage_calculations",
    [260, 100],
  ),
];

const workflow = {
  name: "Совесть — удаление данных старше 3 лет",
  nodes,
  connections: {
    "Каждый день в 03:00": {
      main: [
        [
          { node: "Пользователи: удалить неактивных больше 3 лет", type: "main", index: 0 },
          { node: "Расчёты: удалить старше 3 лет", type: "main", index: 0 },
          { node: "Рассылки: удалить отчёты старше 3 лет", type: "main", index: 0 },
        ],
      ],
    },
    "Пользователи: удалить неактивных больше 3 лет": { main: [[{ node: "Кого удалили", type: "main", index: 0 }]] },
    "Кого удалили": { main: [[{ node: "Подписка: удалить вместе с пользователем", type: "main", index: 0 }]] },
  },
  // Successful runs are not kept in the execution history: it would hold a copy of the deleted rows.
  settings: { executionOrder: "v1", timezone: "Europe/Moscow", saveDataSuccessExecution: "none", saveDataErrorExecution: "all" },
  pinData: {},
};

writeFileSync(join(dir, "data-cleanup.workflow.json"), JSON.stringify(workflow, null, 2) + "\n");
console.log(`n8n/data-cleanup.workflow.json: ${nodes.length} nodes`);

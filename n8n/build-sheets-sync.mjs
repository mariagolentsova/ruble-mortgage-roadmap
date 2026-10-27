// Generates n8n/users-sheet-sync.workflow.json: once a day copies the bot's users (Data Table
// bot_users, plus the last saved calculation from mortgage_calculations) into a Google Sheet.
// Run after editing n8n/code/users-to-sheet.js:  node n8n/build-sheets-sync.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const code = (name) => readFileSync(join(dir, "code", name), "utf8");

export const SHEET_TAB = "Пользователи";

const node = (id, name, type, typeVersion, position, parameters, extra = {}) => ({
  id,
  name,
  type,
  typeVersion,
  position,
  parameters,
  ...extra,
});

const readAll = (table) => ({
  resource: "row",
  operation: "get",
  dataTableId: { __rl: true, mode: "name", value: table },
  matchType: "anyCondition",
  filters: {},
  returnAll: true,
});

const nodes = [
  node(
    "8a1c3e5f-2b4d-4c6e-9f80-1a2b3c4d0001",
    "Каждый день в 07:00",
    "n8n-nodes-base.scheduleTrigger",
    1.2,
    [0, 0],
    { rule: { interval: [{ field: "days", daysInterval: 1, triggerAtHour: 7, triggerAtMinute: 0 }] } },
  ),
  node(
    "8a1c3e5f-2b4d-4c6e-9f80-1a2b3c4d0002",
    "Пользователи бота",
    "n8n-nodes-base.dataTable",
    1.1,
    [240, 0],
    readAll("bot_users"),
    // No users yet → the table may not exist; the run then ends quietly.
    { onError: "continueRegularOutput", alwaysOutputData: true },
  ),
  node(
    "8a1c3e5f-2b4d-4c6e-9f80-1a2b3c4d0003",
    "Сохранённые расчёты",
    "n8n-nodes-base.dataTable",
    1.1,
    [480, 0],
    readAll("mortgage_calculations"),
    // executeOnce: read the table once, not once per user coming in.
    { executeOnce: true, onError: "continueRegularOutput", alwaysOutputData: true },
  ),
  node("8a1c3e5f-2b4d-4c6e-9f80-1a2b3c4d0004", "Собрать строки для таблицы", "n8n-nodes-base.code", 2, [720, 0], {
    jsCode: code("users-to-sheet.js"),
  }),
  node(
    "8a1c3e5f-2b4d-4c6e-9f80-1a2b3c4d0005",
    "Google Таблица: добавить или обновить",
    "n8n-nodes-base.googleSheets",
    4.7,
    [960, 0],
    {
      authentication: "serviceAccount",
      resource: "sheet",
      operation: "appendOrUpdate",
      // Paste the spreadsheet's address here after import (or pick it from the list).
      documentId: { __rl: true, mode: "url", value: "" },
      sheetName: { __rl: true, mode: "name", value: SHEET_TAB },
      columns: {
        mappingMode: "autoMapInputData",
        value: {},
        matchingColumns: ["Telegram ID"],
        schema: [],
      },
      // Missing headers are created automatically, so an empty sheet works too.
      options: { handlingExtraData: "insertInNewColumn", cellFormat: "USER_ENTERED" },
    },
    { credentials: { googleApi: { id: "", name: "Google — сервисный аккаунт" } } },
  ),
];

const main = (target) => ({ main: [[{ node: target, type: "main", index: 0 }]] });

const workflow = {
  name: "Совесть — пользователи бота в Google Таблицу",
  nodes,
  connections: {
    "Каждый день в 07:00": main("Пользователи бота"),
    "Пользователи бота": main("Сохранённые расчёты"),
    "Сохранённые расчёты": main("Собрать строки для таблицы"),
    "Собрать строки для таблицы": main("Google Таблица: добавить или обновить"),
  },
  settings: { executionOrder: "v1", timezone: "Europe/Moscow", saveDataSuccessExecution: "all", saveDataErrorExecution: "all" },
  pinData: {},
};

writeFileSync(join(dir, "users-sheet-sync.workflow.json"), JSON.stringify(workflow, null, 2) + "\n");
console.log(`n8n/users-sheet-sync.workflow.json: ${nodes.length} nodes`);

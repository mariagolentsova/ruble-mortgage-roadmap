// Generates n8n/mortgage-bot.workflow.json from the Code-node sources in n8n/code/.
// Run after editing any of them:  node n8n/build-workflow.mjs
// Then import the JSON in n8n (Workflows → Import from file) or update the existing workflow.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const code = (name) => readFileSync(join(dir, "code", name), "utf8");

export const TABLE_NAME = "mortgage_calculations";

export const TABLE_COLUMNS = [
  ["telegram_id", "string"],
  ["username", "string"],
  ["first_name", "string"],
  ["last_name", "string"],
  ["price", "number"],
  ["down_payment", "number"],
  ["loan_amount", "number"],
  ["term_months", "number"],
  ["rate", "number"],
  ["start_month", "string"],
  ["prepayments", "string"],
  ["monthly_payment", "number"],
  ["total_interest", "number"],
  ["overpayment_pct", "number"],
  ["total_paid", "number"],
  ["actual_term_months", "number"],
  ["last_payment_month", "string"],
  ["prepaid_total", "number"],
  ["saved_interest", "number"],
  ["saved_at", "date"],
];

// Fixed IDs keep re-imports stable (n8n matches nodes and the webhook by them).
const node = (id, name, type, typeVersion, position, parameters, extra = {}) => ({
  id,
  name,
  type,
  typeVersion,
  position,
  parameters,
  ...extra,
});

const nodes = [
  // ---------- Bot ----------
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0001",
    "Telegram: новые сообщения",
    "n8n-nodes-base.telegramTrigger",
    1.2,
    [0, 0],
    { updates: ["message", "callback_query"], additionalFields: {} },
    {
      webhookId: "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7dff01",
      credentials: { telegramApi: { id: "", name: "Telegram — бот Совесть" } },
    },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0002", "Разобрать апдейт", "n8n-nodes-base.code", 2, [240, 0], {
    jsCode: code("parse-update.js"),
  }),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0003", "Нужна проверка калькулятора?", "n8n-nodes-base.if", 2.2, [480, 0], {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [
        {
          id: "c1",
          leftValue: "={{ $json.needsCheck }}",
          rightValue: "",
          operator: { type: "boolean", operation: "true", singleValue: true },
        },
      ],
      combinator: "and",
    },
    options: {},
  }),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0004",
    "Проверить, открывается ли калькулятор",
    "n8n-nodes-base.httpRequest",
    4.2,
    [720, -100],
    {
      url: "={{ $env.CALCULATOR_URL }}",
      options: {
        timeout: 5000,
        response: { response: { fullResponse: true, neverError: true, responseFormat: "text" } },
      },
    },
    { onError: "continueRegularOutput", alwaysOutputData: true },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0005", "Собрать ответ", "n8n-nodes-base.code", 2, [960, 0], {
    jsCode: code("build-replies.js"),
  }),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0006",
    "Отправить в Telegram",
    "n8n-nodes-base.httpRequest",
    4.2,
    [1200, 0],
    {
      method: "POST",
      url: "={{ ($env.TELEGRAM_API_URL || 'https://api.telegram.org') + '/bot' + $env.TELEGRAM_BOT_TOKEN + '/' + $json.method }}",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.payload) }}",
      options: {
        // One request at a time with a pause, so messages arrive in the intended order.
        batching: { batch: { batchSize: 1, batchInterval: 400 } },
        timeout: 10000,
      },
    },
    { onError: "continueRegularOutput" },
  ),

  // ---------- Save calculation ----------
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0101",
    "Калькулятор: сохранить расчёт",
    "n8n-nodes-base.webhook",
    2.1,
    [0, 400],
    { httpMethod: "POST", path: "save-calculation", responseMode: "responseNode", options: {} },
    { webhookId: "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7dff02" },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0102", "Проверить подпись Telegram", "n8n-nodes-base.code", 2, [240, 400], {
    jsCode: code("verify-and-prepare.js"),
  }),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0103", "Подпись верна?", "n8n-nodes-base.if", 2.2, [480, 400], {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [
        {
          id: "c2",
          leftValue: "={{ $json.valid }}",
          rightValue: "",
          operator: { type: "boolean", operation: "true", singleValue: true },
        },
      ],
      combinator: "and",
    },
    options: {},
  }),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0104",
    "Таблица: создать, если нет",
    "n8n-nodes-base.dataTable",
    1.1,
    [720, 300],
    {
      resource: "table",
      operation: "create",
      tableName: TABLE_NAME,
      columns: { column: TABLE_COLUMNS.map(([name, type]) => ({ name, type })) },
      options: { createIfNotExists: true },
    },
    { onError: "continueErrorOutput" },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0105", "Взять запись", "n8n-nodes-base.code", 2, [960, 300], {
    jsCode: "return [{ json: $('Проверить подпись Telegram').first().json.row }];",
  }),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0106",
    "Таблица: создать или обновить запись",
    "n8n-nodes-base.dataTable",
    1.1,
    [1200, 300],
    {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "name", value: TABLE_NAME },
      matchType: "allConditions",
      filters: { conditions: [{ keyName: "telegram_id", condition: "eq", keyValue: "={{ $json.telegram_id }}" }] },
      columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] },
      options: {},
    },
    { onError: "continueErrorOutput" },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0107", "Ответ: сохранено", "n8n-nodes-base.respondToWebhook", 1.4, [1440, 280], {
    respondWith: "json",
    responseBody:
      "={{ JSON.stringify({ ok: true, created: new Date($json.createdAt).getTime() === new Date($json.updatedAt).getTime() }) }}",
    options: { responseCode: 200 },
  }),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0108", "Ответ: отказ", "n8n-nodes-base.respondToWebhook", 1.4, [720, 520], {
    respondWith: "json",
    responseBody: "={{ JSON.stringify({ ok: false, error: $json.error }) }}",
    options: { responseCode: "={{ $json.status }}" },
  }),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0109", "Ответ: ошибка таблицы", "n8n-nodes-base.respondToWebhook", 1.4, [1440, 480], {
    respondWith: "json",
    responseBody: '={{ JSON.stringify({ ok: false, error: "storage_failed" }) }}',
    options: { responseCode: 500 },
  }),
];

const main = (...targets) => ({ main: targets.map((t) => (t ? [{ node: t, type: "main", index: 0 }] : [])) });

const connections = {
  "Telegram: новые сообщения": main("Разобрать апдейт"),
  "Разобрать апдейт": main("Нужна проверка калькулятора?"),
  "Нужна проверка калькулятора?": main("Проверить, открывается ли калькулятор", "Собрать ответ"),
  "Проверить, открывается ли калькулятор": main("Собрать ответ"),
  "Собрать ответ": main("Отправить в Telegram"),

  "Калькулятор: сохранить расчёт": main("Проверить подпись Telegram"),
  "Проверить подпись Telegram": main("Подпись верна?"),
  "Подпись верна?": main("Таблица: создать, если нет", "Ответ: отказ"),
  "Таблица: создать, если нет": main("Взять запись", "Ответ: ошибка таблицы"),
  "Взять запись": main("Таблица: создать или обновить запись"),
  "Таблица: создать или обновить запись": main("Ответ: сохранено", "Ответ: ошибка таблицы"),
};

const workflow = {
  name: "Совесть — бот ипотечного калькулятора",
  nodes,
  connections,
  settings: { executionOrder: "v1", saveDataSuccessExecution: "none", saveDataErrorExecution: "all" },
  pinData: {},
};

writeFileSync(join(dir, "mortgage-bot.workflow.json"), JSON.stringify(workflow, null, 2) + "\n");
console.log(`n8n/mortgage-bot.workflow.json: ${nodes.length} nodes`);

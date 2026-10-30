// Generates n8n/mortgage-bot.workflow.json from the Code-node sources in n8n/code/.
// Run after editing any of them:  node n8n/build-workflow.mjs
// Then import the JSON in n8n (Workflows → Import from file) or update the existing workflow.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const code = (name) => readFileSync(join(dir, "code", name), "utf8");

export const TABLE_NAME = "mortgage_calculations";

export const USERS_TABLE_NAME = "bot_users";

// Only what Telegram sends with each update; createdAt / updatedAt (system columns) = first / last visit.
export const USERS_TABLE_COLUMNS = [
  ["telegram_id", "string"],
  ["username", "string"],
  ["profile_link", "string"],
  ["first_name", "string"],
  ["last_name", "string"],
  ["last_action", "string"],
  ["last_seen_at", "date"],
];

// Mailing subscribers: subscribed_at = time of the consent to mailings (button «Получать новости»).
export const NEWS_TABLE_NAME = "news_subscribers";
export const NEWS_TABLE_COLUMNS = [
  ["telegram_id", "string"],
  ["username", "string"],
  ["first_name", "string"],
  ["subscribed", "boolean"],
  ["subscribed_at", "date"],
  ["unsubscribed_at", "date"],
  ["unsubscribe_reason", "string"],
];

// One row per broadcast: protects from sending twice and keeps the delivery report.
export const BROADCASTS_TABLE_NAME = "broadcasts";
export const BROADCASTS_TABLE_COLUMNS = [
  ["source_message_id", "string"],
  ["admin_id", "string"],
  ["started_at", "date"],
  ["recipients", "number"],
  ["delivered", "number"],
  ["blocked", "number"],
  ["failed", "number"],
  ["errors", "string"],
  ["finished_at", "date"],
];

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

const TELEGRAM_URL =
  "={{ ($env.TELEGRAM_API_URL || 'https://api.telegram.org') + '/bot' + $env.TELEGRAM_BOT_TOKEN + '/";

const ifTrue = (id, leftValue, operator) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
    conditions: [{ id, leftValue, rightValue: "", operator }],
    combinator: "and",
  },
  looseTypeValidation: true,
  options: {},
});
const isTrue = { type: "boolean", operation: "true", singleValue: true };

const createTable = (id, name, position, table, columns) =>
  node(
    id,
    name,
    "n8n-nodes-base.dataTable",
    1.1,
    position,
    {
      resource: "table",
      operation: "create",
      tableName: table,
      columns: { column: columns.map(([n, type]) => ({ name: n, type })) },
      options: { createIfNotExists: true },
    },
    { onError: "continueRegularOutput" },
  );

const upsertBy = (id, name, position, table, key, extra = {}) =>
  node(
    id,
    name,
    "n8n-nodes-base.dataTable",
    1.1,
    position,
    {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "name", value: table },
      matchType: "allConditions",
      filters: { conditions: [{ keyName: key, condition: "eq", keyValue: `={{ $json.${key} }}` }] },
      columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] },
      options: {},
    },
    { onError: "continueRegularOutput", ...extra },
  );

const telegramCall = (id, name, position, method, payloadExpr, options = {}, extra = {}) =>
  node(
    id,
    name,
    "n8n-nodes-base.httpRequest",
    4.2,
    position,
    {
      method: "POST",
      url: TELEGRAM_URL + method + "' }}",
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify(${payloadExpr}) }}`,
      options: { timeout: 10000, ...options },
    },
    { onError: "continueRegularOutput", ...extra },
  );

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
  // Sends replies one at a time: the next message goes out only after Telegram confirmed the previous one,
  // so a short message can't overtake a long one.
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0007", "По одному сообщению", "n8n-nodes-base.splitInBatches", 3, [1200, 0], {
    batchSize: 1,
    options: {},
  }),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0005", "Собрать ответ", "n8n-nodes-base.code", 2, [960, 0], {
    jsCode: code("build-replies.js"),
  }),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0006",
    "Отправить в Telegram",
    "n8n-nodes-base.httpRequest",
    4.2,
    [1440, 0],
    {
      method: "POST",
      url: "={{ ($env.TELEGRAM_API_URL || 'https://api.telegram.org') + '/bot' + $env.TELEGRAM_BOT_TOKEN + '/' + $json.method }}",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.payload) }}",
      options: { timeout: 10000 },
    },
    { onError: "continueRegularOutput" },
  ),

  // ---------- Bot users (runs after the reply, never blocks it) ----------
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0201", "Карточка пользователя", "n8n-nodes-base.code", 2, [480, 200], {
    jsCode: code("user-row.js"),
  }),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0202",
    "Пользователи: создать таблицу, если нет",
    "n8n-nodes-base.dataTable",
    1.1,
    [720, 200],
    {
      resource: "table",
      operation: "create",
      tableName: USERS_TABLE_NAME,
      columns: { column: USERS_TABLE_COLUMNS.map(([name, type]) => ({ name, type })) },
      options: { createIfNotExists: true },
    },
    { onError: "continueRegularOutput" },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0203", "Взять карточку", "n8n-nodes-base.code", 2, [960, 200], {
    jsCode: "return $('Карточка пользователя').all();",
  }),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0204",
    "Пользователи: создать или обновить",
    "n8n-nodes-base.dataTable",
    1.1,
    [1200, 200],
    {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "name", value: USERS_TABLE_NAME },
      matchType: "allConditions",
      filters: { conditions: [{ keyName: "telegram_id", condition: "eq", keyValue: "={{ $json.telegram_id }}" }] },
      columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] },
      options: {},
    },
    { onError: "continueRegularOutput" },
  ),

  // ---------- News subscription (button «Получать новости», «Отписаться», /news, /stopnews) ----------
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0301", "Подписка на новости?", "n8n-nodes-base.if", 2.2, [480, 1000], ifTrue(
    "c3",
    "={{ ['news_on', 'news_off'].includes($json.action) }}",
    isTrue,
  )),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0302", "Подписка: строка", "n8n-nodes-base.code", 2, [720, 1000], {
    jsCode: code("news-row.js"),
  }),
  createTable("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0303", "Подписчики: создать таблицу, если нет", [960, 1000], NEWS_TABLE_NAME, NEWS_TABLE_COLUMNS),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0304", "Взять строку подписки", "n8n-nodes-base.code", 2, [1200, 1000], {
    jsCode: "return $('Подписка: строка').all();",
  }),
  upsertBy("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0305", "Подписчики: создать или обновить", [1440, 1000], NEWS_TABLE_NAME, "telegram_id"),

  // ---------- Broadcast (administrator pressed «Отправить подписчикам») ----------
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0401", "Отправить рассылку?", "n8n-nodes-base.if", 2.2, [480, 1300], ifTrue(
    "c4",
    "={{ $json.action === 'broadcast_send' && $json.isAdmin === true }}",
    isTrue,
  )),
  createTable("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0402", "Рассылки: создать таблицу, если нет", [720, 1300], BROADCASTS_TABLE_NAME, BROADCASTS_TABLE_COLUMNS),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0403",
    "Эту рассылку уже отправляли?",
    "n8n-nodes-base.dataTable",
    1.1,
    [960, 1300],
    {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "name", value: BROADCASTS_TABLE_NAME },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "source_message_id", condition: "eq", keyValue: "={{ String($('Разобрать апдейт').first().json.sourceMessageId) }}" },
        ],
      },
      limit: 1,
    },
    { onError: "continueRegularOutput", alwaysOutputData: true },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0404", "Уже отправлена?", "n8n-nodes-base.if", 2.2, [1200, 1300], ifTrue(
    "c5",
    "={{ !!$json.source_message_id }}",
    isTrue,
  )),
  telegramCall(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0405",
    "Сообщить: уже отправлена",
    [1440, 1200],
    "sendMessage",
    "{ chat_id: $('Разобрать апдейт').first().json.chatId, text: 'Эта рассылка уже отправлена — второй раз она не уйдёт.' }",
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0406", "Запись о рассылке", "n8n-nodes-base.code", 2, [1440, 1400], {
    jsCode: [
      "const p = $('Разобрать апдейт').first().json;",
      "return [{ json: { source_message_id: String(p.sourceMessageId), admin_id: String(p.user.id), started_at: new Date().toISOString() } }];",
    ].join("\n"),
  }),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0407",
    "Рассылки: добавить запись",
    "n8n-nodes-base.dataTable",
    1.1,
    [1680, 1400],
    {
      resource: "row",
      operation: "insert",
      dataTableId: { __rl: true, mode: "name", value: BROADCASTS_TABLE_NAME },
      columns: { mappingMode: "autoMapInputData", value: {}, matchingColumns: [], schema: [] },
      options: {},
    },
  ),
  createTable("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0408", "Подписчики: таблица для рассылки", [1920, 1400], NEWS_TABLE_NAME, NEWS_TABLE_COLUMNS),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0409",
    "Подписчики",
    "n8n-nodes-base.dataTable",
    1.1,
    [2160, 1400],
    {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "name", value: NEWS_TABLE_NAME },
      matchType: "allConditions",
      filters: { conditions: [{ keyName: "subscribed", condition: "isTrue" }] },
      returnAll: true,
    },
    { onError: "continueRegularOutput", alwaysOutputData: true },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0410", "Кому отправить", "n8n-nodes-base.code", 2, [2400, 1400], {
    jsCode: code("broadcast-recipients.js"),
  }),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0411", "Есть подписчики?", "n8n-nodes-base.if", 2.2, [2640, 1400], ifTrue(
    "c6",
    "={{ !$json.none }}",
    isTrue,
  )),
  // About 18 messages a second: Telegram allows a bot up to 30.
  telegramCall(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0412",
    "Разослать",
    [2880, 1300],
    "copyMessage",
    "$json.payload",
    {
      batching: { batch: { batchSize: 20, batchInterval: 1100 } },
      response: { response: { fullResponse: true, neverError: true } },
    },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0413", "Итоги рассылки", "n8n-nodes-base.code", 2, [3120, 1400], {
    jsCode: code("broadcast-report.js"),
  }),
  telegramCall(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0414",
    "Отчёт администратору",
    [3360, 1400],
    "sendMessage",
    "$json.report",
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0415", "Взять итоги", "n8n-nodes-base.code", 2, [3600, 1400], {
    jsCode: "return [{ json: $('Итоги рассылки').first().json.log }];",
  }),
  upsertBy("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0416", "Рассылки: сохранить итоги", [3840, 1400], BROADCASTS_TABLE_NAME, "source_message_id"),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0417", "Заблокировавшие бота", "n8n-nodes-base.code", 2, [4080, 1400], {
    jsCode: [
      "const now = new Date().toISOString();",
      "return $('Итоги рассылки').first().json.blocked.map((id) => ({",
      "  json: { telegram_id: id, subscribed: false, unsubscribed_at: now, unsubscribe_reason: 'blocked' },",
      "}));",
    ].join("\n"),
  }),
  upsertBy("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0418", "Подписчики: отписать заблокировавших", [4320, 1400], NEWS_TABLE_NAME, "telegram_id"),

  // ---------- Save calculation ----------
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0101",
    "Калькулятор: сохранить расчёт",
    "n8n-nodes-base.webhook",
    2.1,
    [0, 480],
    { httpMethod: "POST", path: "save-calculation", responseMode: "responseNode", options: {} },
    { webhookId: "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7dff02" },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0102", "Проверить подпись Telegram", "n8n-nodes-base.code", 2, [240, 480], {
    jsCode: code("verify-and-prepare.js"),
  }),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0103", "Подпись верна?", "n8n-nodes-base.if", 2.2, [480, 480], {
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
    [720, 380],
    {
      resource: "table",
      operation: "create",
      tableName: TABLE_NAME,
      columns: { column: TABLE_COLUMNS.map(([name, type]) => ({ name, type })) },
      options: { createIfNotExists: true },
    },
    { onError: "continueErrorOutput" },
  ),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0105", "Взять запись", "n8n-nodes-base.code", 2, [960, 380], {
    jsCode: "return [{ json: $('Проверить подпись Telegram').first().json.row }];",
  }),
  node(
    "6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0106",
    "Таблица: создать или обновить запись",
    "n8n-nodes-base.dataTable",
    1.1,
    [1200, 380],
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
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0107", "Ответ: сохранено", "n8n-nodes-base.respondToWebhook", 1.4, [1440, 360], {
    respondWith: "json",
    responseBody:
      "={{ JSON.stringify({ ok: true, created: new Date($json.createdAt).getTime() === new Date($json.updatedAt).getTime() }) }}",
    options: { responseCode: 200 },
  }),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0108", "Ответ: отказ", "n8n-nodes-base.respondToWebhook", 1.4, [720, 600], {
    respondWith: "json",
    responseBody: "={{ JSON.stringify({ ok: false, error: $json.error }) }}",
    options: { responseCode: "={{ $json.status }}" },
  }),
  node("6f0b2d1e-1a01-4c55-9a3e-0c2f1b7d0109", "Ответ: ошибка таблицы", "n8n-nodes-base.respondToWebhook", 1.4, [1440, 560], {
    respondWith: "json",
    responseBody: '={{ JSON.stringify({ ok: false, error: "storage_failed" }) }}',
    options: { responseCode: 500 },
  }),
];

const main = (...targets) => ({ main: targets.map((t) => (t ? [{ node: t, type: "main", index: 0 }] : [])) });

const connections = {
  "Telegram: новые сообщения": main("Разобрать апдейт"),
  // One output, two branches: the reply (upper, runs first) and the user card (lower).
  "Разобрать апдейт": {
    main: [
      [
        { node: "Нужна проверка калькулятора?", type: "main", index: 0 },
        { node: "Карточка пользователя", type: "main", index: 0 },
        { node: "Подписка на новости?", type: "main", index: 0 },
        { node: "Отправить рассылку?", type: "main", index: 0 },
      ],
    ],
  },
  "Карточка пользователя": main("Пользователи: создать таблицу, если нет"),
  "Пользователи: создать таблицу, если нет": main("Взять карточку"),
  "Взять карточку": main("Пользователи: создать или обновить"),
  "Нужна проверка калькулятора?": main("Проверить, открывается ли калькулятор", "Собрать ответ"),
  "Проверить, открывается ли калькулятор": main("Собрать ответ"),
  "Собрать ответ": main("По одному сообщению"),
  // Output 0 = done (nothing more to do), output 1 = next message.
  "По одному сообщению": main(null, "Отправить в Telegram"),
  "Отправить в Telegram": main("По одному сообщению"),

  "Подписка на новости?": main("Подписка: строка"),
  "Подписка: строка": main("Подписчики: создать таблицу, если нет"),
  "Подписчики: создать таблицу, если нет": main("Взять строку подписки"),
  "Взять строку подписки": main("Подписчики: создать или обновить"),

  "Отправить рассылку?": main("Рассылки: создать таблицу, если нет"),
  "Рассылки: создать таблицу, если нет": main("Эту рассылку уже отправляли?"),
  "Эту рассылку уже отправляли?": main("Уже отправлена?"),
  "Уже отправлена?": main("Сообщить: уже отправлена", "Запись о рассылке"),
  "Запись о рассылке": main("Рассылки: добавить запись"),
  "Рассылки: добавить запись": main("Подписчики: таблица для рассылки"),
  "Подписчики: таблица для рассылки": main("Подписчики"),
  "Подписчики": main("Кому отправить"),
  "Кому отправить": main("Есть подписчики?"),
  "Есть подписчики?": main("Разослать", "Итоги рассылки"),
  "Разослать": main("Итоги рассылки"),
  "Итоги рассылки": main("Отчёт администратору"),
  "Отчёт администратору": main("Взять итоги"),
  "Взять итоги": main("Рассылки: сохранить итоги"),
  "Рассылки: сохранить итоги": main("Заблокировавшие бота"),
  "Заблокировавшие бота": main("Подписчики: отписать заблокировавших"),

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

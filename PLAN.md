# llm-vibe — план реализации

**Статус:** implemented  
**Версия:** 0.2  
**Дата:** 2026-11-03  
**ТЗ:** [`SPEC.md`](./SPEC.md)

## 0. Принципы

- Только OpenCode V2 API; V1 API не использовать.
- Server-part + TUI-part + RPC; MCP не нужен.
- Состояние — только в памяти TUI. Никакого серверного хранилища, `ctx.storage`, `scan.ts`, чтения истории.
- Один tool `vibe`; `clear` — необязательный флаг в нём.
- Sidebar всегда; `/vibe` — toggle показа в сайдбаре.
- По умолчанию слот сливается с фоном темы; слова внутри; stage-индикаторов нет.
- Токенный overhead — измеряемая величина, а не «потом посмотрим».

## 1. Deliverables

- [x] Scaffold пакета: `package.json`, `tsconfig.json`, `.gitignore`, tsup/vitest/CI.
- [x] `src/rpc.ts`: контракт события `updated`.
- [x] `src/mood.ts`: типы, схема, парсер, палитра.
- [x] `src/prompt.ts`: текст инструкции и описания tool.
- [x] `src/index.ts`: prompt hook, tool `vibe`, RPC-регистрация.
- [x] `src/field.ts`: скалярное поле и анимация.
- [x] `src/render.ts`: half-block и текст внутри квадрата.
- [x] `src/activity.ts`: live-активность сессии и множители темпа.
- [x] `src/morph.ts`: безопасный morph field/palette и снимок для прерванных переходов.
- [x] `src/tui.tsx`: RPC-подписка, in-memory state, sidebar, `/vibe` toggle.
- [x] `src/square.tsx`: компонент квадрата (если вынесен отдельно).
- [x] Тесты на чистые функции и prompt hook.
- [x] Локальная интеграционная проверка в OpenCode.
- [x] Замер токенов.
- [x] `README.md` и обновлённый `AGENTS.md`.
- [x] `npm run check` проходит.

## 2. Phase 0 — Scaffold

### 2.1 Задачи

- [x] Создать `package.json`:
  - `"type": "module"`;
  - `exports`: `"."`, `"./tui"`, `"./rpc"` (types + import);
  - `files`: `dist/`, `README.md` (лицензию добавить отдельно, если выбрана);
  - `scripts`: `build`, `dev`, `typecheck`, `test`, `check`, `prepublishOnly`;
  - dependencies: `@opencode/plugin`;
  - peers: `@opentui/core`, `@opentui/solid`, `solid-js`;
  - devDeps: `@opencode/client`, `@opencode/plugin`, `@opentui/core`, `@opentui/solid`, `solid-js`, `tsup`, `typescript`, `vitest`, `@types/node`.
- [x] Создать `tsconfig.json`:
  - `strict`, `target` ES2022, `module`/`moduleResolution` NodeNext;
  - `jsx: react-jsx`, `jsxImportSource: @opentui/solid`;
  - `declaration`, `skipLibCheck`, `noUncheckedIndexedAccess`;
  - `include`: `src`, `test`.
- [x] Создать `tsup.config.ts`:
  - entries: `src/index.ts`, `src/tui.tsx`, `src/rpc.ts`;
  - format ESM, dts, clean, outDir `dist`;
  - external: `@opencode/plugin`, `@opencode/plugin/rpc`, `@opencode/plugin/tui`, `@opencode/client`, `@opentui/core`, `@opentui/solid`, `solid-js`.
- [x] Создать `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `*.tgz`.
- [x] Создать CI workflow (Node 22, `npm ci`, `npm run check`; publish on `v*` tags — позже).
- CI workflow добавлен; локально эквивалент (`npm ci` + `npm run check`) прошёл, сам GitHub Actions ещё не запускался.
- [x] Создать `README.md` (install/use/token overhead/dev-команды).
- [x] `npm install`.
- [x] Проверить, что пустой `src` собирается/типизируется (после добавления заглушек).

### 2.2 Команды

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run check
npm pack --dry-run
```

`check` = `typecheck && test && build && npm pack --dry-run`.

### 2.3 Definition of Done

- `npm run check` проходит на пустом/минимальном коде.
- `exports` указывают на `dist`, сборка создаёт `dist/index.js`, `dist/tui.js`, `dist/rpc.js` и `.d.ts`.
- Пакет не включает `src`/`test` в `files`.

## 3. Phase 1 — Протокол mood

### 3.1 Задачи

- [x] `src/mood.ts`:
  - типы `Mood`, `VibeInput`, `VIBE_INPUT_SCHEMA` (JSON Schema для tool input);
  - `PRESETS` (`calm/focus/warm/alert/playful/tired`) и `PRESET_NAMES`;
  - `parseVibe(input: unknown): VibeInput`; explicit `colors` важнее `preset`;
  - `normalizeMood`;
  - `parseColor` (`#rgb`, `#rrggbb`), `toHex`, `darken`, `mix`, `buildPalette`;
  - `EMPTY_MOOD` / `DEFAULT_ENERGY`;
  - безопасный whitelist для `glyph`;
  - очистка `words` от control-символов и ограничение длины.
- [x] `src/prompt.ts`:
  - `VIBE_PROMPT` — точный текст из SPEC;
  - `VIBE_TOOL_DESCRIPTION`;
  - `PROMPT_MARKER` для защиты от дублей.
- [x] Тесты `test/mood.test.ts`:
  - set с 1, 2, 4 цветами;
  - 5 цветов → truncate;
  - невалидные цвета → fallback, если есть words/glyph/energy; иначе `undefined`;
  - preset разворачивается в цвета; explicit colors важнее; неизвестный preset игнорируется;
  - `energy` clamp;
  - `words` control/длина;
  - `glyph` whitelist/длина;
  - `clear: true` приоритетнее остальных полей;
  - пустой/невалидный input → `undefined`.
- [x] Тесты `test/prompt.test.ts`:
  - prompt содержит маркер и ключевые правила;
  - tool description содержит `clear: true`.

### 3.2 Definition of Done

- Парсер никогда не бросает исключение на произвольный JSON.
- Нормализованный mood всегда имеет `colors` (>=1) и `energy` (0..1).
- Тесты покрывают clear/set/invalid.

## 4. Phase 2 — Server-part и RPC

### 4.1 Задачи

- [x] `src/rpc.ts`:
  - `MoodSchema` (нормализованный mood события; required `colors`, `energy`; optional `words`, `glyph`);
  - `VibeRpc = Rpc.define({ id: "llm-vibe", methods: {}, events: { updated: ... } })`;
  - событие `updated` с `{ sessionID, mood: Mood | null }`.
- [x] `src/index.ts` (wiring) и `src/tool.ts` (чистый `handleVibe`):
  - `Plugin.define({ id: "llm-vibe", async setup(ctx) { ... } })`;
  - `const registration = await ctx.rpc.register(VibeRpc, {})`;
  - `ctx.tool.transform`:
    - tool name `vibe`;
    - input schema из SPEC;
    - description из `prompt.ts`;
    - execute: parse → emit → `{ content: "ok" }`.
  - `ctx.session.hook("context", ...)`:
    - if `!event.tools.vibe` → return;
    - if system already contains marker → return;
    - push `VIBE_PROMPT`.
- [x] Обработка ошибок:
  - emit падает → залогировать, всё равно вернуть `ok`;
  - невалидный input → `ok` без события.
- [x] Тесты:
  - `test/tool.test.ts` — чистая функция `handleVibe(input, sessionID, emit)`:
    - set → emit с mood;
    - clear → emit с null;
    - invalid → emit не вызван;
    - result `ok`.
  - `test/prompt.test.ts` — `injectVibePrompt(event)`:
    - tool есть → prompt добавлен;
    - tool нет → не добавлен;
    - marker уже есть → дубля нет.

### 4.2 Definition of Done

- Tool зарегистрирован, описание и схема совпадают со SPEC.
- Prompt добавляется только при доступном tool и без дублей.
- RPC-контракт типизирован; `tsc` проходит.
- Нет серверного `Map`, `ctx.storage`, файлов.

## 5. Phase 3 — Визуальный движок

### 5.1 Задачи

- [x] `src/field.ts`:
  - `sampleField(mood: Mood | null, t: number, size: number): Float32Array`;
  - `size` чётный; проверка/нормализация;
  - палитра из `mood.colors` или `EMPTY_MOOD`;
  - 3–5 blob'ов с детерминированными фазами;
  - low-frequency value noise (hash + bilinear);
  - `energy` → скорость/амплитуда;
  - `smoothstep`, clamp 0..1;
  - `clear`/null → поле, низкие значения которого уходят в фон темы.
- [x] `src/render.ts`:
  - `renderRows(field, size, mood): StyledText`;
  - half-block `▀` с `fg`/`bg`;
  - caption внутри нижних 1–2 строк;
  - word wrap/truncate, glyph accent;
  - полоса под текст цвета фона темы, текст — цвета текста темы;
  - безопасные hex-цвета; никаких control-символов;
  - `selectable={false}`, `wrapMode="none"`.
- [x] Тесты `test/field.test.ts`:
  - длина `size*size`;
  - все значения finite и в `[0,1]`;
  - детерминизм при одинаковых `mood/t/size`;
  - разный `energy` даёт разные значения;
  - null не падает.
- [x] Тесты `test/render.test.ts`:
  - ровно `size/2` строк;
  - каждая строка — `size` ячеек (по количеству `▀`);
  - слова присутствуют внутри нижней полосы;
  - длинные слова обрезаны;
  - нет `\x1b`/control;
  - пустой mood не содержит слов.

### 5.2 Definition of Done

- Визуальные функции чистые, без OpenTUI-рендерера и таймеров.
- Тесты не требуют терминала.
- Нет snapshot-тестов OpenTUI.

## 6. Phase 4 — TUI-part

### 6.1 Задачи

- [x] `src/tui.tsx`:
  - `Plugin.define({ id: "llm-vibe.tui", setup(context) { ... } })`;
  - module-level `createStore<Record<string, Mood | null>>({})`;
  - `createStore<Record<string, Activity>>({})` для live-активности;
  - `context.client.rpc(VibeRpc).events.on("updated", ...)`:
    - `setMoods(sessionID, mood)`;
    - unsubscribe в cleanup.
  - `context.data.on("session.*", ...)` → `nextActivity` для thinking/writing/tool/waiting/idle;
  - `sidebar.content` slot (`prepend`):
    - `<Show when={visible()}>` вокруг `<MoodSquare ... />`;
    - fallback `columns=24`, `pixelRows=18`.
  - `/vibe` command:
    - `slash: { name: "vibe" }`;
    - toggle: `setVisible(value => !value)`;
    - `enabled` только в сессии.
- [x] `src/square.tsx`:
  - props: `sessionID`, `mood`, `columns`, `pixelRows`, `activity`, `contextRatio`;
  - reactive mood из store;
  - ширина измеряется у собственного `<box>` через `ref` + `onSizeChange`/`getLayout().width`;
  - если mood null → static dark empty (без таймера);
  - если mood есть → timer 15 FPS; фаза накапливается со скоростью активности и сглаживается (`motion.ts`);
  - `contextRatio` сглаживается в `context-usage.ts` и масштабирует радиус blob'ов (`0.8..1.25×`);
  - `sampleField(width,height)` + `renderRows` + `<text content={...} selectable={false} />`;
  - фон/текст брать из `context.theme`; low values field смешивать с фоном;
  - **не** передавать `StyledText` в `content` prop; присваивать через `ref`;
  - центр в `<box alignItems="center">`;
  - morph при смене mood ~1 с; при interrupt стартует со снимка текущих field + palette;
  - cleanup таймера и `onSizeChange`.
- [x] Проверить:
  - sidebar не крадёт фокус;
  - `/vibe` скрывает/показывает слот;
  - измеренная ширина не ломает размер при 0;
  - no mood → слот сливается с фоном темы;
  - clear → изображение растворяется в фоне темы;
  - переключение сессий читает map;
  - TUI restart → слот сливается с фоном темы.

### 6.2 Definition of Done

- Sidebar использует один store и один визуальный движок.
- Нет чтения истории, `scan.ts`.
- Нет auto-open/auto-clear.
- Таймеры чистятся; `onSizeChange` cleanup.
- `/vibe` работает в сессии и не падает вне её.

## 7. Phase 5 — Интеграция, замер, документация

### 7.1 Локальная интеграция

- [x] `npm run build`.
- [x] `opencode.json(c)` в проекте:
  ```jsonc
  {
    "$schema": "https://opencode.ai/config.json",
    "plugins": ["/absolute/path/to/llm-vibe"]
  }
  ```
- [x] Запустить OpenCode, открыть сессию.
- [x] Проверить sidebar: слот сливается с фоном темы.
- [x] Попросить модель выполнить задачу с явной эмоциональной окраской; проверить:
  - tool call `vibe` в транскрипте;
  - sidebar обновился;
  - слова внутри прямоугольника;
  - `/vibe` скрывает слот;
  - повторный `/vibe` возвращает последнее настроение.
- [x] Попросить модель обновить mood несколько раз; проверить morph.
- [x] Попросить очистить (`clear: true`); проверить растворение в фоне темы.
- [x] Перезапустить TUI; проверить, что слот сливается с фоном до нового вызова.
- [x] Проверить логи:
  `~/.local/share/opencode/log/opencode.log`, фильтр `role=cli`/`role=server`.

### 7.2 Замер токенов

Методика:

1. Зафиксировать тестовый сценарий (например, «объясни и отрефактори X»), 3 прогона.
2. Прогнать без плагина; записать `session.tokens` (input/output/cache) и число model requests.
3. Прогнать с плагином; записать то же + число вызовов `vibe`.
4. Сравнить:
   - fixed overhead = среднее (input + cache read) с плагином минус без;
   - call overhead ≈ calls × (30–50 + extra step);
   - фактическую разницу.
5. Записать результат в `README.md`/`SPEC.md` (раздел «Токенный бюджет»).
6. Проверить, что reasoning-модель не даёт неожиданно большой overhead; при необходимости уменьшить промпт/схему.

**Результат:** 3 прогона с плагином и 3 без, DeepSeek V4 Flash (Bifrost), промпт без вызова tool. Суммарный prompt: 6,306 против 6,171 → **+135 input token** фиксированного overhead. Записано в `SPEC.md` §9 и `README.md`.

### 7.3 Документация

- [x] `README.md`:
  - что делает;
  - install (`opencode plugin add` или `opencode.json`);
  - `/vibe`;
  - optional/clear;
  - token overhead;
  - dev commands.
- [x] `AGENTS.md`:
  - ссылка на `SPEC.md`/`PLAN.md`;
  - актуальная архитектура: server+TUI+RPC, no storage/scan;
  - текущее состояние (реализовано и проверено);
  - V2 gotchas;
  - команды и результаты замера.
- [x] `SPEC.md`/`PLAN.md` обновить, если реализация отклонилась.

### 7.4 Сборка и упаковка

- [x] `npm run check`.
- [x] `npm pack --dry-run`; проверить содержимое.
- [x] Проверить `dist/index.js`, `dist/tui.js`, `dist/rpc.js`, `.d.ts`.
- [x] Проверить, что `exports` и `files` корректны.
- [ ] GitHub Actions зелёный (workflow добавлен; локально `npm ci` + `npm run check` прошли).

## 8. File layout

```text
llm-vibe/
├── AGENTS.md
├── SPEC.md
├── PLAN.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsup.config.ts
├── .gitignore
├── .npmrc            # legacy-peer-deps for npm 10.9.8
├── src/
│   ├── index.ts      # server: hook + tool + RPC
│   ├── tool.ts       # pure handleVibe logic
│   ├── rpc.ts        # RPC contract
│   ├── mood.ts       # types/parser/palette
│   ├── prompt.ts     # prompt + tool description
│   ├── activity.ts   # session activity -> tempo
│   ├── motion.ts     # smoothed phase/tempo state
│   ├── morph.ts      # field/palette morph + snapshots
│   ├── dimensions.ts # adaptive sidebar dimensions
│   ├── field.ts      # scalar field/animation
│   ├── render.ts     # half-block + caption
│   ├── tui.tsx       # TUI plugin, slots, command, subscription
│   └── square.tsx    # square component/timer
├── test/
│   ├── mood.test.ts
│   ├── prompt.test.ts
│   ├── tool.test.ts
│   ├── activity.test.ts
│   ├── motion.test.ts
│   ├── morph.test.ts
│   ├── dimensions.test.ts
│   ├── field.test.ts
│   └── render.test.ts
└── .github/workflows/ci.yml
```

## 9. Test matrix

| Область | Unit | Manual |
|---|---|---|
| `parseVibe` set/clear/invalid | да | — |
| colors/energy/words/glyph sanitize | да | — |
| presets + explicit colors precedence | да | — |
| prompt injection condition/duplicates | да | — |
| tool emits updated/null | да | — |
| field dimensions/finite/determinism | да | — |
| sidebar dimensions / landscape aspect | да | да |
| render rows/caption/no control chars | да | — |
| theme background / invisible empty state | да | да |
| sidebar default/update | — | да |
| `/vibe` sidebar toggle | — | да |
| multiple updates morph | — | да |
| morph start/end/snapshot continuity | да | — |
| rapid updates continue from rendered palette | — | да |
| activity tempo idle/thinking/tool/writing | да | да |
| smooth tempo / continuous phase | да | да |
| clear → empty | — | да |
| TUI restart → empty | — | да |
| token overhead | — | да |

## 10. Acceptance checklist

- [x] `npm run check` проходит.
- [x] Пакет собирается в `dist` и проходит `npm pack --dry-run`.
- [x] Sidebar без mood сливается с фоном темы (видимого прямоугольника нет).
- [x] `vibe` обновляет квадрат live.
- [x] Несколько вызовов подряд показывают последнее состояние.
- [x] `clear: true` растворяет изображение в фоне темы.
- [x] `/vibe` скрывает/показывает vibe в сайдбаре.
- [x] Слова внутри квадрата; stage-индикаторов нет.
- [x] Нет серверного хранилища/`ctx.storage`/`scan.ts`.
- [x] TUI restart → слот сливается с фоном темы.
- [x] Tool result `ok`, без эха mood.
- [x] Token overhead замерен и записан.
- [x] `AGENTS.md`/`README.md` актуальны.

## 11. Risks и mitigation

| Риск | Mitigation |
|---|---|
| Модель игнорирует optional tool | Прямой tool (`codemode: false`), жёсткий промпт: первый вызов, промежуточные фазы, финал; описание tool; пустой default не выглядит ошибкой |
| Слишком большой token overhead | Компактная схема, один tool, без stages, замер, project-local install |
| Tool call history растёт | 2–4 ориентир, нет жёсткого лимита; compaction; замер |
| Пропущенное RPC-событие | Принято: пустой квадрат до следующего вызова; нет scan |
| TUI restart теряет mood | Принято; модель обновит при следующем ходе |
| Медленный рендер | W 16–64, H 14–28, 15 FPS, static empty, cleanup |
| Невалидные цвета/glyph | Sanitize/fallback, tool не падает |
| Focus stealing | Sidebar не открывает панель; `/vibe` только переключает видимость |
| Remote server без server-part | Документировать установку обеих частей |
| Version drift V2 API | Сверять с установленным OpenCode; docs V2 |

## 12. Порядок работ

1. Scaffold + `npm run check`.
2. `mood.ts`/`prompt.ts` + тесты.
3. `rpc.ts`/`index.ts` + тесты.
4. `field.ts`/`render.ts` + тесты.
5. `tui.tsx`/`square.tsx` + ручная проверка.
6. Интеграция, замер токенов, docs, pack.

## 13. Решённые вопросы и future

Решено:

- Пакет: `opencode-llm-vibe` без scope.
- Sidebar: измеренная ширина 16..64 колонок, высота 18..28 пикселей; fallback 24×18, landscape.
- Plugin options в v1 нет.
- `/vibe clear` для пользователя не делаем.
- Prompt/tool активны во всех сессиях, включая subagent-сессии.
- Токенный overhead замерен: +135 input token на request.
- Достаточно раздела в README/SPEC, отдельный `TOKENS.md` не нужен.

Future:

- Plugin options: `enabled`, `sidebarSize`, `fps`.
- `/vibe clear` для пользователя.
- Ограничение prompt/tool для subagent-сессий.
- Восстановление mood из истории (сейчас осознанно нет).

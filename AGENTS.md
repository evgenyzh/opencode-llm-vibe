# llm-vibe

OpenCode V2 plugin: модель опционально объявляет текущее настроение через tool `vibe`, а TUI рисует анимированный псевдографический прямоугольник в сайдбаре. `/vibe` открывает большую панель.

**Сначала читать:** [`SPEC.md`](./SPEC.md) — детальное ТЗ, [`PLAN.md`](./PLAN.md) — порядок реализации и критерии приёмки.

## Текущее состояние

Реализовано и проверено в OpenCode 2.2.5:

- server-part: prompt hook, tool `vibe`, RPC-событие;
- TUI-part: sidebar-прямоугольник, `/vibe`-панель, fullscreen по `f`, анимация и morph;
- live-темп из `session.*` событий, сглаживание `motion.ts`, сохранение phase/tempo в памяти;
- тесты, сборка, `npm pack --dry-run`;
- ручная проверка в TUI: set, clear, toggle, fullscreen, restart → слот сливается с фоном темы;
- замер фиксированного overhead: **+135 input token** на request (DeepSeek V4 Flash через Bifrost, 3 прогона).

## Архитектура

- Это **нативный плагин V2**, не MCP: server-part нужен для system prompt и tool, TUI-part — для панели.
- Server-part (`src/index.ts`, `src/tool.ts`): `ctx.session.hook("context")` добавляет опциональную инструкцию, `ctx.tool.transform` регистрирует tool `vibe`, RPC-регистрация отдаёт событие.
- Одно RPC-событие `updated` с `{ sessionID, mood: Mood | null }`. `clear` — это `mood: null`.
- **Никакого серверного хранилища:** без `ctx.storage`, БД, файлов, серверного `Map`, `scan.ts` и чтения истории. TUI хранит только `Record<sessionID, Mood | null>` в module-level Solid store.
- Tool `vibe` на уровне протокола опционален, но промпт требует встроить его в каждый ход: первый tool call в начале, повторные между фазами и ещё один перед финальным ответом (2–4 за ход). Последний вызов побеждает; `clear: true` убирает vibe. Результат tool — `ok`, без эха mood.
- `preset` (`calm/focus/warm/alert/playful/tired`) — сахар: парсер разворачивает его в конкретные `colors`; явные цвета важнее preset. Промпт просит менять палитру вместе с настроением.
- Morph длится ~1 с. Если новый `vibe` приходит во время морфа, следующий переход стартует со снимка текущих field + palette, а не с предыдущей цели — цвет не откатывается и не прыгает.
- TUI при перезапуске/пропуске события показывает слот цвета фона темы; восстановления из истории нет — это осознанно. Auto-clear и auto-open отсутствуют.
- Sidebar (`sidebar.content`, `prepend`) виден всегда, когда открыт сайдбар; по умолчанию слот сливается с фоном темы (24×9 ячеек). `/vibe` открывает `session.panel` с именем `llm-vibe.mood`; размер адаптируется к ширине панели (`columns 16..32`, `pixelRows = columns * 0.75`). Слова рисуются внутри нижней части; stage-индикаторов и истории нет.
- Фон поля и полосы под текст — `context.theme.background.raised.base` (поверхность sidebar/panel), текст — `context.theme.text.base`. Виньетки по краям нет: низкие значения field плавно уходят в фон темы, поэтому видимого прямоугольника нет.
- Темп анимации зависит от live-активности: `idle 0.45×`, `waiting 0.8×`, `thinking 1.25×`, `writing 1.55×`, `tool 1.9×`; скорость сглаживается за ~300 мс, фаза не сбрасывается. TUI слушает `session.*` события; модель не обязана вызывать tool для смены темпа.
- Загрузка — через `opencode.json(c)` → `plugins`; нужны обе части. Одного `cli.json` с TUI-частью недостаточно.
- Код плагина вотчится сервером/CLI: после `npm run build` работающий сервер пишет `loading plugin ... dist/index.js`. Полный рестарт не нужен; `/reload` — если вотчер пропустил.

## V2 API: не путать с V1

- TUI entry: `export default Plugin.define({ id, setup(context) { ... } })` из `@opencode/plugin/tui`.
- Server entry: `Plugin.define` из `@opencode/plugin`; RPC — из `@opencode/plugin/rpc`.
- Package exports: `.`, `./tui`, `./rpc`; сборка в `dist`, `type: module`.
- Версии: `@opencode/plugin` 2.2.5, peers `@opentui/core`/`@opentui/solid` >= 0.8.0, `solid-js` >= 1.9.0.
- `session.panel` даёт `name`, `sessionID`, `width`, `focused`, `close()`, `toggleFullscreen()`. `sidebar.content` даёт только `sessionID`; sidebar фиксирован (24 колонки × 9 строк).
- Half-block: `▀`, `fg` = верхний пиксель, `bg` = нижний, 24-bit. `W×H` пикселей → `W` колонок × `H/2` строк.
- **Важно:** Solid-обёртка `<text content={...}>` приводит `StyledText` к строке (`[object Object]`). Собирать `StyledText` через `t`/`fg`/`bg`/`new StyledText(chunks)` и присваивать через `ref`: `text.content = square.text`.
- Host renderables не являются API; не зависеть от их структуры. OpenTUI-ресурсы с owner — только через `context.renderer.nativeScene` и с cleanup.
- V1 docs (`https://opencode.ai/docs/`) не применять.

## Токенный бюджет

Фиксированно **~135 токенов** на каждый model request (промпт + схема + preset enum + описание). Измерено сравнением 3 прогонов с плагином и без: суммарный prompt (input + cache read) 6,306 против 6,171. Один вызов `vibe` — ~30–50 токенов плюс дополнительный model request (~300–400 + контекст). Tool call остаётся в истории и добавляет ~30–60 токенов на вызов. Правило в промпте — 2–4 вызова на обычный ход (начало, промежуточные фазы, финал); жёсткого лимита нет. Детали — в `PLAN.md`, Phase 5.

## Отладка

- Логи: `~/.local/share/opencode/log/opencode.log`; `role=cli` — TUI, `role=server` — плагины/сессии.
- Конфиг и `cli.json` перезагружаются автоматически; `/reload` форсирует перезагрузку плагинов.
- RPC-события live-only: если TUI не был подписан, событие потеряно.
- TUI-проверка без GUI: `tmux new-session -d ... "opencode --standalone"`, затем `tmux send-keys`, `tmux capture-pane -p -e` для ANSI-цветов.

## Команды

Стек: npm + Node >= 22, TypeScript strict/NodeNext, tsup, vitest, CI на Node 22.

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run check        # typecheck -> test -> build -> npm pack --dry-run
```

`npm ci` требует `.npmrc` с `legacy-peer-deps=true` из-за бага npm 10.9.8 в разборе optional peers `@opencode/plugin`.

## Источники

- `SPEC.md`, `PLAN.md`, `README.md`
- https://opencode.ai/v2/docs/build/plugins/cli
- https://opencode.ai/v2/docs/build/plugins
- https://opencode.ai/v2/docs/build/plugins/server
- https://opencode.ai/v2/docs/build/plugins/rpc

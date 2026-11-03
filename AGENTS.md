# llm-vibe

OpenCode V2 plugin: модель объявляет текущее настроение через прямой tool `vibe`, а TUI рисует анимированный псевдографический прямоугольник в сайдбаре. `/vibe` включает/выключает показ в сайдбаре.

**Сначала читать:** [`SPEC.md`](./SPEC.md) — детальное ТЗ, [`PLAN.md`](./PLAN.md) — порядок реализации и критерии приёмки.

## Текущее состояние

Реализовано и проверено в OpenCode 2.2.5:

- server-part: prompt hook, прямой tool `vibe` (`codemode: false`), RPC-событие;
- TUI-part: sidebar-прямоугольник, `/vibe` toggle, измерение ширины через `onSizeChange`, анимация и morph;
- live-темп из `session.*` событий, сглаживание `motion.ts`, сохранение phase/tempo в памяти;
- радиус blob'а из `session.step.ended` + лимита модели, сглаживание `context-usage.ts`, 15 FPS;
- тесты (93), сборка, `npm pack --dry-run`;
- ручная проверка в TUI: set, clear, toggle, restart → слот сливается с фоном темы;
- замер фиксированного overhead: **+135 input token** до перехода на обязательный промпт; текущий текст требует перезамера.

## Архитектура

- Это **нативный плагин V2**, не MCP: server-part нужен для system prompt и tool, TUI-part — для sidebar.
- Server-part (`src/index.ts`, `src/tool.ts`): `ctx.session.hook("context")` добавляет обязательную инструкцию, `ctx.tool.transform` регистрирует прямой tool `vibe` с `options: { codemode: false }`, RPC-регистрация отдаёт событие. Без `codemode: false` tool доступен только через `execute`, промпт не видит его в `event.tools`, и модель почти не вызывает vibe.
- Одно RPC-событие `updated` с `{ sessionID, mood: Mood | null }`. `clear` — это `mood: null`.
- **Никакого серверного хранилища:** без `ctx.storage`, БД, файлов, серверного `Map`, `scan.ts` и чтения истории. TUI хранит только `Record<sessionID, Mood | null>` и `Record<sessionID, number>` (context fill) в module-level Solid store.
- Tool `vibe` на уровне протокола опционален, но промпт требует встроить его в каждый ход: первый tool call в начале, повторные между фазами и ещё один перед финальным ответом (2–4 за ход; первый и последний обязательны). Последний вызов побеждает; `clear: true` убирает vibe. Результат tool — `ok`, без эха mood.
- `preset` (`calm/focus/warm/alert/playful/tired`) — сахар: парсер разворачивает его в конкретные `colors`; явные цвета важнее preset. Промпт просит менять палитру вместе с настроением.
- Morph длится ~1 с. Если новый `vibe` приходит во время морфа, следующий переход стартует со снимка текущих field + palette, а не с предыдущей цели — цвет не откатывается и не прыгает.
- TUI при перезапуске/пропуске события показывает слот цвета фона темы; восстановления из истории нет — это осознанно. Auto-clear и auto-open отсутствуют.
- Sidebar (`sidebar.content`, `prepend`) измеряет собственную ширину через `ref` + `onSizeChange`/`getLayout().width`; размеры: `columns = clamp(even(width), 16, 64)`, `pixelRows = clamp(even(round(columns * 0.65)), 18, 28)`. Fallback — 24×18. Поле сэмплируется с виртуальным отступом 12%, чтобы blob не касался краёв. Слова рисуются внутри нижней части; stage-индикаторов и истории нет.
- Радиус blob'а зависит от заполнения контекста: `session.step.ended` даёт `input + cache.read + cache.write + output + reasoning`, лимит — `limit.input`/`limit.context` модели; `scale = 0.8 + 0.45 × ratio`. Level сглаживается за ~1 с в `context-usage.ts`, поэтому рост/сжатие плавные, а после compaction blob сжимается. `/vibe` hide/show не сбрасывает level.
- `/vibe` — не панель, а toggle видимости sidebar-слота. При выключении `MoodSquare` размонтируется и таймер останавливается; mood в store сохраняется.
- Фон поля и полосы под текст — `context.theme.background.raised.base` (поверхность sidebar), текст — `context.theme.text.base`. Виньетки по краям нет: низкие значения field плавно уходят в фон темы, поэтому видимого прямоугольника нет.
- Темп анимации зависит от live-активности: `idle 0.5×`, `waiting 0.9×`, `thinking 1.7×`, `writing 2.1×`, `tool 2.6×`; скорость сглаживается за ~300 мс, фаза не сбрасывается. Рендер идёт на 15 FPS. TUI слушает `session.*` события; модель не обязана вызывать tool для смены темпа.
- Загрузка — через `opencode.json(c)` → `plugins`; нужны обе части. Одного `cli.json` с TUI-частью недостаточно. Плагин прописан глобально в `~/.config/opencode/opencode.json` как `/home/zz/Projects/llm-vibe`.
- Код плагина вотчится сервером/CLI: после `npm run build` работающий сервер пишет `loading plugin ... dist/index.js`. Полный рестарт не нужен; `/reload` — если вотчер пропустил.

## V2 API: не путать с V1

- TUI entry: `export default Plugin.define({ id, setup(context) { ... } })` из `@opencode/plugin/tui`.
- Server entry: `Plugin.define` из `@opencode/plugin`; RPC — из `@opencode/plugin/rpc`.
- Package exports: `.`, `./tui`, `./rpc`; сборка в `dist`, `type: module`.
- Версии: `@opencode/plugin` 2.2.5, peers `@opentui/core`/`@opentui/solid` >= 0.8.0, `solid-js` >= 1.9.0.
- `sidebar.content` даёт только `sessionID`; ширину меряем у собственного `<box>` через `onSizeChange`/`getLayout().width`. `session.panel` больше не используется.
- Half-block: `▀`, `fg` = верхний пиксель, `bg` = нижний, 24-bit. `W×H` пикселей → `W` колонок × `H/2` строк.
- **Важно:** Solid-обёртка `<text content={...}>` приводит `StyledText` к строке (`[object Object]`). Собирать `StyledText` через `t`/`fg`/`bg`/`new StyledText(chunks)` и присваивать через `ref`: `text.content = square.text`.
- Host renderables не являются API; не зависеть от их структуры. OpenTUI-ресурсы с owner — только через `context.renderer.nativeScene` и с cleanup.
- V1 docs (`https://opencode.ai/docs/`) не применять.

## Токенный бюджет

Ранее измерено **~135 токенов** на каждый model request (промпт + схема + preset enum + описание): 3 прогона с плагином и 3 без, суммарный prompt (input + cache read) 6,306 против 6,171. После перехода на обязательный промпт текст стал чуть длиннее — точное значение требует перезамера. Прямой tool (`codemode: false`) убирает обёртку `execute` из вызова, но не из фиксированного prompt. Один вызов `vibe` — ~30–50 токенов плюс дополнительный model request (~300–400 + контекст). Tool call остаётся в истории и добавляет ~30–60 токенов на вызов. Правило в промпте — 2–4 вызова на обычный ход (начало, промежуточные фазы, финал); жёсткого лимита нет. Детали — в `PLAN.md`, Phase 5.

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

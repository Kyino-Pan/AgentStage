# AgentStage Memory Rules

这个目录是用户的“统一网页展示入口”。后续 agent 如果需要把内容以网页形式展示给用户，默认应该复用这里，而不是各自再起一套新的导航或挂载方案。

当前已经注册到 Codex 全局的 skill 名称是：

```text
$agentstage-portal
```

后续 agent 如果要把内容发布到这个共享网页入口，默认应优先调用这个 skill。

## 任务目标

- 用一个固定端口统一展示多个 agent 的页面
- 让其他 agent 只做最少工作就能接入
- 尽可能把真实资源保留在源工作区
- 在当前仓库里保留入口 HTML 备份
- 同一用户的页面自动共享侧边栏和返回导航首页入口

## 默认契约

1. 这是一个“portal + wrapper”架构，不是每个页面自己的独立站点。
2. 其他 agent 最好产出静态 HTML 页面，再交给这里挂载。
3. 页面资源优先使用相对路径，避免以 `/` 开头的根绝对路径。
4. `--user` 默认必须取自页面作者工作区根目录的 basename，禁止使用 `codex`、`agent`、`assistant` 等泛名。
5. 页面注册一律优先走 `scripts/register-page.mjs` 或运行中的 `POST /api/register`。
6. 不要直接手写或删除 `data/registry.json` 中的记录，除非脚本本身坏了。
7. 每次重新注册页面时，入口 HTML 都应该被同步备份到 `backups/<user>/<page>/`。
8. 页面壳负责统一导航，所以源 HTML 不必重复实现侧边栏和“返回首页”按钮，除非页面自己确实需要额外导航。
9. 使用 `$agentstage-portal` 时，绝对不允许修改任何已有文件，也不允许删除任何文件；唯一允许的写操作是产出一个全新的 page。
10. 使用 `$agentstage-portal` 时，不允许更新已有 page，不允许修改 `data/registry.json`、`backups/`、`skill/agentstage-portal/default-design-constraints.json`、脚本、文档、配置或运行时文件。
11. 如果你修改了 portal 的使用方式，也要同步更新文档和示例。

## 关键文件

- 服务入口: `server.mjs`
- Portal 前端: `public/app.js`
- 样式: `public/styles.css`
- 注册脚本: `scripts/register-page.mjs`
- 后台启动: `scripts/daemon-start.mjs`
- 后台状态: `scripts/daemon-status.mjs`
- 后台停止: `scripts/daemon-stop.mjs`
- launchd 安装: `scripts/launchd-install.mjs`
- launchd 状态: `scripts/launchd-status.mjs`
- launchd 卸载: `scripts/launchd-uninstall.mjs`
- launchd 说明: `launchd/README.md`
- 全局 skill: `skill/agentstage-portal/SKILL.md`
- 默认设计约束: `skill/agentstage-portal/default-design-constraints.json`
- skill 安装脚本: `scripts/global-skill.mjs`
- 跨机器快速部署: `scripts/bootstrap-machine.mjs`
- 注册表: `data/registry.json`
- 注册表示例: `data/registry.example.json`
- 备份目录: `backups/`
- 示例页面: `examples/demo-user/welcome-dashboard/index.html`

## 给后续 Agent 的操作顺序

1. 先在你自己的工作区生成静态页面。
2. 确认入口 HTML 可以单独打开，并且资源路径是相对的。
3. 进入这个仓库根目录，也就是包含 `server.mjs`、`package.json` 和 `skill/agentstage-portal/` 的目录。
4. 将工作区根目录 basename 作为 `--user`；不要用 `codex` 之类的泛名。
5. 如果 portal 已在运行，优先用 `--server http://127.0.0.1:4318` 或 `POST /api/register` 完成热注册。
6. 如果 portal 尚未运行，再启动或复用本目录的服务。
7. 告诉用户用这个端口访问，而不是去你自己的工作区找页面。
8. 如果是新会话或新 agent，优先尝试触发 `$agentstage-portal`，而不是手工重新理解整个项目。
9. 但如果任务需要修改已有文件、删除文件、更新已有页面、变更运行时或修配置，不要使用 `$agentstage-portal`；改走普通非-skill 工作流。

## 推荐命令

```bash
cd <project-root>
node scripts/register-page.mjs \
  --server http://127.0.0.1:4318 \
  --user "你的工作区目录名" \
  --page "这次展示的标题" \
  --entry /绝对路径/到/你的/index.html
```

## 后台服务约定

- 默认后台地址是 `http://127.0.0.1:4318`。
- 常驻进程用 `npm run daemon:start` 启动，用 `npm run daemon:status` 检查。
- 如果要做 macOS 登录后自动常驻，优先用 `npm run launchd:install`，并用 `npm run launchd:status` 检查。
- 在 Codex 的受限沙箱里，`launchd:install` 往往会因为写入 `~/Library/LaunchAgents/` 而触发提权请求，这属于预期行为。
- 如果是新的电脑，优先用 `npm run bootstrap:machine` 一次性完成 skill + 持久化运行时部署。
- `launchd:install` 会优先尝试停掉同端口上的旧 AgentStage 进程；不要手工再起第二个 `4318` 实例。
- 全局 skill 状态用 `npm run skill:status` 检查。
- 不要再手工开第二个同端口实例。
- 如果你改了监听地址、端口、pid/log 规则，要同步更新文档。

## 不要做的事

- 不要引入必须联网安装的重型框架，除非用户明确要求。
- 不要把其他 agent 的整套资源复制进本仓库作为主来源。
- 不要为了单个页面去破坏统一包装层。
- 不要绕开注册脚本直接改 registry，除非你也修掉脚本并更新文档。

## 当前已知限制

- 当前最稳的是静态页面。
- 如果源 HTML 里有大量以 `/` 开头的资源地址，虽然 portal 会尝试重写常见引用，但不保证覆盖全部情况。
- 备份主要保证入口 HTML 可追溯，不保证在源资源全部丢失后还能 100% 还原完整页面。
- `data/registry.json`、`runtime/`、`backups/` 默认是本机运行态数据，准备开源时不要直接提交。

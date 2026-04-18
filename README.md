# AgentStage

[English Version](README_EN.md)

AgentStage 是一个给 agent 产出的面向人类页面使用的共享本地入口。

当多个 agent 在不同工作区里生成静态 HTML 页面，但人类不想分别去找不同目录、不同临时服务时，就适合使用它。AgentStage 用一个统一的本地地址把这些页面集中展示出来。

## 你会得到什么

- 一个统一的本地入口：`http://127.0.0.1:4318`
- 一个用于选择基于工作区身份派生出的 userSpace 的首页
- 一个轻量页面壳，用来承载嵌入的页面
- 无需重建各页面项目的热注册更新
- 尽可能保留在原工作区中的 HTML、CSS、JS 和资源文件
- 关于页内置 GitHub 更新检查，可选择自动更新或忽略当前版本

## 选择运行方式

前提：机器上已经安装 `git` 和 `node`。

前台运行：

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && npm start
```

快速后台运行：

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && npm run bootstrap:machine
```

然后访问 `http://127.0.0.1:4318`。

如果仓库已经在本地：

前台：

```bash
npm start
```

后台：

```bash
npm run bootstrap:machine
```

- `npm start` 会将服务挂在当前终端，按 `Ctrl+C` 停止。
- `npm run bootstrap:machine` 会初始化本地状态、安装全局 skill 链接，并启动后台运行时。
- 在 macOS 上，`bootstrap:machine` 会安装由 `launchd` 管理的后台服务。
- 在 Linux 和 Windows 上，`bootstrap:machine` 会启动一个分离式后台守护进程。如果你希望使用操作系统原生的持久化服务，请看下面的平台命令。

<details>
<summary>macOS、Linux、Windows 的常驻服务命令</summary>

macOS:

```bash
git clone https://github.com/Kyino-Pan/AgentStage.git && cd AgentStage && node scripts/bootstrap-machine.mjs --runtime none && npm run launchd:install
```

Linux `systemd --user` 服务：

克隆后在仓库根目录执行：

```bash
node scripts/bootstrap-machine.mjs --runtime none
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/agentstage.service <<EOF
[Unit]
Description=AgentStage local portal

[Service]
Type=simple
WorkingDirectory=${PWD}
ExecStart=$(command -v node) ${PWD}/server.mjs
Restart=on-failure
RestartSec=3
Environment=HOST=127.0.0.1
Environment=PORT=4318

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now agentstage.service
```

如果希望 Linux 用户服务在登出后继续运行，再执行：

```bash
loginctl enable-linger "$USER"
```

Windows PowerShell 计划任务：

在仓库根目录用 PowerShell 执行：

```powershell
node scripts/bootstrap-machine.mjs --runtime none
$root = (Get-Location).Path
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$root\server.mjs`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName "AgentStage" -Action $action -Trigger $trigger -Settings $settings -Description "AgentStage local portal" -Force
Start-ScheduledTask -TaskName "AgentStage"
```

这个 Windows 方案会在登录后持久运行。如果你需要登录前即启动的机器级 Windows 服务，则需要在本仓库脚本之外配合管理员维护的服务包装器。
</details>

## 后台运行的开销

后台部署很方便，但并不是零成本：

- 会持续保留一个 Node 进程并占用端口 `4318`
- 会随着时间写入运行状态和日志
- 会增加启动钩子或服务/任务元数据，后续可能需要维护或移除
- 即使无人访问，也会带来持续的空闲内存占用和偶发 CPU 唤醒

## 检查更新

命令行检查：

```bash
npm run check-update
```

Portal 内检查：

- 打开关于页即可看到当前本地版本、远端版本和最近检查时间
- 如果检测到新的 GitHub 更新，关于入口会出现小红点
- 可以在关于页里选择自动更新，或者忽略当前这一个版本

## 它是怎么工作的

1. agent 在自己的工作区中生成一个静态 HTML 页面。
2. agent 将这个页面注册进 AgentStage。
3. 人类打开一个统一入口，并在其中浏览所有已注册页面。

示例注册命令：

```bash
node scripts/register-page.mjs --server http://127.0.0.1:4318 --user-id "<project-name-or-project/subproject>" --user-name "<project-name-or-project/subproject>" --workspace-root /absolute/path/to/workspace --source-root /absolute/path/to/workspace/out --page "Demo Page" --entry /absolute/path/to/workspace/out/index.html
```

身份规则：

- 默认的 userSpace 身份为单层：`<project>`
- 如果页面位于受支持的容器目录中，例如 `agentSpace/<child>`，AgentStage 可以推导出双层身份：`<project>/<child>`
- 当前有意拒绝三级身份
- 如果 agent 在受支持的嵌套工作区里只传了叶子目录名，AgentStage 会将其规范化为 `<project>/<child>`

## 进一步深入时可用的提示词

如果你想让自己的 agent 解释或审计这个项目，可以从下面任意一个提示词开始：

```text
Read README_AGENT.md, AGENTS.md, and skill/agentstage-portal/SKILL.md. Then explain what AgentStage is for, who it is for, and how its local portal model works.
```

```text
Read README_AGENT.md and show me the fastest way to run AgentStage on this machine, verify it is healthy, and register a sample page end to end.
```

```text
Read README_AGENT.md and explain the architecture, runtime model, registration flow, identity rule, backup behavior, and the main trust/security limits of this project.
```

## 继续阅读

- 英文首页：`README_EN.md`
- 详细手册：`README_AGENT.md`
- 项目记忆与规则：`AGENTS.md`
- 人类/操作员限制与信任边界：`DISCLAIMER.md`、`SECURITY.md`

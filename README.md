# X Post Research Skill

中文为主，English below key sections.

一个通用 Agent Skill：读取、核查并总结 X/Twitter 帖子。它不只适合 Codex，也适合 Claude Code、Hermes、Gemini CLI、Cursor、Windsurf 等支持 `SKILL.md` 或类似 skill 机制的智能体。

A general-purpose Agent Skill for reading, verifying, and summarizing X/Twitter posts. It is designed for Codex, Claude Code, Hermes, Gemini CLI, Cursor, Windsurf, and other agents that can learn from a `SKILL.md` workflow.

## 适合谁

- 你经常把 X/Twitter 帖子发给智能体，让它总结主要内容。
- 帖子里有配图、引用、评论区、外链，需要一起查清楚。
- 帖子推荐了某个 skill、插件、MCP、API 服务，你想判断它到底是什么、能不能用、要不要 API Key。
- 你想把教程帖整理成学习路径、实践步骤和风险提醒。
- 你想学习如何把一次真实问题，沉淀成一个可复用的通用 Agent Skill。

Good for users who want an agent to inspect X/Twitter posts, including images, quotes, replies, external links, and tool recommendations.

## 能力

这个 skill 带了一个零依赖 Node.js 脚本：

`skill/x-post-research/scripts/x-read-post.mjs`

它会按顺序尝试：

1. X/Twitter 的公开轻量接口
2. oEmbed 接口
3. 本机 Chrome DevTools/CDP 登录态读取

如果公开接口失败，它会尝试读取你已经登录的 Chrome 页面，所以适合处理 X 经常限制未登录访问的问题。

The script tries public endpoints first, then falls back to your local Chrome DevTools/CDP session when available.

## 通用安装方式

核心是把 `skill/x-post-research` 这个文件夹复制到你的智能体 skills 目录。

不同工具的 skills 目录可能不同：

- Codex：通常是 `~/.codex/skills/x-post-research`
- Claude Code：通常是 `~/.claude/skills/x-post-research`
- Hermes / 其他 Agent：复制到它们约定的 skills 或 tools 目录；如果没有固定目录，也可以让 Agent 直接读取这个仓库里的 `SKILL.md`

The universal rule: copy `skill/x-post-research` into your agent's skills directory, or point your agent to its `SKILL.md`.

## 安装到 Codex

Windows:

```powershell
Copy-Item -Recurse -Force .\skill\x-post-research "$env:USERPROFILE\.codex\skills\x-post-research"
```

macOS / Linux:

```bash
mkdir -p ~/.codex/skills
cp -R skill/x-post-research ~/.codex/skills/x-post-research
```

然后重启 Codex，让新 skill 生效。

## 安装到 Claude Code

macOS / Linux:

```bash
mkdir -p ~/.claude/skills
cp -R skill/x-post-research ~/.claude/skills/x-post-research
```

Windows PowerShell:

```powershell
Copy-Item -Recurse -Force .\skill\x-post-research "$env:USERPROFILE\.claude\skills\x-post-research"
```

然后重启 Claude Code 或开启新会话。

## Hermes / 其他智能体

如果你的智能体支持 `SKILL.md`：

1. 复制 `skill/x-post-research` 到该智能体的 skills 目录。
2. 确保智能体能读取 `SKILL.md`。
3. 让智能体在遇到 X/Twitter 帖子链接时加载这个 skill。

如果你的智能体不支持 skills，也可以直接运行脚本：

```bash
node skill/x-post-research/scripts/x-read-post.mjs "https://x.com/user/status/1234567890" --json
```

For agents without a formal skill system, use the script directly or ask the agent to read `SKILL.md` as workflow instructions.

## 直接运行脚本

结构化 JSON 输出：

```bash
node skill/x-post-research/scripts/x-read-post.mjs "https://x.com/user/status/1234567890" --json
```

普通文本输出：

```bash
node skill/x-post-research/scripts/x-read-post.mjs "https://x.com/user/status/1234567890"
```

## Chrome 登录态读取

如果公开接口读不到，脚本会尝试连接本机 Chrome DevTools。

最稳的启动方式是先关闭 Chrome，然后用下面参数打开。

Windows 示例：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --remote-allow-origins=* `
  --new-window "https://x.com"
```

如果你使用独立 Chrome 账号目录：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --user-data-dir="C:\path\to\your\ChromeProfile" `
  --remote-debugging-port=9222 `
  --remote-allow-origins=* `
  --new-window "https://x.com"
```

也可以用环境变量告诉脚本你的用户数据目录：

```powershell
$env:CHROME_USER_DATA_DIR="C:\path\to\your\ChromeProfile"
node skill/x-post-research/scripts/x-read-post.mjs "https://x.com/user/status/123"
```

For Chrome fallback, start Chrome with `--remote-debugging-port=9222` and `--remote-allow-origins=*`.

## 给新手的提问模板

不要只说“总结一下”。更好的提示词是：

```text
读一下这条 X 帖，正文、配图、评论区和外链都要看。告诉我它主要推荐什么，能不能安装，是否需要 API Key 或付费，最后给我一个实践步骤。
```

Recommended prompt:

```text
Read this X/Twitter post. Inspect the text, images, replies, and external links. Tell me the main point, whether the mentioned tool can be installed or used, whether it needs an API key or payment, and give me practical next steps.
```

## 常见问题

### 为什么要 `--remote-allow-origins=*`？

新版 Chrome 会拒绝普通 WebSocket 连接。没有这个参数时，脚本可能能看到调试端口，但连不上页面。

Newer Chrome versions may reject WebSocket DevTools connections without this flag.

### 会不会泄露 Cookie？

脚本不会主动读取 Cookie、localStorage 或密码。它只通过已经打开的页面读取可见 DOM 文本、链接和图片地址。不要把不信任的脚本改成读取隐私数据。

The script does not intentionally read cookies, localStorage, passwords, or secrets. It reads visible page DOM text, links, and image URLs.

### 为什么有些帖子读不到？

可能原因：

- 帖子已删除或私密
- 账号未登录或被 X 限制
- Chrome 没有按调试参数启动
- 网络无法访问 X/Twitter 的公开接口

Some posts may fail because they are deleted, private, login-gated, rate-limited, or inaccessible from your network.

## 开源给新手学习

这个仓库的重点不是“完美抓取 X”，而是给新手展示一个完整思路：

1. 从真实问题出发。
2. 写一个可复用脚本。
3. 把脚本包装成通用 Agent Skill。
4. 写清楚安装、使用、风险和失败原因。
5. 开源分享，让别人能复现和继续改进。

This repository teaches a practical pattern: solve a real problem, turn the solution into a script, wrap it as a reusable Agent Skill, document it clearly, and share it for others to improve.

## 许可证 / License

MIT

---
name: x-post-research
description: 通用 Agent Skill：读取、核查并总结 X/Twitter 帖子，中文优先输出，适合 Codex、Claude Code、Hermes、Gemini CLI 等智能体处理长教程帖、带图帖、引用帖、评论区、t.co 外链、以及提到 skills/tools/MCP/API 的帖子。General Agent Skill for reading, verifying, and summarizing X/Twitter posts with Chinese-first output.
---

# X Post Research

Use this skill to turn an X/Twitter status URL into a verified, Chinese-first research note. Do not stop at the visible tweet text when the post contains images, quoted posts, replies, or external links.

## Workflow

1. Extract the status id from the URL.
2. Run `scripts/x-read-post.mjs "<url>" --json` first. It tries public endpoints and falls back to local Chrome CDP when available.
3. Treat the main post, images, quoted post, replies, and external links as separate evidence surfaces. Do not summarize from the first text block alone when the post contains media or links.
4. If a post mentions a tool, skill, plugin, MCP server, API, or service, inspect the external page or GitHub repository before answering whether it can be used or installed.
5. Answer in Chinese by default. Add English only when useful for repository names, commands, tool names, or bilingual sharing.
6. Separate verified facts from inferred guidance. Mention when a claim comes only from the post or comments.
7. If the post cannot be read, explain which path failed: public endpoint, oEmbed, Chrome CDP, login, deleted/private post, or network access.

## Chrome CDP

The fallback script expects a reachable Chrome DevTools endpoint. If WebSocket is rejected, restart Chrome with:

```powershell
chrome.exe --remote-debugging-port=9222 --remote-allow-origins=*
```

When using a named Chrome profile, include its `--user-data-dir`.

## Output Shape

For simple posts, answer with the main point and any important links.

For tutorial posts, produce:

- what it is
- key sections
- what is actionable now
- what looks unofficial, paid, risky, or needs verification
- recommended next steps

For tool/skill posts, include:

- product or repo name
- install/use status when checked locally
- auth or API key requirements
- pricing clues from the post/page
- whether it is an Agent Skill, Codex/Claude/Hermes workflow, MCP service, browser workflow, API service, or ordinary web service

For learning posts, include:

- one-sentence thesis
- what to learn first
- what to install or try
- common failure points
- a beginner-friendly practice plan

## Local Script

Use:

```powershell
node ~/.codex/skills/x-post-research/scripts/x-read-post.mjs "<x-url>" --json
```

If the user installed the skill from a repository checkout instead of copying it into `~/.codex/skills`, run the script from that checkout path.

## Safety Notes

- Do not read cookies, passwords, localStorage, or unrelated private tabs.
- Do not claim a tool is official unless the source confirms it.
- Prefer primary sources for install and pricing claims.
- Keep quoted text short; summarize long posts and pages in your own words.

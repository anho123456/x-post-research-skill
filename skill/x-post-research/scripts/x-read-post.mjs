#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const input = process.argv[2];
const jsonOnly = process.argv.includes('--json');

if (!input) {
  console.error('Usage: node skill/x-post-research/scripts/x-read-post.mjs <x/twitter status url or id> [--json]');
  process.exit(2);
}

const statusId = extractStatusId(input);
if (!statusId) {
  console.error(`Could not find a status id in: ${input}`);
  process.exit(2);
}

const statusUrl = input.startsWith('http')
  ? input
  : `https://x.com/i/status/${statusId}`;

const result = {
  statusId,
  statusUrl,
  source: null,
  ok: false,
  errors: [],
  tweet: null,
  replies: [],
};

for (const reader of [readViaSyndication, readViaOembed, readViaChromeCdp]) {
  try {
    const value = await reader(statusId, statusUrl);
    if (value?.tweet?.text) {
      Object.assign(result, value, { ok: true });
      break;
    }
    if (value?.error) result.errors.push(value.error);
  } catch (error) {
    result.errors.push(`${reader.name}: ${error.message}`);
  }
}

if (jsonOnly) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  printHuman(result);
} else {
  console.log(`Failed to read X post ${statusId}.`);
  for (const error of result.errors) console.log(`- ${error}`);
  console.log('\nChrome fallback needs Chrome started with remote debugging, for example:');
  console.log(`chrome.exe --remote-debugging-port=9222 --remote-allow-origins=* "${statusUrl}"`);
  process.exitCode = 1;
}

function extractStatusId(value) {
  const match = String(value).match(/(?:status|statuses|i\/web\/status|i\/status)\/(\d{10,})|^(\d{10,})$/);
  return match?.[1] || match?.[2] || null;
}

async function readViaSyndication(id) {
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=zh-cn`;
  const response = await fetchText(url, 8000);
  if (!response.ok) return { error: `syndication: HTTP ${response.status}` };
  const data = JSON.parse(response.text);
  const text = stripHtml(data.text || data.full_text || '');
  if (!text) return { error: 'syndication: empty tweet text' };
  return {
    source: 'syndication',
    tweet: {
      author: data.user?.name || data.name || '',
      handle: data.user?.screen_name ? `@${data.user.screen_name}` : '',
      text,
      createdAt: data.created_at || '',
      links: extractLinksFromText(text),
    },
    replies: [],
  };
}

async function readViaOembed(id) {
  const url = `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/i/status/${id}`)}`;
  const response = await fetchText(url, 10000);
  if (!response.ok) return { error: `oembed: HTTP ${response.status}` };
  const data = JSON.parse(response.text);
  const text = stripHtml(data.html || '');
  if (!text) return { error: 'oembed: empty tweet html' };
  return {
    source: 'oembed',
    tweet: {
      author: data.author_name || '',
      handle: '',
      text,
      createdAt: '',
      links: extractLinksFromText(text),
    },
    replies: [],
  };
}

async function readViaChromeCdp(id, url) {
  const endpoint = await findChromeEndpoint();
  if (!endpoint) return { error: 'chrome-cdp: no reachable DevTools endpoint' };

  let target = await findTarget(endpoint.port, id);
  if (!target) {
    await openCdpTarget(endpoint.port, url);
    await delay(5000);
    target = await findTarget(endpoint.port, id);
  }
  if (!target?.webSocketDebuggerUrl) {
    return { error: `chrome-cdp: no page target for ${id}` };
  }

  const page = await evaluateInTarget(target.webSocketDebuggerUrl, `(() => {
    const articles = [...document.querySelectorAll('article')].map((article, idx) => {
      const links = [...article.querySelectorAll('a[href]')]
        .map(a => ({ text: a.innerText, href: a.href }))
        .filter(x => x.href || x.text);
      const imgs = [...article.querySelectorAll('img[src]')]
        .map(img => ({ alt: img.alt, src: img.src }));
      return { idx, text: article.innerText, links, imgs };
    });
    return {
      url: location.href,
      title: document.title,
      bodyText: document.body?.innerText || '',
      articles
    };
  })()`);

  const mainArticle = page.articles?.find(a => a.links?.some(l => l.href?.includes(`/status/${id}`)))
    || page.articles?.[0];

  if (!mainArticle?.text) return { error: 'chrome-cdp: page loaded but no article text found' };

  const replies = (page.articles || [])
    .filter(a => a.idx !== mainArticle.idx)
    .map(articleToTweet)
    .filter(x => x.text);

  return {
    source: `chrome-cdp:${endpoint.port}`,
    tweet: articleToTweet(mainArticle),
    replies,
    page: {
      url: page.url,
      title: page.title,
    },
  };
}

function articleToTweet(article) {
  const lines = article.text.split(/\n+/).map(x => x.trim()).filter(Boolean);
  const author = lines[0] || '';
  const handle = lines.find(x => /^@/.test(x)) || '';
  const links = [];
  for (const link of article.links || []) {
    if (link.href && /\/status\/\d+|^https?:/.test(link.href)) links.push(link.href);
  }
  return {
    author,
    handle,
    text: article.text,
    links: [...new Set(links)],
    images: article.imgs || [],
  };
}

async function fetchText(url, timeoutMs) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120 Safari/537.36' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, text: '', error };
  }
}

async function findChromeEndpoint() {
  const candidates = [];
  for (const file of devToolsFiles()) {
    try {
      const [portLine, wsPath] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
      const port = Number(portLine);
      if (port) candidates.push({ port, wsPath, file });
    } catch {}
  }
  for (const port of [9222, 9229, 9333, 9444]) candidates.push({ port });

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.port)) continue;
    seen.add(candidate.port);
    const list = await cdpJson(candidate.port, '/json/list');
    if (Array.isArray(list)) return candidate;
  }
  return null;
}

function devToolsFiles() {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const files = [
    path.join(localAppData, 'Google', 'Chrome', 'User Data', 'DevToolsActivePort'),
    path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'DevToolsActivePort'),
  ];
  for (const envName of ['CHROME_USER_DATA_DIR', 'EDGE_USER_DATA_DIR']) {
    if (process.env[envName]) {
      files.unshift(path.join(process.env[envName], 'DevToolsActivePort'));
    }
  }
  return files;
}

async function cdpJson(port, route) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function findTarget(port, id) {
  const targets = await cdpJson(port, '/json/list');
  return targets?.find(t => t.url?.includes(id)) || null;
}

async function openCdpTarget(port, url) {
  await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
}

async function evaluateInTarget(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, { resolve, reject });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  }

  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    const promise = pending.get(message.id);
    if (!promise) return;
    pending.delete(message.id);
    if (message.error) promise.reject(new Error(JSON.stringify(message.error)));
    else promise.resolve(message.result);
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('WebSocket connection failed. Chrome may need --remote-allow-origins=*.'));
    setTimeout(() => reject(new Error('WebSocket connection timed out')), 8000);
  });

  await send('Runtime.enable');
  await delay(3000);
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  ws.close();
  return response.result.value;
}

function stripHtml(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractLinksFromText(text) {
  return [...new Set(String(text).match(/https?:\/\/\S+/g) || [])];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printHuman(data) {
  console.log(`Source: ${data.source}`);
  console.log(`Status: ${data.statusUrl}`);
  console.log('');
  console.log(`${data.tweet.author} ${data.tweet.handle}`.trim());
  console.log(data.tweet.text);
  if (data.tweet.links?.length) {
    console.log('\nLinks:');
    for (const link of data.tweet.links) console.log(`- ${link}`);
  }
  if (data.replies?.length) {
    console.log(`\nReplies (${data.replies.length} shown):`);
    for (const reply of data.replies.slice(0, 5)) {
      console.log(`\n${reply.author} ${reply.handle}`.trim());
      console.log(reply.text);
    }
  }
}

import "dotenv/config";
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GPTTERS_MCP_URL = "https://www.gpters.org/mcp-43q62kh1";
const POST_URL_PREFIX = `${GPTTERS_MCP_URL}/post/`;
const DEFAULT_SOCIAL_CHANNEL_ID = "C0B54FY9U80";
const MAX_POSTS = Number.parseInt(process.env.GPTERS_DIGEST_LIMIT || "10", 10);
const MAX_CANDIDATES = Number.parseInt(process.env.GPTERS_DIGEST_CANDIDATES || "14", 10);
const SLACK_CHUNK_LIMIT = 36000;

function getRequiredEnv(name) {
  const value = process.env[name] || readCodexFirecrawlKey(name);
  if (!value || value.includes("your_")) {
    throw new Error(`${name} is missing or still uses a placeholder value.`);
  }
  return value;
}

function readCodexFirecrawlKey(name) {
  if (name !== "FIRECRAWL_API_KEY") return undefined;

  const configPath = join(process.env.USERPROFILE || "", ".codex", "config.toml");
  try {
    const config = readFileSync(configPath, "utf8");
    const match = config.match(/FIRECRAWL_API_KEY\s*=\s*"([^"]+)"/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

async function firecrawl(path, payload) {
  const apiKey = getRequiredEnv("FIRECRAWL_API_KEY");
  const response = await fetch(`https://api.firecrawl.dev/v2/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { success: false, error: text };
  }

  if (!response.ok || body.success === false) {
    throw new Error(`Firecrawl ${path} failed: ${body.error || response.statusText}`);
  }

  return body.data || body;
}

function stripMarkdownImages(value) {
  return value.replace(/!\[[^\]]*]\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

function extractPostCards(markdown) {
  const start = markdown.indexOf("# MCP 활용");
  const scoped = start >= 0 ? markdown.slice(start) : markdown;
  const endMarkers = ["### 🔥 이 게시판", "읽고 나면 하나는 써먹게 되는 뉴스레터"];
  const endIndexes = endMarkers
    .map((marker) => scoped.indexOf(marker))
    .filter((index) => index > 0);
  const feed = endIndexes.length ? scoped.slice(0, Math.min(...endIndexes)) : scoped;

  const linkPattern = /\[([^\]\n]+)]\((https:\/\/www\.gpters\.org\/mcp-43q62kh1\/post\/[^)\s]+)\)/g;
  const matches = [];
  let match;
  while ((match = linkPattern.exec(feed)) !== null) {
    const title = stripMarkdownImages(match[1]);
    if (!title || title.length < 6 || title.includes("http")) continue;
    matches.push({
      title,
      url: match[2],
      index: match.index,
    });
  }

  const seen = new Set();
  return matches
    .map((item, position) => {
      const next = matches[position + 1]?.index ?? feed.length;
      const segment = feed.slice(item.index, next);
      const tail = segment.slice(-1800);
      const numbers = [...tail.matchAll(/(?:^|\n)\s*(\d+)\s*(?=\n|$)/g)].map((n) =>
        Number.parseInt(n[1], 10),
      );
      const likeCount = numbers.length >= 2 ? numbers[numbers.length - 2] : (numbers.at(-1) ?? 0);
      const commentCount = numbers.length >= 2 ? numbers[numbers.length - 1] : 0;
      const date = tail.match(/(20\d{2}\.\d{2}\.\d{2}\.)/)?.[1] || null;

      return {
        title: item.title,
        url: item.url,
        likeCount,
        commentCount,
        date,
        originalOrder: position,
      };
    })
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}

function cleanArticleMarkdown(markdown) {
  const withoutNewsletter = markdown.split("![GPTers Newsletter]")[0];
  const withoutComments = withoutNewsletter.split("\n좋아요\n")[0];
  const lines = withoutComments
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("[📶"))
    .filter((line) => !line.includes("MCP 활용에 게시됨"))
    .filter((line) => !line.match(/^좋아요|알림 받기|공유하기$/));

  return lines.join("\n").slice(0, 18000);
}

function canUseOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && !key.includes("your_"));
}

async function summarizeWithOpenAI(article) {
  if (!canUseOpenAI()) {
    throw new Error("OPENAI_API_KEY is required for Korean high-quality summaries.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || "medium" },
    input: [
      {
        role: "system",
        content:
          "너는 한국어 기술 콘텐츠 큐레이터다. 원문을 과장하지 말고, 실무자가 바로 이해할 수 있게 자세하지만 간결하게 요약한다.",
      },
      {
        role: "user",
        content: `아래 글을 한국어로 자세히 요약해줘. 형식은 3개 문단 이내로 유지하고, 핵심 문제/도구/진행 방식/결과/교훈을 포함해줘.\n\n${article.markdown}`,
      },
    ],
  });

  return response.output_text.trim();
}

function fallbackSummary(markdown) {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("["))
    .slice(0, 12);
  return lines.join(" ").slice(0, 900);
}

async function scrapeCategory() {
  const data = await firecrawl("scrape", {
    url: GPTTERS_MCP_URL,
    formats: ["markdown"],
    onlyMainContent: false,
    maxAge: 0,
    waitFor: 12000,
    actions: [
      { type: "wait", milliseconds: 5000 },
      { type: "scroll", direction: "down", fullPage: true },
      { type: "wait", milliseconds: 3000 },
      { type: "scrape" },
    ],
    proxy: "basic",
  });
  return data.markdown || "";
}

async function scrapeArticle(url) {
  const data = await firecrawl("scrape", {
    url,
    formats: ["markdown", "summary"],
    onlyMainContent: true,
    maxAge: 0,
    waitFor: 5000,
    timeout: 30000,
    proxy: "basic",
  });
  const rawMarkdown = data.markdown || "";
  const markdown = cleanArticleMarkdown(rawMarkdown);
  return {
    title: data.metadata?.title || markdown.match(/^#\s+(.+)$/m)?.[1] || url,
    markdown,
    summary: data.summary || "",
    ...extractArticleCounts(rawMarkdown),
    date: data.metadata?.publishedTime
      ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" }).format(
          new Date(data.metadata.publishedTime),
        )
      : null,
  };
}

async function mapPostUrls() {
  const data = await firecrawl("map", {
    url: GPTTERS_MCP_URL,
    search: "MCP Claude Code Manus Airtable Context7 스킬",
    limit: 50,
    sitemap: "include",
    ignoreQueryParameters: true,
  });

  return [
    ...new Set(
      (data.links || [])
        .map((link) => link.url)
        .filter((url) => url?.startsWith(POST_URL_PREFIX)),
    ),
  ];
}

function extractArticleCounts(markdown) {
  const beforeLike = markdown.split(/\n좋아요\n/)[0] || markdown;
  const tailLines = beforeLike
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12);

  let likeCount = 0;
  let commentCount = 0;

  for (let index = tailLines.length - 1; index >= 0; index -= 1) {
    const commentMatch = tailLines[index].match(/^(\d+)개의 답글$/);
    if (commentMatch) {
      commentCount = Number.parseInt(commentMatch[1], 10);
      continue;
    }
    if (/^\d+$/.test(tailLines[index])) {
      likeCount = Number.parseInt(tailLines[index], 10);
      break;
    }
  }

  return { likeCount, commentCount };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    const batchResults = await Promise.allSettled(batch.map(mapper));
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error(result.reason?.message || result.reason);
      }
    }
  }
  return results;
}

function formatDigest(posts) {
  const today = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
  }).format(new Date());

  const lines = [
    `*GPTers MCP 활용 좋아요 상위 ${posts.length}개 요약*`,
    `기준: ${today} 오전 6:30 자동 수집`,
    `출처: ${GPTTERS_MCP_URL}`,
    "",
  ];

  for (const post of posts) {
    lines.push(
      `*${post.rank}. ${post.title}*`,
      `좋아요 ${post.likeCount} / 댓글 ${post.commentCount}${post.date ? ` / ${post.date}` : ""}`,
      post.url,
      post.summary,
      "",
    );
  }

  return lines.join("\n");
}

function chunkMessage(message) {
  if (message.length <= SLACK_CHUNK_LIMIT) return [message];

  const chunks = [];
  let rest = message;
  while (rest.length > SLACK_CHUNK_LIMIT) {
    const splitAt = rest.lastIndexOf("\n\n", SLACK_CHUNK_LIMIT);
    const index = splitAt > 1000 ? splitAt : SLACK_CHUNK_LIMIT;
    chunks.push(rest.slice(0, index));
    rest = rest.slice(index).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function postToSlack(message) {
  const token = getRequiredEnv("SLACK_BOT_TOKEN");
  const channel = process.env.SLACK_SOCIAL_CHANNEL_ID || DEFAULT_SOCIAL_CHANNEL_ID;
  let threadTs;

  for (const [index, chunk] of chunkMessage(message).entries()) {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel,
        text: index === 0 ? chunk : `*GPTers MCP 활용 요약 계속 (${index + 1})*\n\n${chunk}`,
        thread_ts: threadTs,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const body = await response.json();
    if (!body.ok) throw new Error(`Slack post failed: ${body.error}`);
    threadTs ||= body.ts;
  }
}

async function main() {
  if (!canUseOpenAI()) {
    throw new Error("OPENAI_API_KEY is required for Korean high-quality summaries.");
  }

  const categoryMarkdown = await scrapeCategory();
  const cards = extractPostCards(categoryMarkdown);
  const mappedUrls = cards.length < MAX_POSTS ? await mapPostUrls() : [];
  const candidates = [
    ...cards,
    ...mappedUrls.map((url, index) => ({
      title: url,
      url,
      likeCount: 0,
      commentCount: 0,
      date: null,
      originalOrder: cards.length + index,
    })),
  ].filter((post, index, posts) => posts.findIndex((item) => item.url === post.url) === index);

  if (!candidates.length) throw new Error("No GPTers MCP post cards were extracted.");

  const summarized = await mapWithConcurrency(candidates.slice(0, Math.max(MAX_POSTS, MAX_CANDIDATES)), 3, async (post) => {
    const article = await scrapeArticle(post.url);
    const summary = await summarizeWithOpenAI({ ...post, ...article });
    return {
      ...post,
      title: article.title,
      likeCount: article.likeCount || post.likeCount || 0,
      commentCount: article.commentCount || post.commentCount || 0,
      date: article.date || post.date,
      summary,
    };
  });

  const topSummarized = summarized
    .sort((a, b) => b.likeCount - a.likeCount || a.originalOrder - b.originalOrder)
    .slice(0, MAX_POSTS)
    .map((post, index) => ({ ...post, rank: index + 1 }));

  const message = formatDigest(topSummarized);
  if (process.env.GPTERS_DRY_RUN === "1") {
    console.log(message);
    return;
  }

  await postToSlack(message);
  console.log(`Posted ${topSummarized.length} GPTers MCP summaries to Slack.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

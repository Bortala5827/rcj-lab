# RCJ Lab · Independent Digital Studio & Product Portal

> English · 日本語 · 中文 — the homepage and navigation hub of the RCJ product
> ecosystem, built on Cloudflare Pages. Ten real products, one bench.

**Live site:** https://955827.xyz

RCJ Lab is an independent one-person studio. It is fully localized in **English,
Japanese, and Chinese**, so visitors from anywhere can use it without a language
barrier — no account or region lock. The current design is **"Drafting Desk"**
(2026-10-25): a paper-blueprint aesthetic with self-hosted Instrument Serif +
Space Mono, an SVG product-ecosystem blueprint (10 nodes), and a three.js
wireframe hero that falls back to static SVG.

## Core mechanics (核心原理)

- **主站 = 中枢，不是内容站**：主站定位管理 / 数据 / 品牌中枢，**不做内容导航入口**（内容走 exam / speak / blog，变现走 shop / voice）。首屏产品矩阵按「功能与展示」分组，voice / voicecard 等新卡随生态扩展而增删。
- **全局 AI 网关 `/api/ai-chat`**：全生态（blog / exam / speak / support 等）的 AI 助手统一调用主站这一个端点，**模型 / 渠道密钥只存在主站 secrets**，子站零密钥；改模型 / 换渠道只改主站一处。
- **三语一源**：EN / 日本語 / 中文由 i18n 字典驱动，单文件切换；所有页面零构建、纯静态，Cloudflare Pages 全球分发。
- **隐私优先**：无追踪、最小化数据收集；D1 只存匿名埋点、订单与手记，不存个人可识别信息。
- **矩阵关系**（内容与变现分离）：主站管理全局 → exam 内容中枢 → speak 讲话系列 → shop 变现窗口 → voice 声音定制（展示）→ dinner / facetalk / voicecard 独立产品线 → support 客服系统可被全局调用 → rcj-stack 建站模板。

## What's inside

### Product matrix (10 live products)

| No. | Product | Link | What it does |
| --- | --- | --- | --- |
| 01 | **Exam Hub** | https://exam.955827.xyz | Bank · cards · interview · tutorials |
| 02 | **FaceTalk** | https://facetalk.955827.xyz | 60s voice audition · mutual match · burn after reading |
| 03 | **voicecard** | https://card.955827.xyz | Record a voice clip → link → resume |
| 04 | **Blog** | https://blog.955827.xyz | Essays · dev notes · showcase |
| 05 | **Speak** | https://speak.955827.xyz | SoloSpeak · LetOut speaking series |
| 06 | **Dinner for You** | https://dinner.955827.xyz | Invite-code ordering · songs · email |
| 07 | **Voice** | https://voice.955827.xyz | Chinese female voice · previews · custom |
| 08 | **Shop** | https://shop.955827.xyz | Custom banks · done-for-you sites |
| 09 | **Support** | https://support.955827.xyz | Chat widget · Telegram |
| 10 | **RCJ Stack** | https://rcj-stack-9xe.pages.dev | Zero-fee SaaS kit · MIT |

### Site pages

| Path | What it does |
| --- | --- |
| `/` | Brand lab, personal homepage, product blueprint / index, AI & LLM API navigation |
| `/api` | Curated navigation of large-model / LLM API providers |
| `/assets` | Shared asset directory |
| `/principles` | Operating principles |
| `/note.html` | Handwritten-note style page |
| `/admin.html` | Private admin console (D1 stats / orders / wall) |

## Backend (Pages Functions + D1 + R2)

- `functions/api/ai-chat.js` — the ecosystem-wide AI gateway; all sibling sites call it.
- `functions/api/track.js` · `stats.js` — anonymous visit tracking + dashboard stats.
- `functions/api/notes.js` — handwritten notes.
- `functions/api/sing.js` + `sing/audio/[id].js` — "Sing to Me" recordings (R2 binding `SING_R2`).
- `functions/api/admin/*` — login / data / health / migrate / order / wall / notify-test.
- D1 bindings: `DB` (`rcj-analytics-d1`, shared analytics / orders / notes) and
  `FACETALK_DB` (`mianshi-dazi-d1`).

## Highlights

- ⚡ Static, zero-build site served by Cloudflare Pages (global CDN, fast everywhere)
- 🌐 Built-in i18n — English / Japanese / Chinese out of the box
- 🔒 Privacy-first: no tracking, minimal data collection
- 📱 Mobile-friendly, responsive layout
- 🖋 "Drafting Desk" design language — blueprint grid, paper texture, self-hosted fonts

## Tech stack

- Cloudflare Pages (static hosting + Pages Functions)
- Cloudflare D1 (bindings `DB` / `FACETALK_DB`) + Cloudflare R2 (`SING_R2`)
- Plain HTML / CSS / vanilla JS
- Dictionary-driven `i18n` localization
- three.js (self-hosted) wireframe hero, SVG product blueprint

## Local development

```bash
# any static server works; e.g.
npx wrangler pages dev .
```

Edit `index.html` or `assets/` → commit to `main` →
Cloudflare Pages deploys automatically. Hard-refresh (Ctrl / Cmd+F5) to clear cache.

## Deploy

- Cloudflare Pages project `rcj-lab`, production branch `main`, build output `.`,
  no build step.
- Bindings are configured in the Pages dashboard (D1 `DB` / `FACETALK_DB`, R2 `SING_R2`);
  `wrangler.toml` documents the expected names.
- Custom domain `955827.xyz`.

## Part of the RCJ ecosystem

- Speak Series (SoloSpeak · LetOut) — https://speak.955827.xyz
- Exam Hub — https://exam.955827.xyz
- FaceTalk — https://facetalk.955827.xyz
- Voicecard — https://card.955827.xyz
- Blog (tech articles & project showcase) — https://blog.955827.xyz
- Voice (a cappella previews & custom voice gifts) — https://voice.955827.xyz
- Supportly (customer support) — https://support.955827.xyz
- Shop (storefront — custom question banks & done-for-you websites) — https://shop.955827.xyz
- Dinner for You (couple-order system) — https://dinner.955827.xyz
- RCJ Stack (site-building template & live demo) — https://rcj-stack-9xe.pages.dev

---

© RCJ. Deployed on Cloudflare Pages.

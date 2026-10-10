# RCJ Lab · Multilingual Brand & Product Portal

> English · 日本語 · 中文 — a minimal, fast personal brand lab and product portal,
> built on Cloudflare Pages. The single entry point to the RCJ product ecosystem.

**Live site:** https://955827.xyz

RCJ Lab is the homepage and navigation portal for a small family of focused web tools.
It is fully localized in **English, Japanese, and Chinese**, so visitors from
anywhere can use it without a language barrier — no account or region lock.

## Core mechanics (核心原理)

- **主站 = 中枢，不是内容站**：主站定位管理 / 数据 / 品牌中枢，**不做内容导航入口**（内容走 exam / speak / blog，变现走 shop / voice）。首屏产品矩阵按「功能与展示」分组，voice / voicecard 等新卡随生态扩展而增删。
- **全局 AI 网关 `/api/ai-chat`**：全生态（blog / exam / speak / support 等）的 AI 助手统一调用主站这一个端点，**模型 / 渠道密钥只存在主站 secrets**，子站零密钥；改模型 / 换渠道只改主站一处。
- **三语一源**：EN / 日本語 / 中文由 i18n 字典驱动，单文件切换；所有页面零构建、纯静态，Cloudflare Pages 全球分发。
- **隐私优先**：无追踪、最小化数据收集；D1 只存匿名埋点。
- **矩阵关系**（内容与变现分离）：主站管理全局 → exam 内容中枢 → speak 讲话系列 → shop 变现窗口 → voice 声音定制（展示）→ dinner / facetalk 独立产品线 → support 客服系统可被全局调用。

## What's inside

| Product | Path | What it does |
| --- | --- | --- |
| **RCJ Lab** | `/` | Brand lab, personal homepage, and AI / LLM API navigation |
| **API Portal** | `/api` | Curated navigation of large-model / LLM API providers |
| **Assets** | `/assets` | Shared asset directory |
| **Principles** | `/principles` | Operating principles |

All front-end surfaces are **trilingual (EN / 日本語 / 中文)** and switch languages
with a single click.

## Highlights

- ⚡ Static, zero-build site served by Cloudflare Pages (global CDN, fast everywhere)
- 🌐 Built-in i18n — English / Japanese / Chinese out of the box
- 🔒 Privacy-first: no tracking, minimal data collection
- 📱 Mobile-friendly, responsive layout

## Tech stack

- Cloudflare Pages (static hosting + Functions)
- Plain HTML / CSS / vanilla JS
- Dictionary-driven `i18n` localization

## Local development

```bash
# any static server works; e.g.
npx wrangler pages dev .
```

Edit `index.html` or `assets/` → commit to `main` →
Cloudflare Pages deploys automatically. Hard-refresh (Ctrl / Cmd+F5) to clear cache.

## Part of the RCJ ecosystem

- Speak Series (SoloSpeak · LetOut) — https://speak.955827.xyz
- Exam Hub — https://exam.955827.xyz
- FaceTalk — https://facetalk.955827.xyz
- Supportly (customer support) — https://support.955827.xyz
- Shop (storefront — custom question banks & done-for-you websites) — https://shop.955827.xyz
- Dinner for You (couple-order system) — https://dinner.955827.xyz
- RCJ Stack (site-building template & live demo) — https://rcj-stack-9xe.pages.dev
- Blog (tech articles & project showcase) — https://blog.955827.xyz

---

© RCJ. Deployed on Cloudflare Pages.

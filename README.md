# RCJ Lab · Multilingual Brand & Product Portal

> English · 日本語 · 中文 — a minimal, fast personal brand lab and product portal,
> built on Cloudflare Pages. The single entry point to the RCJ product ecosystem.

**Live site:** https://955827.xyz

RCJ Lab is the homepage and navigation portal for a small family of focused web tools.
It is fully localized in **English, Japanese, and Chinese**, so visitors from
anywhere can use it without a language barrier — no account or region lock.

## What's inside

| Product | Path | What it does |
| --- | --- | --- |
| **RCJ Lab** | `/` | Brand lab, personal homepage, and AI / LLM API navigation |
| **LetOut** (大声说) | `speak.955827.xyz/letout` | "Speak out" — 已迁至 speak 系列站 |
| **SoloSpeak** (独声) | `speak.955827.xyz/solospeak` | "Solo voice" — 已迁至 speak 系列站 |
| **API Portal** | `/api` | Curated navigation of large-model / LLM API providers |
| **Assets** | `/assets` | Shared asset directory |

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

Edit `index.html`, `letout/`, `solospeak/`, or `assets/` → commit to `main` →
Cloudflare Pages deploys automatically. Hard-refresh (Ctrl / Cmd+F5) to clear cache.

## Part of the RCJ ecosystem

- Exam Hub — https://exam.955827.xyz
- FaceTalk — https://facetalk.955827.xyz
- Supportly (customer support) — https://support.955827.xyz
- Shop (storefront — custom question banks & done-for-you websites) — https://shop.955827.xyz
- Dinner for You (couple-order system) — https://dinner.955827.xyz
- RCJ Stack (site-building template & live demo) — https://rcj-stack-9xe.pages.dev

---

© RCJ. Deployed on Cloudflare Pages.

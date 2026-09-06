# RCJ Lab · 标准 Web 自动化测试体系

本仓库内置一套标准 Web 自动化测试体系，覆盖 **冒烟 / 功能 / 控制台 / 网络 / 无障碍 / 性能**，并接入 **GitHub Actions** 做每次 push / PR 的回归。

> 设计原则：**用真实浏览器测真实网站**。本地用你本机已装的 **Google Chrome**；CI 用 GitHub Actions 自带环境。不为了通过而删测试、跳过错误、隐藏 Console error、忽略 404、禁用功能或删业务代码。

---

## 一、浏览器策略（关键）

| 环境 | 浏览器 | 说明 |
|---|---|---|
| 本地（WorkBuddy / 你本机） | **真实 Google Chrome** | 通过 Playwright `channel: "chrome"` 调用，**绝不下载 Playwright 自带 Chromium** |
| CI（GitHub Actions） | Actions 自带 `chromium` + `setup-chrome` | CI 无你的本机 Chrome，由 Actions 自行安装测试环境 |

切换逻辑在 `playwright.config.ts`：

```ts
const useChromeChannel = !isCI; // 本地用本机 Chrome，CI 用 chromium
projects: [{
  name: 'chrome',
  use: { ...devices['Desktop Chrome'], ...(useChromeChannel ? { channel: 'chrome' } : {}) },
}]
```

> 本地若 Chrome 不在默认路径，Playwright 会报错；此时按实际路径在 `launchOptions.executablePath` 指定，**不得擅装新浏览器**（用户铁律）。

---

## 二、测试分层

### 1. Playwright Smoke + 功能（`tests/smoke.spec.ts`）
覆盖：
- **页面**：每个目标页可打开、HTTP 状态 < 400、`<title>` 非空、主体有可见内容。
- **导航**：首页主导航内部链接可达；子路径（`/training/`）；speak 系列已迁至 speak.955827.xyz可达且刷新后保持一致。
- **功能（不虚构）**：SoloSpeak / LetOut 的麦克风音频能力（用假设备 `--use-fake-device-for-media-stream`，授权下能获取轨道）。
- **Console**：`console.error` / `pageerror` 实时收集，失败即报错（明确标记的除外）。
- **Network**：`requestfailed`、响应 `>= 400` 的失败请求实时收集。

失败自动保存：截图（`only-on-failure`）+ Trace（`retain-on-failure`）+ 视频（`retain-on-failure`），并生成 Playwright HTML Report。

### 2. axe-core 无障碍（`tests/axe.spec.ts`）
对 rcj-hub 自身承载的所有页面（`RCJ_HUB_PAGES` 中带 `path` 的项）跑 `@axe-core/playwright`：
- tags：`wcag2a` / `wcag2aa` / `wcag21a` / `wcag21aa`
- 覆盖：button / input / label / heading / link / ARIA / 对比度 / 重复 id / 结构
- 原则：**不为了让测试通过而关闭真实问题**，任何违规如实失败并附完整清单。改进应回到产品代码，而非在规则里 `exclude`。

### 3. Lighthouse CI（`.lighthouserc.js` + `scripts/lhci-serve.mjs`）
检查 **Performance / Accessibility / Best Practices / SEO**。
- 第一阶段用 `warn` 阈值（见下），目的是**发现真实低分项并报警，不阻断构建**，绝不为了 100 分改产品。
- 外部托管模式：由 `scripts/lhci-serve.mjs` 自起 `http-server` 于 `4200`，跑完自动 `kill`，避免遗留僵尸进程占用端口。
- 报告保存到 `./lighthouse-report/`（不接 LHCI 服务器，纯本地查看）。

---

## 三、测试目标站点（`tests/sites.ts` — 单一事实来源）

`RCJ_HUB_PAGES`：rcj-hub 仓库自身承载的主站 + 子路径（可在本地静态服务下测，也可指线上域名）。

| 页面 | 路径 | 备注 |
|---|---|---|
| RCJ Hub 首页 | `/` | RCJ Lab 品牌枢纽 |
| 资产库页 | `/assets.html` | 七段结构 Asset Hub |
| 归档页 | `/archive.html` | |
| 原则页 | `/principles.html` | |
| SoloSpeak | `speak.955827.xyz/solospeak/` | 含音频 |
| LetOut | `speak.955827.xyz/letout/` | 含音频 |
| 训练指南内容页 | `/training/` | |

`ECOSYSTEM_LIVE`：生态内独立子站（不同仓库 / 子域），仅本地显式 `TEST_LIVE_ECOSYSTEM=1` 时纳入（CI 默认不命中线上站点）。

`KNOWN_RUNTIME_PATHS = ['/api/', '/cdn-cgi/']`：CF Pages Functions 运行时依赖（如 `/api/track` 埋点 beacon）。本地静态服务 / 跨源测试下这些请求会失败，但线上经 curl 实测返回 200 —— **属环境依赖而非站点 Bug，明确标记、不计入失败**（监听器中按 location URL 排除，不静默忽略）。

---

## 四、本地运行命令

```bash
# 1) 安装依赖（首次）
npm install

# 2) 冒烟 + 功能测试（本地用本机真实 Chrome）
npm test                 # 等同 playwright test，托管 http-server 于 4173
npm run test:smoke       # 仅冒烟用例
npm run test:axe         # 仅无障碍
npm run test:headed      # 有头模式，肉眼看

# 3) 测线上站点（改用真实 Google Chrome 打 955827.xyz，并纳入子站）
npm run test:live        # BASE_URL=https://955827.xyz TEST_LIVE_ECOSYSTEM=1

# 4) Lighthouse CI（先起 4200 静态服务，再自动跑 + 清理）
npm run lighthouse       # = node scripts/lhci-serve.mjs

# 5) 看报告
#    Playwright HTML Report → playwright-report/index.html
#    Lighthouse             → lighthouse-report/ 目录
```

---

## 五、GitHub Actions（`.github/workflows/test.yml`）

触发：`push` / `pull_request` 到 `main`。

步骤：
1. Checkout
2. Setup Node.js 22（npm 缓存）
3. `npm ci`
4. 安装 Playwright Chromium（CI 自带浏览器，不连本机 Chrome）
5. 安装 Google Chrome（`browser-actions/setup-chrome@v1`，供 Lighthouse 用）
6. Playwright Smoke + 功能（`CI=true`）
7. axe-core 无障碍（`CI=true`）
8. Lighthouse CI（自起 `http-server -p 4200`，`npx lhci autorun`，结束 `kill`）
9. 保存报告 artifact（`playwright-report/` `test-results/` `.lighthouseci/`，保留 14 天）

> ⚠️ **本工作流只做测试 / 验收，不部署生产环境。** Cloudflare Pages 正式部署流程（`git push main` → CF 自动构建）保持不变，没有任何部署步骤。

---

## 六、已知真实问题（按"不掩埋"原则如实登记）

### axe-core 无障碍（真实缺陷，待产品侧修复）
全部 7 页的唯一违规类型是 **`color-contrast`（serious）**，节点数：

| 页面 | 对比度违规节点数 |
|---|---|
| 首页 | 9 |
| 资产库页 | 66 |
| 归档页 | 38 |
| 原则页 | 0 |
| SoloSpeak | 19 |
| LetOut | 1 |
| 训练指南 | 7 |

涉及低频低对比色：`#94a3b8`(对比 2.56)、`#1e88e5`(3.67)、`#64748b`(4.47) 等。

- **现状**：测试如实失败（CI 报警），**未自动修复** —— 涉及品牌配色系统与跨多文件约 140 节点，属设计决策。
- **建议**：在 `hub.v2.css` 与各页 CSS 统一收紧这些辅助文字色到 WCAG AA（正文 4.5:1 / 大字 3:1），改完重跑 `npm run test:axe` 复核。
- **注意**：Lighthouse 的 Accessibility 分数（首页 100 / 资产库 93）比 axe 宽松，二者互补符合预期；以 axe 的细项违规为准。

### CF Functions 运行时（`/api/track`）
本地静态服务下 `https://955827.xyz/api/track` 会 `ERR_CONNECTION_CLOSED`，但线上 curl 实测 200。已按 `KNOWN_RUNTIME_PATHS` 排除，**不计失败、不静默**。

---

## 七、新增依赖

```jsonc
// devDependencies
"@axe-core/playwright": "^4.10.0",
"@lhci/cli": "^0.13.0",
"@playwright/test": "^1.48.0",
"cross-env": "^7.0.3",
"http-server": "^14.1.1"
// dependencies（防止沙箱 npm cleanup 抽空代理依赖）
"proxy-agent": "^6.3.1"
```

---

## 八、文件清单

| 文件 | 作用 |
|---|---|
| `playwright.config.ts` | 浏览器策略（chrome channel / CI 切换）、webServer、失败保存 |
| `tests/sites.ts` | 站点清单（单一事实来源）、运行时路径白名单 |
| `tests/smoke.spec.ts` | 冒烟 + 功能 + 控制台 + 网络 |
| `tests/axe.spec.ts` | 无障碍（axe-core） |
| `.lighthouserc.js` | Lighthouse CI 配置（外部托管、warn 阈值） |
| `scripts/lhci-serve.mjs` | 自起 4200 服务、跑 LHCI、自动清理 |
| `.github/workflows/test.yml` | CI 回归（测试 / 验收，不部署） |
| `.gitignore` | 忽略 `node_modules/` `playwright-report/` `test-results/` `tests/screenshots/` `tests/traces/` `.lighthouseci/` `lighthouse-report/`（保留 `package-lock.json`） |

---

## 九、复用与归档

本体系已作为可复用资产归档到 **`rcj-assets` 资产库**（`skills/rcj-web-testing/`），模板文件可直接复制到任意 RCJ 项目。新增站点只需改 `tests/sites.ts`，无需动测试逻辑。

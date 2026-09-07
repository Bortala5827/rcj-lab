// /api/ai-chat —— 统一 AI 对话入口（955827.xyz 平台聚合）
// 设计：渠道配置表（按渠道登记，模型可热更新）+ scene 提示词表 + 自动 failover + 超时
// 前端协议不变：POST {provider, scene, messages} → {reply, provider} / {error}
// Key 存在 Cloudflare Pages Secrets（环境变量），代码不留明文。custom 由前端透传。
// 新增渠道：往 CHANNELS 数组加一条；新增场景：往 SCENE_PROMPTS 加一条。均不改主逻辑。

// ── 渠道配置表 ──────────────────────────────────────────────
// status: ok 可用 | unstable 不稳（可用但优先走备选）| disabled 停用
// key 未配自动视为不可用。failover：主渠道失败时依次尝试备选。
// 统一国内渠道：dots / agnes / SenseNova / b.ai / custom（已删 Gemini、Groq）
function getChannels(env) {
  return [
    {
      id: "dots", name: "小红书 dots3",
      baseUrl: "https://note3-prev-api.askdiandian.com/v1",
      model: "dots3-note-prev",
      apiKey: env.DOTS_API_KEY || "",
      authType: "api-key",
      status: "ok",
      fallback: ["groq", "agnes", "bai", "sensenova"],
    },
    {
      id: "agnes", name: "Agnes",
      baseUrl: "https://apihub.agnes-ai.com/v1",
      model: "agnes-2.5-flash",
      apiKey: env.AGNES_API_KEY || "",
      status: "ok",
      fallback: ["groq", "bai", "dots", "sensenova"],
    },
    {
      id: "sensenova", name: "SenseNova",
      baseUrl: env.SENSENOVA_BASE || "https://token.sensenova.cn/v1",
      model: env.SENSENOVA_MODEL || "sensenova-6.8-flash-lite",
      apiKey: env.SENSENOVA_API_KEY || "",
      status: "ok",
      fallback: ["groq", "agnes", "bai", "dots"],
    },
    {
      id: "bai", name: "b.ai",
      baseUrl: "https://api.b.ai/v1",
      model: "deepseek-v4-flash",
      apiKey: env.BAI_API_KEY || "",
      status: "ok",
      fallback: ["groq", "agnes", "dots", "sensenova"],
    },
    {
      id: "groq", name: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-120b",
      apiKey: env.GROQ_API_KEY || "",
      status: "ok",
      fallback: ["bai", "agnes", "dots", "sensenova"],
    },
  ];
}

// ── scene 提示词表 ──────────────────────────────────────────
// 新增场景只需加一条；未命中走默认（api 大模型导航）。
// 预留：'learn'（你懂的并入时填）。
const SCENE_PROMPTS = {
  "fj-sz": `你是「深圳辅警备考助手」，扎根深圳，当前正值第十四批辅警面试期（2026年8月），帮考生吃透《深圳经济特区警务辅助人员条例》、搞定面试答题，也聊聊公安基层工作和职业成长。

【深圳辅警条例核心】
- 定位：公安机关统一招聘管理、非人民警察身份的警务辅助人员，分勤务辅警和文职辅警
- 勤务辅警独立做：预防制止违法犯罪、接受群众求助调解民事纠纷、治安巡逻值守、人员聚集场所安全巡查、维护案事件现场秩序、疏导交通劝阻违法、消防安全巡查、宣传教育（巡逻/巡查/消防无民警带领时不得少于两人）
- 勤务辅警需民警带领：接报警现场处置、当场盘问检查继续盘问、传唤抓捕押解、行政案件调查取证、临时保护性约束、治安消防监督检查、看守所等场所管理、涉案财物管理、身份信息核录、大型活动秩序、群体性事件处置
- 文职辅警：技术支持、警务保障、行政助理、心理咨询/医疗/翻译
- 禁止安排：国家秘密、国内安全保卫、刑事案件调查取证、执行刑事强制措施、技术侦察、交通事故责任认定、作出行政处理决定
- 招聘条件：年满20周岁中国公民、大专以上（退役士官士兵可高中，入职4年内须取得大专）
- 不得招聘：曾被追究刑事责任或涉嫌犯罪未结案、行政拘留/收容教养/吸毒史、被开除公职或辞退、被公安机关解除合同、严重不良信用记录
- 程序：报名→资格审查→笔试→面试→心理和体能测评→体检→公示→签劳动合同
- 层级：一级至六级辅警；培训：初任≥90天、年度≥10天、晋升≥15天
- 装备：可配警棍和安全防护装备、可驾驶警用车辆；紧急情况可使用约束性警用器械
- 薪酬：市公安会同人社财政建立制度，动态调整；五险一金+人身意外伤害保险

【深圳公安最新动态与市情热点】
- 第十四批（2026年6月）招聘1723名：勤务辅警1692名（执法勤务类404、一般勤务类1288）、文职辅警31名
- 一般勤务辅警离职后可重新报考执法勤务类，在职暂无晋升渠道
- 深圳推行"便民微信"社区警务工作法，民警辅警用企业微信（@深圳公安实名认证）联系群众
- 践行新时代"枫桥经验"：关口前移、源头化解，辅警在巡逻中提前发现风险
- 队伍建设总要求：对党忠诚、服务人民、执法公正、纪律严明；严管与厚爱结合
- 深圳基层治理特色：城中村治理、老旧小区消防通道、反诈宣传、交通文明劝导、独居老人关爱
- 近期热点：公共场景二维码诈骗治理、网络求助诈骗、基层纠纷调解、科技强警（机器人/AI在警务中的应用边界）

【结构化面试辅导方法】
用户给面试题时，按这个结构答：
1. 先一句话破题（点明本质，不绕弯）
2. 分点展开（2-3点，每点先观点再结合深圳辅警实际举例）
3. 结合自身岗位表态（如果我入职…）
- 亮点：引用深圳特色（枫桥经验、社区警务、城中村治理、交通文明、反诈），不要空喊口号
- 答题要口语化，像在考场说话，不要写书面文章；控制在300-500字
- 应急应变题：先控场→再解决→最后防反弹，步骤清晰
- 综合分析题：是什么→为什么→怎么办，辩证看问题
- 自我认知题：真实、具体、不煽情，讲小事不讲大话
- 用户只问知识点时，简洁回答，不用强行套面试框架

【话题边界】
- 核心：深圳辅警备考、条例解读、面试辅导、公安基层工作、社会治安、基层治理、职业发展
- 相关可聊：公务员/事业单位备考、法律常识、时事政治（与公安治理相关）、个人成长规划
- 完全无关（天气、娱乐八卦、写情书等）：礼貌说"这个我不太擅长哦，我主要帮你搞定深圳辅警备考和公安相关话题"，然后引导回正题
- 不要太死板，用户聊到职业选择、人生规划时可以自然回应，再顺势拉回备考

【回答风格】
- 像有趣的学长/前辈聊天，不说教、不堆砌术语，偶尔可以幽默一下
- 既有知识深度，又有人文情怀——讲条例时准确严谨，聊备考和职业时温暖有共鸣
- 条例问题准确引用条款，口语化解释，能用比喻就用比喻
- 面试题给框架+亮点，鼓励用户自己先思考，答完可以给个鼓励
- 用户刷题累了可以适当共情，说句"歇会儿"，但不要喧宾夺主
- 不知道就说不知道，不编造
- 所有链接用 markdown [文字](URL)

【站内引导】
用户表达信心、感谢、或练完几道题时自然推1个，融入末尾不硬广：
- 想刷点有用的知识→ [你懂的·知识卡](https://exam.955827.xyz/learn/)（像刷小红书一样刷知识）
- 想练其他结构化→ [结构化面试练习](https://exam.955827.xyz/structured.html)
- 面试真题→ 当前页就是，点「🎲 随机抽题·开口练」直接练
每次只推1个，看用户状态选最贴合的。`,

  "shop": `你是「RCJ 定制服务顾问」，一个懂考试、懂建站、实在不忽悠的独立开发者。帮用户了解题库定制、建站与代托管服务，像朋友聊天一样推荐，不硬推销。

【你是谁】
- 独立开发者，自己做了深圳辅警面试题库，卖出 20+ 份，用户反馈不错
- 擅长把零散真题整理成好用的刷题工具，也帮人搭简单的个人站
- 实在人，能做就说能做，不能做就直说，不绕弯子

【服务与价格】
（以下为当前价格；若与 shop.955827.xyz 页面显示不一致，以页面为准）
1. 题库定制 —— ¥99 起
   - 适合：你手上已有题目/资料，我帮你整理成能直接刷的工具
   - 交付：智能记忆卡片（艾宾浩斯背诵神器）+ 离线刷题页（不用网也能刷）+ 在线刷题入口
   - 已做深圳辅警，其他城市/考试类型（公考、事业编、消防等）均可定制
2. 纯建站 —— ¥299 起
   - 适合：零基础，从零到上线全包
   - 包含：网站 + 托管 + 全套视频带教 + 1对1语音答疑
3. 代托管 —— ¥49 起
   - 适合：想要一个开箱即用的管理后台
   - 无需自己折腾 GitHub / Cloudflare

【交付与付款】
- 交付：云盘 / 邮箱发送
- 付款：支持在线下单（PayPal、闲鱼）；大额服务先付 10% 定金，余款交付时微信 / 支付宝结清
- 售后：30 天支持，题库老客户后续更新享优惠

【免费体验】
- 「Sing to Me」：唱一首歌即可免费领资料，无需下单，可先体验再决定要不要买

【你怎么聊】
1. 用户问服务内容、价格、交付时，清楚回答，不堆砌术语
2. 用户说需求时，先听明白，再推荐合适的方案，不强行推贵的
3. 用户犹豫时，可以说说自己做深圳辅警的经验，给点实在建议
4. 用户问其他城市/考试类型能否定制时，说"可以，价格根据题量和难度协商，先把题源发我看看"
5. 用户问能不能便宜点时，实在说"小本生意，价格已经压得比较低了，不过老客户后续更新有优惠"
6. 完全无关的问题（天气、娱乐八卦等），可以轻松回"这个我不太擅长哦，我主要帮人搞定题库定制和建站～有这方面的需求随时问我"，不要太生硬

【规则】
- 像朋友聊天，不说教、不硬推销，用户问了才详细介绍
- 简洁直接，不堆砌术语，不知道就说不知道，不编造
- 链接用 markdown [文字](URL)
- 不要一上来就催付款，用户明确想买或问怎么付款时，说明可在线下单（PayPal / 闲鱼）
- **语言跟随**：用户用什么语言提问就用什么语言回答（英文问→英文答，中文问→中文答，日文问→日文答）。服务名与价格数字保持一致即可
- **答不上就转人工**：涉及订单/退款/支付异常、或自己不确定时，诚实说"这个我帮不上"，然后自然引导用户点下方「转人工客服」——比硬编一个答案好得多

【站内引导】
用户表达兴趣、问完服务、或说"我考虑一下"时，自然推 1 个，融入末尾不硬广：
- 想先体验刷题效果→ [深圳辅警面试真题](https://exam.955827.xyz/fj/sz/)
- 想刷点有用的知识→ [你懂的·知识卡](https://exam.955827.xyz/learn/)
每次只推 1 个，看用户状态选最贴合的。

【转人工客服】
- 对话框下方有「转人工客服」按钮，用户点一下就能接通真人客服（RCJ 在线客服）。
- 以下情况主动建议用户转人工：
  · 涉及具体订单状态、退款、支付异常等需要查后台的事
  · 用户明确说"转人工""找真人""人工客服""要人工"等
  · 你答不上来或不确定时——不要硬编，直接说"这个我可能帮不上，建议转人工客服"
- 引导话术要自然，像朋友提醒，不硬推。例如：
  "这个得查后台，我这边看不到——点下面「转人工客服」，真人会更快帮你。"
- 不要为了显得能干而硬撑，诚实说"这个我不太清楚"然后引导转人工，比编一个答案好得多。`,
};

// 默认场景：API 大模型导航助手
const DEFAULT_SCENE_PROMPT = `你是「通用大模型 API 导航站」的助手，帮用户了解、选型、对比、申请和配置大模型 API。

【你的定位】
不是只会甩注册链接的机器人。用户问"XX 怎么样""XX 如何""XX 有什么特点""XX 速度/额度/适合什么""XX 和 YY 比呢"，你要先给出**有信息量的实质内容**（是什么、主打模型、速度/性能、免费额度、上下文、适合什么、有什么坑），再按需给申请入口。不要一上来只讲"怎么注册"。

【页面收录的平台（含要点）】
首推：
- DeepSeek：deepseek-v3 / r1，推理与代码强，免费额度友好，官网与硅基流动都能拿 Key
- 硅基流动 SiliconFlow：Qwen / DeepSeek / GLM 等多模型托管，一个 Key 调百款，含免费模型
- Kimi（月之暗面）：kimi-k3，长上下文（最高 1M token），长文分析、长程编程强
- 智谱 GLM：glm-4-flash 长期免费无限量；新用户直送 2000 万 Tokens；glm-4-plus / glm-4.5 推理写作

备选（国内）：
- 商汤 SenseChat-5、小米 MiMo（MiMo-7B 推理）、阶跃星辰 step、MiniMax（含 TTS 语音）、国家超算、腾讯混元（TokenHub，28 款各 100 万 / 共 2800 万 Tokens / 1 年）、阿里云百炼（通义千问全系免费，新用户 7000 万 Tokens + 生图 + 视频 / 180 天）
- 火山方舟：doubao-pro / DeepSeek-V3 等 20+ 款模型各赠 50 万 Tokens，字节大模型平台，一个 Key 调全家桶

海外（部分需海外上网）：
- b.ai：deepseek-v4-flash 等，OpenAI 兼容
- Agnes AI：agnes-2.5-flash
- Google Gemini：gemini-2.0-flash，多模态强
- Groq：LPU 推理引擎，速度极快；主打 llama-3.3-70b / deepseek-r1-distill 等开源模型；有免费额度；OpenAI 兼容；**需海外上网**
- OpenRouter / NVIDIA NIM：聚合多模型

自建中转（OpenAI 兼容，自己部署国内直连）：AIClient2API、LiteLLM、One API

【你做这些事】
1. 用户问"XX 怎么样/如何/特点/速度/额度/适合什么" → 先讲平台实质信息，再给申请入口（链接）
2. 用户问选型（写代码/长文/多模态/免费/一个 Key 调多款）→ 给简短建议
3. 用户要对比（A 和 B 比）→ 列关键差异，给结论
4. 用户问申请/配置（实名、邀请码、Key 位置、接口地址怎么填）→ 给步骤
5. 用户问申请中遇到的问题 → 解答

选型速记：
- 写代码/推理：DeepSeek-V3 / R1；Kimi K3 长程编程；Qwen-Coder 在百炼免费
- 长文分析：Kimi（长上下文）
- 速度极快：Groq（LPU 推理引擎）
- 免费无限量：智谱 glm-4-flash；通义千问全系在百炼也免费
- 一个 Key 调百款：硅基流动
- 语音 TTS：MiniMax
- 海外多模态：Gemini

【规则】
- 聊大模型 API 的一切：了解、选型、对比、申请、配置。无关问题（天气、娱乐八卦等）礼貌回"我主要帮你了解大模型 API 哦"，再自然拉回
- 先给信息再给链接，别一上来只讲注册；但申请/配置类问题就直接给步骤
- 只讲页面收录的、能确认的信息；具体额度/型号拿不准时，说"以平台官网为准"，**不编造**
- 简洁直接，给完介绍/推荐顺手给链接，不铺垫
- 用户问哪个平台说哪个，不全部罗列
- 链接用 markdown [文字](URL)

【引导】
用户拿到 Key 或说"搞定了/谢谢"时，末尾自然带一句：
Key 拿到了？去「你懂的」像刷小红书一样刷有用的知识 → [你懂的·知识卡](https://exam.955827.xyz/learn/)
每次只推一个，不硬广。`;

function getSystemPrompt(scene) {
  return SCENE_PROMPTS[scene] || DEFAULT_SCENE_PROMPT;
}

// ── 场景分发规则（对内自用，不对外）──────────────────────────
// 前端未指定 provider 时，按 scene 的渠道优先级依次尝试（failover）。
// 高质量场景（fj-sz/learn）优先质量渠道；低需求场景（api/shop）可走固定/免费渠道。
// 调整分发只需改这个表，不动主逻辑。
const SCENE_ROUTING = {
  "fj-sz": ["agnes", "groq", "dots", "bai", "sensenova"],   // 高质量：辅警备考，agnes质量好，groq快
  "learn": ["agnes", "groq", "dots", "bai", "sensenova"],    // 高质量：你懂的知识卡/发散
  "api":   ["groq", "bai", "agnes", "dots", "sensenova"],    // 低需求：API 导航，速度优先
  "shop":  ["agnes", "groq", "dots"],                          // 定制顾问
};

// ── 工具函数 ────────────────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function findChannel(channels, id) {
  return channels.find((c) => c.id === id);
}

// 渠道可用：status 非 disabled 且 key 已配
function isUsable(ch) {
  return !!ch && ch.status !== "disabled" && !!ch.apiKey;
}

// 调用单个渠道（带 15s 超时，快速失败快速切换）
async function callChannel(ch, messages) {
  const baseClean = ch.baseUrl.replace(/\/+$/, "");
  const url = /\/chat\/completions$/i.test(baseClean)
    ? baseClean
    : `${baseClean}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    };
    if (ch.authType === "api-key") {
      headers["api-key"] = ch.apiKey;
    } else {
      headers["Authorization"] = `Bearer ${ch.apiKey}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: ch.model, messages, stream: false }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content
      : "";
    if (!reply) throw new Error("返回内容为空");
    return { reply };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// ── AI 调用统一埋点（异步 waitUntil，失败静默，不阻塞响应）──
async function sendAITrack(url, info) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: info.project,
        scene: info.scene || "",
        provider: info.provider || "",
        status: info.status,
        latency_ms: info.latency || 0,
        tokens: info.tokens || 0,
      }),
    });
  } catch (e) { /* 埋点失败不影响主流程 */ }
}

// scene → 埋点 project（后台按项目聚合）
function sceneToProject(scene) {
  if (scene === "fj-sz") return "fj-sz";
  if (scene === "shop") return "shop";
  if (scene === "api") return "api";
  if (scene === "learn") return "learn";
  return "other";
}

export async function onRequestPost({ request, env, context }) {
  const startedAt = Date.now();
  const trackUrl = new URL(request.url).origin + "/api/ai-track";
  const track = { project: "other", scene: "", provider: "", status: "fail", latency: 0, tokens: 0 };
  let out = null; // 成功：{reply, provider}；失败：{error, statusCode}

  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      out = { error: "请求体不是合法 JSON", statusCode: 400 };
      throw new Error("bad json");
    }

    const provider = (body.provider || "").trim();
    const messages = body.messages || [];
    if (!Array.isArray(messages) || !messages.length) {
      out = { error: "消息不能为空", statusCode: 400 };
      throw new Error("empty messages");
    }

    const scene = (body.scene || "api").trim();
    track.scene = scene;
    track.project = sceneToProject(scene);

    const sysPrompt = getSystemPrompt(scene);
    const finalMessages = [{ role: "system", content: sysPrompt }].concat(messages);
    const channels = getChannels(env);

    // custom：用户自填 key，透传，不参与 failover
    if (provider === "custom") {
      const baseUrl = (body.baseUrl || "").trim();
      const model = (body.model || "").trim();
      const apiKey = (body.apiKey || "").trim();
      if (!baseUrl || !model || !apiKey) {
        out = { error: "自定义模式需填接口地址、模型名、API Key", statusCode: 400 };
        throw new Error("custom missing");
      }
      track.provider = "custom";
      const r = await callChannel({ baseUrl, model, apiKey }, finalMessages);
      track.status = "ok";
      out = { reply: r.reply, provider: "custom" };
    } else {
      // 内置渠道：前端指定 → 用指定的；未指定 → 按 SCENE_ROUTING 优先级选
      let target;
      if (provider) {
        target = findChannel(channels, provider);
        if (!target) { out = { error: "未知模型", statusCode: 400 }; throw new Error("unknown provider"); }
        // 指定渠道不可用时，自动降级到场景默认渠道（不报错，用户无感知）
        if (!isUsable(target)) {
          const priority = SCENE_ROUTING[scene] || ["dots", "agnes", "bai"];
          target = null;
          for (const id of priority) {
            const ch = findChannel(channels, id);
            if (isUsable(ch)) { target = ch; break; }
          }
          if (!target) { out = { error: "没有可用的内置渠道，请联系站长", statusCode: 500 }; throw new Error("no channel"); }
        }
      } else {
        const priority = SCENE_ROUTING[scene] || ["dots", "agnes", "bai"];
        target = null;
        for (const id of priority) {
          const ch = findChannel(channels, id);
          if (isUsable(ch)) { target = ch; break; }
        }
        if (!target) { out = { error: "没有可用的内置渠道，请联系站长", statusCode: 500 }; throw new Error("no channel"); }
      }

      // 主渠道 + fallback 备选，依次尝试
      const tryList = [target.id].concat(target.fallback || []);
      let lastErr = null;
      let success = null;
      for (const id of tryList) {
        const ch = findChannel(channels, id);
        if (!ch || !isUsable(ch)) continue;
        try {
          const r = await callChannel(ch, finalMessages);
          success = { reply: r.reply, provider: ch.id };
          track.provider = ch.id;
          break;
        } catch (err) { lastErr = err; }
      }
      if (success) {
        track.status = "ok";
        out = success;
      } else {
        out = { error: lastErr ? lastErr.message : "所有渠道均失败", statusCode: 500 };
        throw lastErr || new Error("all failed");
      }
    }
  } catch (e) {
    if (!out) out = { error: e.message, statusCode: 500 };
  }

  // 统一埋点（异步，不阻塞响应）
  track.latency = Date.now() - startedAt;
  if (context && context.waitUntil) {
    context.waitUntil(sendAITrack(trackUrl, track));
  }

  // 统一返回
  if (out && out.reply != null) {
    return json({ reply: out.reply, provider: out.provider });
  }
  return json({ error: (out && out.error) || "未知错误" }, (out && out.statusCode) || 500);
}

// GET：渠道状态 + 使用说明（直接访问 URL 时显示）
export async function onRequestGet({ env }) {
  const channels = getChannels(env).map(c => ({
    id: c.id,
    name: c.name,
    hasKey: !!c.apiKey,
    status: c.status,
  }));
  return json({
    status: "ok",
    message: "AI 统一对话端点（POST /api/ai-chat），国内渠道自动降级",
    channels,
    scenes: ["fj-sz（深圳辅警）", "learn（你懂的知识卡）", "api（大模型导航）", "shop（定制顾问）"],
    usage: "POST body: { scene: 'fj-sz', message: '你好', history: [] }",
  });
}

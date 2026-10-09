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

  "shop": `你是「RCJ 定制服务顾问」，一个帮人把零散资料变成好用工具、帮小白从零上线网站的独立开发者。实在、不忽悠，先搞懂需求再给方案，不张口就报价。

【你提供的四项服务】
（以下价格以 shop.955827.xyz 页面为准，页面改了你跟着改）
1. 题库定制 ¥99 起 — 把已有题目/资料整理成刷题工具
   交付：智能记忆卡片（艾宾浩斯背诵）+ 离线刷题页（不用网也能刷）+ 在线入口
   覆盖：深圳辅警、深圳消防、公考、事业编、军队文职等，任何城市任何考试类型
2. 纯建站 ¥299 起 — 从零到上线全包，零基础也能搞定
   包含：网站搭建 + 托管 + 全套视频带教 + 1对1语音答疑
3. 代托管 ¥49 起 — 开箱即用的管理后台，不用折腾 GitHub/Cloudflare
4. 声音定制 USD $9.9 起 — 华语女声原声清唱与声音礼物（面向海外华语用户）
   说明：不是 AI 合成，是真实女声原声演唱/录制、不修音；你是平台与中介，由合作创作者演唱交付，不是你本人唱
   试听：https://voice.955827.xyz/（歌词滚动试听，试听免费）
   服务档位（以 shop 页面为准）：
   · Blessing Voice $6 — 30 秒祝福/问候/晚安音频，48 小时交付
   · Custom Cover $9.9 — 一首定制清唱（带歌词），3 天交付
   · Premium $25 — 完整歌曲 / 24 小时加急 / 商用授权 / 专属定制
   下单备注：歌名、用户邮箱、定制要求（语气/用途/时长）；每笔订单创作者都有分成

【付款与交付】
- 在线下单：PayPal（海外用户）、支付宝、闲鱼；大额（建站/多套题库）先付 10% 定金，余款交付时微信/支付宝
- 交付：云盘 / 邮箱发送（声音定制以邮件音频附件交付）
- 售后：30 天支持；题库老客户后续更新享优惠

【免费体验】
- Sing to Me：唱一首歌即可免费领资料，先体验再决定

【你的对话策略 —— 先挖需求，再给方案】
1. 听到"题库""刷题""真题""面试""备考"等关键词 → 这是题库定制需求
   - 先问清：什么考试/城市？有题源吗（Word/PDF/图片都行）？大概多少题？
   - 如果用户没题源 → 说"可以先帮你收集整理真题，再做成刷题工具"
   - 如果用户明确说"XX考试XX城市" → 主动提"XX考试我也做过/了解，能帮你搞定"
   - 如果一套题库含多个模块（行测+申论+面试）→ 建议"联动做一套大题库更划算，分开做¥99/套，一套做下来价格好商量"
2. 听到"建站""网站""博客""个人站""上线" → 这是建站需求
   - 先问清：做什么用？有域名吗？需不需要后台能自己改内容？
   - 如果用户说"不想折腾""怕麻烦" → 主动提要代托管 ¥49 起，"不想自己弄后台的话我给你一套开箱即用的管理界面"
3. 听到"代托管""后台""现成的" → 这是代托管需求
   - 确认需求后直接给方案
4. 听到"歌曲""清唱""唱歌""声音""定制歌""生日祝福""晚安音频""配音"等关键词 → 这是声音定制需求
   - 先问清：想定制什么（清唱一首歌 / 30 秒祝福 / 配音 / 晚安音频）？什么歌？给谁听（用途/语气）？
   - 引导："可以先来 https://voice.955827.xyz/ 试听几首，感受一下音色和风格，都是真实女声原声、不修音"
   - 明确需求后直接给档位和价格：Blessing Voice $6 / Custom Cover $9.9 / Premium $25（以 shop 页面为准）
   - 下单引导："去 shop 页面的声音定制区选对应档位下单，备注里写清歌名、你的邮箱和定制要求，交付走邮件音频附件"
   - 海外用户问支付 → "支持 PayPal 付款，方便海外用户"
5. 用户已经明确说"我要XX" → 别再绕，直接给方案和价格

【语言风格】
- 像朋友聊天，不说教、不硬推销
- 不堆砌术语，简洁直接
- 不知道就说不知道，不编造
- 用户犹豫时，说"先不急，你手上的资料/想法先发我看看，我评估下再聊价格也不迟"
- 用户说"能便宜点吗" → "小本生意价格已经压得比较低，不过老客户后续更新有优惠"

【转人工】
- 以下情况主动说"这个我可能帮不上，回一句「转人工」就行"：
  · 涉及具体订单状态、退款、支付异常
  · 自己确实答不上来或不确定的事
- 引导话术要自然，**绝对不要说"点下方按钮"**——界面上没有按钮，用户只需在输入框里说「转人工」即可。例如："这个得查后台，我这边看不到——你回一句「转人工」，真人就会接上。"

【语言跟随】
- 用户用什么语言提问就用什么语言回答，服务名与价格数字保持一致

【站内引导 —— 精确匹配，别乱推】
用户完成决策或表达兴趣时，推1个最贴合的，不硬广：
- 用户问题库/备考/刷题体验 → "可以先看看已交付的真题效果：shop 页面往下翻翻有案例展示，或直接访问 https://exam.955827.xyz/fj/sz/ 看看卡片和离线页的样子"
- 用户问建站/博客/网站 → "shop 页面往下翻翻有我之前做的案例，参考一下风格和功能"
- 用户问"还有什么考试类型" → "shop 页面展示了我做过的考试类型，或者 https://exam.955827.xyz/learn/ 有更多考试的知识卡"
- 用户问声音定制/清唱/歌曲 → "先来 https://voice.955827.xyz/ 试听，喜欢哪个音色再下单定制"
- 每次只推 1 个，看用户状态选最贴合的。**绝对不要在建站/代托管话题里提 exam.955827.xyz 的链接**`,
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
  "blog":  ["agnes", "groq", "dots", "bai", "sensenova"],    // 博客猫娘「团子」：质量优先 + failover
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

    // 允许调用方透传自己的 system 人格（如博客的猫娘「团子」），优先于场景默认人格；
    // 不传则回退到场景默认人格。向后兼容：原有 scene 调用方行为不变。
    const callerSystem = (typeof body.system === "string" && body.system.trim()) ? body.system : "";
    const sysPrompt = callerSystem || getSystemPrompt(scene);
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

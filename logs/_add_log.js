const fs = require('fs');
const p = 'C:/Users/小样儿/Desktop/products/_repos/rcj-lab/logs/experiments.json';
let s = fs.readFileSync(p, 'utf8');
const NL = '\r\n';
const newEntry = `    {` + NL +
  `      "date": "2026-09-08",` + NL +
  `      "title": "移除 shop 免费课承接横幅：克制互链，不重复造轮子",` + NL +
  `      "summary": "用户反馈 shop 首页的「欢迎来自免费建站公开课的同学 · 去定制你的站点 →」承接横幅冗余且链接误导人（刚听完免费课就推「定制站点」、点击后只是滚动到购买侧栏，像诱导）。修复：删除 #classBridge 横幅、相关 .class-bridge/.bridge-flash 样式、桥接 IIFE 及三语 bridgeText/bridgeBtn 键，回归最简互链：shop 首页只保留一行 muted「免费公开课 · 先听课，再决定 →」入口；course.html 底部 CTA 从 \`/?src=feishu-class\` 改为 \`/\`，去掉已无意义的来源参数。同时把 course.html 英文字典从公考/面试文案统一为建站主题（与中/日一致）。验证：grep 确认 index.html 中 classBridge/bridgeText/bridgeBtn/class-bridge/feishu-class/bridge-flash 全部零残留；node --check 内联 JS 0 错误；本机 Chrome 实测 shop 首页无横幅、course.html 英文内容已改为 site-building 主题、CTA 指向 /。",` + NL +
  `      "type": "fix",` + NL +
  `      "tags": [` + NL +
  `        "shop",` + NL +
  `        "course",` + NL +
  `        "ui-fix",` + NL +
  `        "feishu-class",` + NL +
  `        "minimalism",` + NL +
  `        "i18n"` + NL +
  `      ]` + NL +
  `    },`;

const anchor = NL + `    {` + NL + `      "date": "2026-09-07",`;
if (!s.includes(anchor)) { console.log('ANCHOR NOT FOUND'); process.exit(1); }
s = s.replace(anchor, newEntry + anchor);
fs.writeFileSync(p, s);
console.log('OK');

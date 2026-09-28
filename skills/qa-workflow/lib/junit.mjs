// 解析 JUnit XML（幾乎所有測試框架都能輸出），只取判斷結果所需的欄位。
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, code) => {
    if (code[0] !== '#') return ENTITIES[code] ?? m;
    return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
  });

const parseAttrs = (raw) =>
  Object.fromEntries([...raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(([, k, v]) => [k, decode(v)]));

const statusOf = (body) => {
  if (/<(failure|error)\b/.test(body)) return 'failed';
  if (/<skipped\b/.test(body)) return 'skipped';
  return 'passed';
};

const messageOf = (body) => {
  const tag = body.match(/<(?:failure|error)\b([^>]*?)\/?>/);
  if (!tag) return undefined;
  const msg = parseAttrs(tag[1]).message;
  return msg ? msg.slice(0, 500) : undefined;
};

export const parseJunit = (xml) =>
  [...xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)].map(([, rawAttrs, body = '']) => {
    const attrs = parseAttrs(rawAttrs);
    const time = Number.parseFloat(attrs.time);
    return {
      name: attrs.name ?? '',
      classname: attrs.classname ?? '',
      status: statusOf(body),
      durationMs: Number.isFinite(time) ? Math.round(time * 1000) : undefined,
      message: messageOf(body)
    };
  });

// task.testName 可以是完整名稱或片段；比對 name 與「classname name」。
export const matchTask = (task, testcases) => {
  const hits = testcases.filter((tc) =>
    tc.name === task.testName || tc.name.includes(task.testName) || `${tc.classname} ${tc.name}`.includes(task.testName));
  if (hits.length === 0) return null;

  const failed = hits.filter((h) => h.status === 'failed');
  const status = failed.length > 0 ? 'failed' : hits.every((h) => h.status === 'skipped') ? 'skipped' : 'passed';
  const durationMs = hits.reduce((sum, h) => sum + (h.durationMs ?? 0), 0);
  const message = failed.map((h) => h.message).filter(Boolean).join(' | ') || undefined;
  return { status, durationMs, message, matched: hits.length };
};

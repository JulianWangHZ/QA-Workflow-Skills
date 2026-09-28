// 產生最終報告：report.html 與 summary.md。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { themeToggle } from './render-review.mjs';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const bullet = (items) => items.map((i) => `- ${i}`).join('\n');

// ---------- report ----------

const asset = (name) => readFileSync(fileURLToPath(new URL(`../assets/${name}`, import.meta.url)), 'utf8');

const status = (value, dict) => `<span class="status ${escapeHtml(value)}">${escapeHtml(dict.status[value] ?? value)}</span>`;

const htmlTable = (headers, rows) => (rows.length === 0
  ? ''
  : `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
      rows.map((cells) => `<tr>${cells.map((c, i) => (i === 0 ? `<td class="id">${c}</td>` : `<td>${c}</td>`)).join('')}</tr>`).join('')
    }</tbody></table>`);

const row = (title, body) => (body
  ? `<section class="row"><div class="row-label"><h2>${escapeHtml(title)}</h2></div><div class="row-body">${body}</div></section>`
  : '');

const describeCounts = (counts, dict) => Object.entries(counts)
  .filter(([k]) => k !== 'total')
  .map(([k, v]) => `${dict.status[k] ?? k} ${v}`)
  .join(' · ');

const failureRows = ({ tasks, results, cases, dict }) => {
  const taskById = new Map((tasks?.tasks ?? []).map((t) => [t.id, t]));
  const caseById = new Map((cases?.cases ?? []).map((c) => [c.id, c]));
  return (results?.results ?? [])
    .filter((r) => r.status !== 'passed')
    .map((r) => {
      const task = taskById.get(r.taskId);
      const kase = caseById.get(task?.caseId);
      return [
        escapeHtml(r.taskId),
        escapeHtml(kase ? `${kase.id} ${kase.title}` : task?.caseId ?? ''),
        status(r.status, dict),
        escapeHtml(r.classification ? dict.classification[r.classification] : ''),
        escapeHtml([r.reason, r.message].filter(Boolean).join(' — ')),
        `<span class="mono faint">${escapeHtml((r.evidence ?? []).join(', '))}</span>`
      ];
    });
};

const reviewBlock = (review, checks, dict) => {
  const { col, reviewLabels: t } = dict;
  const verdictClass = review.verdict === 'APPROVE' ? 'passed' : review.verdict === 'BLOCK' ? 'failed' : 'blocked';
  const checkRows = (checks?.checks ?? []).map((c) => [
    escapeHtml(c.name), `<span class="status ${c.status === 'pass' ? 'passed' : c.status === 'fail' ? 'failed' : 'skipped'}">${escapeHtml(c.status.toUpperCase())}</span>`,
    escapeHtml((c.detail ?? '').split('\n')[0]), `<span class="mono faint">${escapeHtml(c.log ?? '')}</span>`
  ]);
  const dimRows = Object.entries(review.breakdown).map(([k, v]) => [escapeHtml(t.dims[k] ?? k), `${v.score}/20`, escapeHtml(v.note)]);
  const findingRows = review.findings.map((f) => [
    escapeHtml(f.id), `<span class="status ${f.severity === 'critical' ? 'failed' : f.severity === 'important' ? 'blocked' : 'skipped'}">${escapeHtml(f.severity)}</span>`,
    escapeHtml(f.title), `<span class="mono">${escapeHtml(f.line ? `${f.file}:${f.line}` : f.file)}</span>`,
    escapeHtml([f.detail, f.suggestion].filter(Boolean).join(' → '))
  ]);
  const list = (items) => (items.length ? `<ul class="notes neutral">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '');
  return [
    `<p style="margin:0 0 12px"><span class="status ${verdictClass}">${escapeHtml(review.verdict)}</span> · <b>${review.score}/100</b> — ${escapeHtml(review.summary)}</p>`,
    `<h3 style="margin:18px 0 6px;font-size:var(--fs-md)">${escapeHtml(t.checks)}</h3>`, htmlTable([col.id, col.result, col.reason, 'Log'], checkRows),
    `<h3 style="margin:18px 0 6px;font-size:var(--fs-md)">${escapeHtml(t.score)}</h3>`, htmlTable([t.dimension, t.points, col.reason], dimRows),
    review.strengths.length ? `<h3 style="margin:18px 0 6px;font-size:var(--fs-md)">${escapeHtml(t.strengths)}</h3>${list(review.strengths)}` : '',
    findingRows.length ? `<h3 style="margin:18px 0 6px;font-size:var(--fs-md)">${escapeHtml(t.findings)}</h3>${htmlTable([col.id, col.severity, col.title, col.file, col.reason], findingRows)}` : '',
    review.suggestions.length ? `<h3 style="margin:18px 0 6px;font-size:var(--fs-md)">${escapeHtml(t.suggestions)}</h3>${list(review.suggestions)}` : ''
  ].join('');
};

export const renderReportHtml = ({ state, context, risks, cases, tasks, results, review, reviewChecks, summary, reviewUrl, dict, language }) => {
  const { col, section, label } = dict;
  const { stats } = summary;
  const coveredBy = (riskId) => (cases?.cases ?? []).filter((c) => c.riskIds.includes(riskId)).map((c) => c.id);

  const figures = `<div class="figures">${[
    [stats.cases.total, section.cases, describeCounts(stats.cases, dict)],
    [`${stats.risks.covered}/${stats.risks.total}`, section.risks, label.covered],
    [stats.tasks.total, 'Tasks', describeCounts(stats.tasks, dict)],
    [stats.review ? `${stats.review.score}` : '—', section.review, stats.review ? stats.review.verdict : ''],
    [stats.attempts, label.attempts, '']
  ].map(([v, k, d]) => `<div><b>${escapeHtml(v)}</b><span>${escapeHtml(k)}${d ? ` · ${escapeHtml(d)}` : ''}</span></div>`).join('')}</div>`;

  const content = [
    row(section.stats, figures),
    row(section.reasons, `<ul class="notes">${summary.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`),
    row(section.scope, context
      ? `<p style="margin:0 0 8px">${escapeHtml(context.scope.summary)}</p>${context.scope.sources.map((s) => `<div class="muted"><span class="mono faint">${escapeHtml(s.type)}</span> ${escapeHtml(s.ref)}</div>`).join('')}`
      : ''),
    row(section.risks, htmlTable([col.id, col.level, col.title, col.impact, col.cases, col.result],
      (risks?.risks ?? []).map((r) => [
        escapeHtml(r.id), escapeHtml(r.level), escapeHtml(r.title), `<span class="muted">${escapeHtml(r.impact)}</span>`,
        `<span class="mono">${escapeHtml(coveredBy(r.id).join(', '))}</span>`, status(summary.riskOutcome[r.id], dict)
      ]))),
    row(section.cases, htmlTable([col.id, col.priority, col.title, col.risks, col.result],
      [...(cases?.cases ?? [])].sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3))).map((c) => [
        escapeHtml(c.id), escapeHtml(c.priority), escapeHtml(c.title),
        `<span class="mono">${escapeHtml(c.riskIds.join(', '))}</span>`, status(summary.caseStatus[c.id], dict)
      ]))),
    row(section.failures, htmlTable([col.id, section.cases, col.result, col.classification, col.reason, 'Log'], failureRows({ tasks, results, cases, dict }))),
    row(section.review, review ? reviewBlock(review, reviewChecks, dict) : ''),
    row(section.timeline, `<details><summary>${state.history.length}</summary>${htmlTable(
      [col.stage, col.action, col.at], state.history.map((h) => [escapeHtml(h.stage), escapeHtml(h.action), `<span class="mono faint">${escapeHtml(h.at)}</span>`])
    )}</details>`)
  ].join('\n');

  const replacements = {
    lang: language,
    title: `${dict.reportTitle} · ${state.runId}`,
    kicker: dict.reportTitle,
    heading: context?.scope.summary ?? state.runId,
    runId: state.runId,
    meta: `${label.run} ${state.runId} · ${label.mode} ${state.mode} · ${label.generated} ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    verdictClass: summary.verdict,
    verdictLabel: dict.verdict[summary.verdict],
    verdictNote: summary.reasons.join('；')
  };
  const html = Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, escapeHtml(value)),
    asset('report.html')
  );
  const reviewLink = reviewUrl ? `<a class="link" href="${escapeHtml(reviewUrl)}">${escapeHtml(label.reviewLink)} ↗</a>` : '';
  return html.replace('{{theme}}', asset('theme.css')).replace('{{themeToggle}}', themeToggle(dict.review.themeLabel))
    .replace('{{reviewLink}}', reviewLink).replace('{{content}}', content);
};

export const renderSummaryMarkdown = ({ state, summary, dict }) => {
  const { stats } = summary;
  return `${[
    `# ${dict.reportTitle} · ${state.runId}`,
    `**${dict.verdict[summary.verdict]}**`,
    bullet(summary.reasons),
    bullet([
      `${dict.section.cases}：${stats.cases.total}（${describeCounts(stats.cases, dict)}）`,
      `${dict.section.risks}：${stats.risks.covered}/${stats.risks.total} ${dict.label.covered}`,
      `Tasks：${stats.tasks.total}（${describeCounts(stats.tasks, dict)}）`,
      `${dict.section.review}：${stats.review ? `${stats.review.verdict} ${stats.review.score}/100` : '—'}（${stats.findings.total} 個問題，critical ${stats.findings.critical}）`,
      `${dict.label.attempts}：${stats.attempts}`
    ])
  ].join('\n\n')}\n`;
};

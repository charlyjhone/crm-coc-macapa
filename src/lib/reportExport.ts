// Exportação de relatórios: CSV (abre direto no Excel em português) e PDF pela impressão do navegador.

export type ReportCell = string | number | null | undefined;
export type ReportColumn = { key: string; label: string; nowrap?: boolean };
export type ReportTable = {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  summary?: { label: string; value: ReportCell }[];
  notice?: string;
};

const text = (value: ReportCell) => (value === null || value === undefined ? "" : String(value));

/** CSV com ponto e vírgula e BOM UTF-8: o Excel brasileiro abre com acentos e colunas certas. */
export function toCsv(table: ReportTable): string {
  const esc = (value: ReportCell) => {
    const s = text(value).replace(/\r?\n/g, " ");
    return /[";]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [table.columns.map((c) => esc(c.label)).join(";")];
  for (const row of table.rows) lines.push(table.columns.map((c) => esc(row[c.key])).join(";"));
  return "﻿" + lines.join("\r\n");
}

export function slugify(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function downloadCsv(table: ReportTable, fileName: string) {
  const blob = new Blob([toCsv(table)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeHtml = (value: ReportCell) =>
  text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Monta uma página própria para impressão e abre o diálogo do navegador (escolher "Salvar como PDF"). */
export function printReport(table: ReportTable, opts: { schoolName: string; fileName: string; generatedBy?: string }) {
  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const wide = table.columns.length > 6;
  const summary = table.summary?.length
    ? `<div class="summary">${table.summary.map((s) => `<div><span>${escapeHtml(s.label)}</span><b>${escapeHtml(s.value)}</b></div>`).join("")}</div>`
    : "";
  const body = table.rows.length
    ? `<table><thead><tr>${table.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${table.rows
        .map((r) => `<tr>${table.columns.map((c) => `<td${c.nowrap ? ' class="nw"' : ""}>${escapeHtml(r[c.key])}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`
    : `<p class="empty">Nenhum registro neste período.</p>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(opts.fileName)}</title>
<style>
@page { size: A4 ${wide ? "landscape" : "portrait"}; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #101828; margin: 0; font-size: 10px; }
header { border-bottom: 2px solid #047857; padding-bottom: 8px; margin-bottom: 10px; }
header p { margin: 0; color: #047857; font-weight: 700; font-size: 11px; }
h1 { margin: 2px 0 0; font-size: 18px; }
.sub { color: #475467; margin-top: 2px; font-size: 11px; }
.notice { background: #FFFAEB; border: 1px solid #FEDF89; padding: 6px 8px; border-radius: 6px; margin: 8px 0; color: #93370D; }
.summary { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
.summary div { border: 1px solid #D0D5DD; border-radius: 6px; padding: 5px 8px; min-width: 110px; }
.summary span { display: block; color: #475467; font-size: 9px; }
.summary b { font-size: 14px; }
table { width: 100%; border-collapse: collapse; }
th { background: #ECFDF3; color: #054F31; text-align: left; font-size: 9px; padding: 4px 5px; border-bottom: 1px solid #A6F4C5; }
td { padding: 3px 5px; border-bottom: 1px solid #EAECF0; vertical-align: top; }
tr { break-inside: avoid; }
td.nw { white-space: nowrap; }
thead { display: table-header-group; }
.empty { color: #475467; }
footer { margin-top: 10px; color: #667085; font-size: 9px; }
</style></head><body>
<header><p>${escapeHtml(opts.schoolName)}</p><h1>${escapeHtml(table.title)}</h1>${table.subtitle ? `<div class="sub">${escapeHtml(table.subtitle)}</div>` : ""}</header>
${table.notice ? `<div class="notice">${escapeHtml(table.notice)}</div>` : ""}
${summary}${body}
<footer>${table.rows.length} ${table.rows.length === 1 ? "registro" : "registros"} · gerado em ${escapeHtml(generatedAt)}${opts.generatedBy ? ` por ${escapeHtml(opts.generatedBy)}` : ""}</footer>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc || !frame.contentWindow) { frame.remove(); throw new Error("Não foi possível preparar a impressão."); }
  doc.open(); doc.write(html); doc.close();
  const win = frame.contentWindow;
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup);
  setTimeout(() => { win.focus(); win.print(); setTimeout(() => frame.remove(), 60_000); }, 250);
}

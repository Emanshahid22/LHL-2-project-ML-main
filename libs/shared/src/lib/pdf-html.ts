/**
 * UC-09: RenderModel + FormLayout → print HTML.
 *
 * A FORMATTER, not an interpreter: everything about what the document says —
 * fields, redaction, the pinned declaration, exhibit anchors, the draft band
 * text — was decided in libs/shared's render model. This file only turns that
 * model into paged HTML for Chromium's print engine. Layout numbers come from
 * the FormLayout data (PRD §4), so an overlay binding is a second data set,
 * not a rewrite.
 *
 * Colour: the draft band uses the advisory AMBER (#b45309 on #fef3c7 — the
 * print equivalents of the app's advisory tokens); RED appears exactly once,
 * on the MG6D section band (rule 6 on paper). Tables repeat their header row
 * on every page (thead) and never split a row across pages
 * (break-inside: avoid) — LER-1163's two rules.
 */
import type { FormLayout } from './form-layout';
import type { RenderModel } from './render-model';

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function printCss(layout: FormLayout): string {
  const m = layout.page.marginMm;
  const t = layout.type;
  return `
  @page { size: ${layout.page.size}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${t.family}; font-size: ${t.bodyPt}pt; color: #111; }
  h1 { font-size: ${t.headingPt + 2}pt; margin: 0 0 2mm; }
  .form-subtitle { font-size: ${t.labelPt}pt; color: #444; margin: 0 0 4mm; }
  .vulnerable-marker { font-size: ${t.bodyPt}pt; font-weight: bold; border: 1.2pt solid #111;
    padding: 1.5mm 2.5mm; margin: 0 0 4mm; display: inline-block; }
  h2 { font-size: ${t.headingPt}pt; margin: 5mm 0 2mm; border-bottom: 0.7pt solid #555; padding-bottom: 1mm; }
  h2.sensitive-band { color: #7f1d1d; border-bottom: 1.4pt solid #7f1d1d; }
  .field { border: 0.5pt solid #999; padding: 1.6mm 2.2mm; margin: 0 0 2mm; break-inside: avoid; }
  .field-label { font-size: ${t.labelPt}pt; text-transform: uppercase; letter-spacing: 0.04em;
    color: #444; margin-bottom: 0.8mm; }
  .field-value { min-height: 4mm; white-space: pre-wrap; overflow-wrap: anywhere; }
  .field-value.empty { min-height: 6mm; }
  .narrative .field-value { line-height: 1.45; }
  .declaration { border: 1.2pt solid #111; padding: 2.2mm; margin: 3mm 0 2mm;
    font-style: italic; break-inside: avoid; }
  .notice { padding: 1.6mm 2.2mm; margin: 0 0 2mm; border: 0.5pt dashed #999; color: #333; }
  .sensitive-locked { border: 1.2pt solid #7f1d1d; color: #7f1d1d; padding: 2.2mm; margin: 0 0 2mm; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 2mm; }
  thead { display: table-header-group; } /* repeat header row on every page */
  th { font-size: ${t.labelPt}pt; text-transform: uppercase; letter-spacing: 0.04em;
    text-align: left; border: 0.5pt solid #777; padding: 1.2mm 1.8mm; background: #efefef; }
  td { border: 0.5pt solid #999; padding: 1.2mm 1.8mm; vertical-align: top; overflow-wrap: anywhere; }
  tr { break-inside: avoid; } /* a row never splits across pages */
  td.ordinal { width: 8mm; text-align: right; color: #444; }
  a.exhibit-link { color: #111; text-decoration: underline; }
  `;
}

function blockHtml(model: RenderModel, sectionSensitive: boolean): (b: RenderModel['sections'][0]['blocks'][0]) => string {
  return (b) => {
    switch (b.kind) {
      case 'declaration':
        return `<div class="declaration" data-block="declaration">${esc(b.text ?? '')}</div>`;
      case 'sensitiveLocked':
        return `<div class="sensitive-locked" data-block="sensitive-locked">${esc(b.text ?? '')}</div>`;
      case 'notice':
        return `<div class="notice" data-block="notice">${esc(b.text ?? '')}</div>`;
      case 'narrative': {
        const runs = (b.runs ?? [])
          .map((r) =>
            r.linkTo
              ? `<a class="exhibit-link" href="#${esc(r.linkTo)}">${esc(r.text)}</a>`
              : esc(r.text),
          )
          .join('');
        return (
          `<div class="field narrative" data-field="${esc(b.fieldId ?? '')}">` +
          `<div class="field-label">${esc(b.label ?? '')}</div>` +
          `<div class="field-value${b.empty ? ' empty' : ''}">${runs}</div></div>`
        );
      }
      case 'table': {
        const head = `<thead><tr><th></th>${(b.columns ?? [])
          .map((c) => `<th>${esc(c)}</th>`)
          .join('')}</tr></thead>`;
        const body = (b.rows ?? [])
          .map(
            (r) =>
              `<tr${r.anchorId ? ` id="${esc(r.anchorId)}"` : ''}><td class="ordinal">${r.ordinal}</td>` +
              r.cells.map((c) => `<td>${esc(c)}</td>`).join('') +
              '</tr>',
          )
          .join('');
        return (
          `<div class="field-label">${esc(b.label ?? '')}</div>` +
          `<table data-field="${esc(b.fieldId ?? '')}">${head}<tbody>${body}</tbody></table>`
        );
      }
      default:
        return (
          `<div class="field" data-field="${esc(b.fieldId ?? '')}">` +
          `<div class="field-label">${esc(b.label ?? '')}</div>` +
          `<div class="field-value${b.empty ? ' empty' : ''}">${esc(b.text ?? '')}</div></div>`
        );
    }
  };
}

/**
 * @param fontCss the embedded @font-face rules (the generated asset in
 * libs/shared/assets/fonts) — passed in by the caller because this module is
 * framework-free and never touches the filesystem. Without it the layout's
 * private family matches nothing and Chromium falls back to its last-resort
 * face, which the pixel gate then catches — a loud failure, not a quiet
 * font substitution.
 */
export function modelToHtml(model: RenderModel, layout: FormLayout, fontCss = ''): string {
  const sections = model.sections
    .map((s) => {
      const heading = s.title
        ? `<h2 class="${s.sensitive ? 'sensitive-band' : ''}" data-section="${esc(s.title)}">${esc(s.title)}${s.sensitive ? ' — RESTRICTED' : ''}</h2>`
        : '';
      return heading + s.blocks.map(blockHtml(model, s.sensitive === true)).join('');
    })
    .join('');
  const marker = model.vulnerableWitness
    ? '<div class="vulnerable-marker" data-block="vulnerable-marker">Vulnerable / intimidated witness — special measures apply</div>'
    : '';
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<title>${esc(model.formCode)}</title><style>${fontCss}${printCss(layout)}</style></head><body>` +
    `<h1>${esc(model.formCode)} — ${esc(model.formName)}</h1>` +
    `<p class="form-subtitle">Template v${model.templateVersion} · ${
      model.unverified ? 'unverified template — see the draft band' : 'verified template'
    }</p>` +
    marker +
    sections +
    '</body></html>'
  );
}

/**
 * Chromium header/footer templates. The draft band is a RUNNING header —
 * stamped by the print engine on EVERY page, so no pagination outcome can
 * produce an unbanded page. Chromium requires inline styles and honours no
 * external CSS here.
 */
export function headerTemplate(model: RenderModel): string {
  if (!model.draftBand) return '<span></span>';
  return (
    '<div style="width:100%; font-size:7pt; font-family:serif; text-align:center;' +
    ' color:#b45309; background:#fef3c7; border:0.5pt solid #b45309;' +
    ' margin:0 14mm; padding:1mm 0;">' +
    model.draftBand.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
    '</div>'
  );
}

export function footerTemplate(model: RenderModel): string {
  return (
    '<div style="width:100%; font-size:7pt; font-family:serif; color:#444;' +
    ' margin:0 14mm; display:flex; justify-content:space-between;">' +
    `<span>${model.formCode.replace(/</g, '&lt;')} · generated by MGs Forms</span>` +
    '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>'
  );
}

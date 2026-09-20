/**
 * UC-09: RenderModel → DOCX (LER-1166 / DoD 4).
 *
 * Built from the SAME render model as the PDF — never by converting the PDF —
 * with the scope's exact wording "Draft — not the authoritative version" in a
 * real Word HEADER part referenced from the section properties, so Word
 * repeats it on EVERY page; it is not a paragraph that scrolls away.
 *
 * The file is a minimal OOXML package written by hand (a ZIP of five XML
 * parts, stored uncompressed). Hand-rolled on purpose: a document-generation
 * dependency is a heavy supply-chain surface for what is, structurally, five
 * small XML files — and the draft-label guarantee is easier to prove on XML
 * we wrote than on a library's output. DOCX is convenience output; the PDF
 * remains authoritative (PRD §4).
 */
import { crc32 } from 'node:zlib';
import type { RenderModel } from '@mgs/shared';
import { DOCX_DRAFT_HEADER_TEXT } from '@mgs/shared';

const escXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control chars are invalid in XML 1.0 and can appear in pasted text.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** One stored (uncompressed) ZIP entry + central-directory record. */
interface ZipEntry {
  name: string;
  data: Buffer;
}

function buildZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (a fixed, valid DOS date)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra len
    cd.writeUInt16LE(0, 32); // comment len
    cd.writeUInt16LE(0, 34); // disk
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, cdBuf, end]);
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function para(text: string, opts: { bold?: boolean; italic?: boolean; label?: boolean } = {}): string {
  const props =
    (opts.bold ? '<w:b/>' : '') +
    (opts.italic ? '<w:i/>' : '') +
    (opts.label ? '<w:sz w:val="15"/><w:color w:val="444444"/>' : '');
  return (
    '<w:p><w:r>' +
    (props ? `<w:rPr>${props}</w:rPr>` : '') +
    `<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`
  );
}

function modelBody(model: RenderModel): string {
  const parts: string[] = [];
  parts.push(para(`${model.formCode} — ${model.formName}`, { bold: true }));
  parts.push(para(`Template v${model.templateVersion} · ${model.unverified ? 'unverified template' : 'verified template'}`, { label: true }));
  if (model.vulnerableWitness) {
    parts.push(para('Vulnerable / intimidated witness — special measures apply', { bold: true }));
  }
  for (const section of model.sections) {
    if (section.title) {
      parts.push(para(section.sensitive ? `${section.title} — RESTRICTED` : section.title, { bold: true }));
    }
    for (const b of section.blocks) {
      switch (b.kind) {
        case 'declaration':
          parts.push(para(b.text ?? '', { italic: true }));
          break;
        case 'sensitiveLocked':
        case 'notice':
          parts.push(para(b.text ?? ''));
          break;
        case 'narrative':
          parts.push(para(b.label ?? '', { label: true }));
          parts.push(para((b.runs ?? []).map((r) => r.text).join('')));
          break;
        case 'table': {
          parts.push(para(b.label ?? '', { label: true }));
          const header =
            '<w:tr>' +
            ['#', ...(b.columns ?? [])]
              .map((c) => `<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escXml(c)}</w:t></w:r></w:p></w:tc>`)
              .join('') +
            '</w:tr>';
          const rows = (b.rows ?? [])
            .map(
              (r) =>
                '<w:tr>' +
                [String(r.ordinal), ...r.cells]
                  .map((c) => `<w:tc><w:p><w:r><w:t xml:space="preserve">${escXml(c)}</w:t></w:r></w:p></w:tc>`)
                  .join('') +
                '</w:tr>',
            )
            .join('');
          parts.push(
            `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${header}${rows}</w:tbl>`,
          );
          break;
        }
        default:
          parts.push(para(b.label ?? '', { label: true }));
          parts.push(para(b.text ?? ''));
      }
    }
  }
  return parts.join('');
}

export function buildDocx(model: RenderModel): Buffer {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
    '</Types>';
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
  const docRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
    '</Relationships>';
  // The draft header part — referenced as the DEFAULT header for the one
  // section, which is how Word repeats it on every page (DoD 4).
  const header =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:hdr ${W}><w:p><w:r><w:rPr><w:b/></w:rPr>` +
    `<w:t xml:space="preserve">${escXml(DOCX_DRAFT_HEADER_TEXT)}</w:t></w:r></w:p></w:hdr>`;
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document ${W} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>` +
    modelBody(model) +
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' + // A4 in twentieths of a point
    '<w:pgMar w:top="1247" w:right="794" w:bottom="1021" w:left="794" w:header="454"/>' +
    '</w:sectPr></w:body></w:document>';

  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(docRels, 'utf8') },
    { name: 'word/header1.xml', data: Buffer.from(header, 'utf8') },
  ]);
}

import JSZip from 'jszip';

const xmlEscape = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[char]!));

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

function parseXml(source: string): Document {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Word 문서의 XML을 읽을 수 없습니다.');
  return document;
}

function paragraphHtml(paragraph: Element): string {
  const style = paragraph.getElementsByTagNameNS(WORD_NS, 'pStyle')[0]?.getAttributeNS(WORD_NS, 'val') || '';
  let content = '';
  for (const child of Array.from(paragraph.children)) {
    if (child.localName === 'pPr') continue;
    if (child.localName === 'r') {
      const props = child.getElementsByTagNameNS(WORD_NS, 'rPr')[0];
      let text = Array.from(child.getElementsByTagNameNS(WORD_NS, 't')).map(node => escapeHtml(node.textContent || '')).join('');
      if (child.getElementsByTagNameNS(WORD_NS, 'tab').length) text += '\t';
      if (child.getElementsByTagNameNS(WORD_NS, 'br').length) text += '<br>';
      if (props?.getElementsByTagNameNS(WORD_NS, 'b').length) text = `<strong>${text}</strong>`;
      if (props?.getElementsByTagNameNS(WORD_NS, 'i').length) text = `<em>${text}</em>`;
      if (props?.getElementsByTagNameNS(WORD_NS, 'u').length) text = `<u>${text}</u>`;
      content += text;
    } else if (child.localName === 'hyperlink') {
      content += Array.from(child.getElementsByTagNameNS(WORD_NS, 't')).map(node => escapeHtml(node.textContent || '')).join('');
    }
  }
  const heading = style.match(/^Heading([1-6])$/i);
  const tag = heading ? `h${heading[1]}` : 'p';
  return `<${tag}>${content || '<br>'}</${tag}>`;
}

function tableHtml(table: Element): string {
  const rows = Array.from(table.getElementsByTagNameNS(WORD_NS, 'tr'));
  return `<table><tbody>${rows.map((row, rowIndex) => {
    const cells = Array.from(row.children).filter(cell => cell.localName === 'tc');
    return `<tr>${cells.map(cell => {
      const tag = rowIndex === 0 ? 'th' : 'td';
      const paragraphs = Array.from(cell.getElementsByTagNameNS(WORD_NS, 'p')).map(paragraphHtml).join('');
      return `<${tag}>${paragraphs || '<p><br></p>'}</${tag}>`;
    }).join('')}</tr>`;
  }).join('')}</tbody></table><p></p>`;
}

/** Imports Word paragraphs and tables. Embedded media is reported instead of silently dropped. */
export async function docxToEditorHtml(data: ArrayBuffer): Promise<{ html: string; hasEmbeddedMedia: boolean }> {
  if (data.byteLength > 50 * 1024 * 1024) throw new Error('50MB 이하의 DOCX 파일을 선택해주세요.');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(data); }
  catch { throw new Error('DOCX 파일을 읽을 수 없습니다. 암호가 설정되지 않은 .docx 파일인지 확인해주세요.'); }
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('유효한 DOCX 파일이 아닙니다.');
  const document = parseXml(await documentFile.async('string'));
  const body = document.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('Word 문서 본문을 찾을 수 없습니다.');
  const html = Array.from(body.children).map(block => {
    if (block.localName === 'p') return paragraphHtml(block);
    if (block.localName === 'tbl') return tableHtml(block);
    return '';
  }).join('');
  return { html: html || '<p></p>', hasEmbeddedMedia: Object.keys(zip.files).some(path => path.startsWith('word/media/')) };
}

function wordRun(text: string, marks: { bold?: boolean; italic?: boolean; underline?: boolean } = {}) {
  if (!text) return '';
  const properties = [marks.bold && '<w:b/>', marks.italic && '<w:i/>', marks.underline && '<w:u w:val="single"/>'].filter(Boolean).join('');
  const props = properties ? `<w:rPr>${properties}</w:rPr>` : '';
  return `<w:r>${props}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function wordInline(node: Node, marks: { bold?: boolean; italic?: boolean; underline?: boolean } = {}): string {
  if (node.nodeType === Node.TEXT_NODE) return wordRun(node.textContent || '', marks);
  if (!(node instanceof Element)) return '';
  if (node.tagName.toLowerCase() === 'br') return '<w:r><w:br/></w:r>';
  const tag = node.tagName.toLowerCase();
  const nextMarks = {
    bold: marks.bold || ['strong', 'b'].includes(tag),
    italic: marks.italic || ['em', 'i'].includes(tag),
    underline: marks.underline || tag === 'u',
  };
  return Array.from(node.childNodes).map(child => wordInline(child, nextMarks)).join('');
}

function wordParagraph(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const heading = tag.match(/^h([1-6])$/);
  const style = heading ? `<w:pPr><w:pStyle w:val="Heading${heading[1]}"/></w:pPr>` : '';
  const content = Array.from(element.childNodes).map(node => wordInline(node)).join('') || '<w:r><w:br/></w:r>';
  return `<w:p>${style}${content}</w:p>`;
}

function wordTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tr'));
  const rowCells = rows.map(row => Array.from(row.children).filter(cell => ['td', 'th'].includes(cell.tagName.toLowerCase())));
  const columnCount = Math.max(1, ...rowCells.map(cells => cells.length));
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7B7B7"/><w:left w:val="single" w:sz="4" w:color="B7B7B7"/><w:bottom w:val="single" w:sz="4" w:color="B7B7B7"/><w:right w:val="single" w:sz="4" w:color="B7B7B7"/><w:insideH w:val="single" w:sz="4" w:color="B7B7B7"/><w:insideV w:val="single" w:sz="4" w:color="B7B7B7"/></w:tblBorders>';
  const grid = `<w:tblGrid>${Array.from({ length: columnCount }, () => '<w:gridCol w:w="2400"/>').join('')}</w:tblGrid>`;
  const tableRows = rowCells.map(cells => `<w:tr>${Array.from({ length: columnCount }, (_, index) => {
    const cell = cells[index];
    const paragraphs = cell ? Array.from(cell.children).map(child => ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(child.tagName.toLowerCase()) ? wordParagraph(child) : Array.from(child.childNodes).map(node => wordInline(node)).join('')).join('') : '';
    return `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${paragraphs || '<w:p><w:r><w:br/></w:r></w:p>'}</w:tc>`;
  }).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr>${borders}</w:tblPr>${grid}${tableRows}</w:tbl>`;
}

/** Creates a basic Office Open XML Word document from editor paragraphs and tables. */
export async function createDocx(html: string): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const blocks = Array.from(parsed.body.children).map(element => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'table') return wordTable(element);
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li'].includes(tag)) return wordParagraph(element);
    return Array.from(element.children).map(child => child.tagName.toLowerCase() === 'table' ? wordTable(child) : wordParagraph(child)).join('') || wordParagraph(element);
  }).join('') || '<w:p><w:r><w:br/></w:r></w:p>';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${blocks}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>${Array.from({ length: 6 }, (_, index) => `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${index < 2 ? 360 : 240}" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${index === 0 ? 32 : index === 1 ? 28 : 24}"/></w:rPr></w:style>`).join('')}</w:styles>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE', compressionOptions: { level: 4 } });
}

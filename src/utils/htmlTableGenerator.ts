/**
 * Generates TipTap-compatible HTML <table> strings from parsed matrix rows.
 */

export interface TableGeneratorOptions {
  hasHeader?: boolean;
  tableWidth?: string;
  borderColor?: string;
}

export function generateHtmlTableFromMatrix(
  matrix: string[][],
  options: TableGeneratorOptions = {}
): string {
  if (!matrix || matrix.length === 0) return '<p></p>';

  const hasHeader = options.hasHeader ?? true;
  const widthStyle = options.tableWidth ? ` style="width: ${options.tableWidth};"` : '';

  let html = `<table${widthStyle} class="wonbee-rendered-table border-collapse my-3">`;

  matrix.forEach((row, rowIdx) => {
    const isHeaderRow = hasHeader && rowIdx === 0;
    const tag = isHeaderRow ? 'th' : 'td';

    if (rowIdx === 0 && hasHeader) {
      html += '<thead><tr>';
    } else if (rowIdx === 0) {
      html += '<tbody><tr>';
    } else {
      html += '<tr>';
    }

    row.forEach((cell) => {
      const escaped = cell
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      html += `<${tag} class="p-2 border border-stone-300 dark:border-stone-700">${escaped || '&nbsp;'}</${tag}>`;
    });

    html += '</tr>';

    if (rowIdx === 0 && hasHeader) {
      html += '</thead><tbody>';
    }
  });

  html += '</tbody></table><p></p>';
  return html;
}

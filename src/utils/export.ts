const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Escapes a single CSV cell and neutralizes spreadsheet formula injection prefixes.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  const escaped = safe.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildCSVContent(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return '\uFEFF' + lines.join('\n');
}

export async function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8;'
): Promise<void> {
  const safeName = filename.replace(/[<>:"/\\|?*]+/g, '_');
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', safeName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const targetName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const csvContent = buildCSVContent(headers, rows);
  void downloadTextFile(targetName, csvContent, 'text/csv;charset=utf-8;');
}

export function triggerPrintReport(): boolean {
  window.print();
  return true;
}

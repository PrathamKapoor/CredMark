/** Strict RFC 4180 reader. Apostrophes are ordinary text, never quote delimiters. */
export function parseCsv(source: string): string[][] {
  if (new TextEncoder().encode(source).length > 2 * 1024 * 1024) throw new Error('CSV must be at most 2 MB.');
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closed = false;
  const pushRow = () => { row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = ''; closed = false; if (rows.length > 1001) throw new Error('Maximum 1,000 recipients per import.'); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; continue; }
    if (c === ',') { row.push(cell); cell = ''; closed = false; }
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (c === '"' && !cell && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('Malformed CSV quoting.'); cell += c; }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (cell || row.length) pushRow();
  if (!rows.length) throw new Error('CSV is empty.');
  const headers = rows[0].map(h => h.trim().toLowerCase());
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Headers must be nonempty and unique.');
  if (rows.some(r => r.length !== headers.length)) throw new Error('Each CSV row must have the same number of columns as the header.');
  return rows;
}

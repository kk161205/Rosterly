export type CsvCell = string | number | null | undefined

/**
 * Quote a cell for CSV. Cells starting with = + - @ are prefixed with ' so a
 * spreadsheet shows them as text instead of running them as formulas.
 */
function cell(v: CsvCell): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n')
}

/** Save rows as `<name>.csv` in the browser. */
export function downloadCsv(name: string, header: string[], rows: CsvCell[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

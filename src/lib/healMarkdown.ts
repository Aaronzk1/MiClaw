/**
 * Heal incomplete markdown during streaming so renderers handle it cleanly.
 * Fixes: unclosed code fences, unclosed inline code, unclosed bold/italic.
 */
export function healMarkdown(src: string): string {
  if (!src) return src

  const lines = src.split('\n')

  // 1. Count fenced code blocks — if odd, close the last one
  const fences: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) fences.push(i)
  }
  if (fences.length % 2 !== 0) {
    const openLine = fences[fences.length - 1]
    const before = lines.slice(0, openLine + 1).join('\n')
    const tail = lines.slice(openLine + 1).join('\n')
    return before + '\n' + tail + '\n```'
  }

  // 2. Unclosed inline code on last line
  const lastLine = lines[lines.length - 1] || ''
  const backtickCount = (lastLine.match(/(?<!`)`(?!`)/g) || []).length
  if (backtickCount % 2 !== 0) {
    lines[lines.length - 1] = lastLine + '`'
  }

  // 3. Unclosed bold/italic on last line
  const starCount = (lastLine.match(/(?<!\*)\*(?!\*)/g) || []).length
  if (starCount % 2 !== 0) {
    lines[lines.length - 1] = lines[lines.length - 1] + '*'
  }

  return lines.join('\n')
}

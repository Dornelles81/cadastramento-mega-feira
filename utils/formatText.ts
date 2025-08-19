export function formatTextWithMarkdown(text: string): string {
  if (!text) return ''
  
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Underline
    .replace(/__(.*?)__/g, '<u>$1</u>')
    // Italic
    .replace(/_(.*?)_/g, '<em>$1</em>')
    // Line breaks
    .replace(/\n/g, '<br/>')
    // Dividers
    .replace(/---/g, '<hr class="my-2 border-gray-300"/>')
}
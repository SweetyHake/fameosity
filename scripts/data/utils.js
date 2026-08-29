export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function cleanName(name) {
  if (typeof name !== 'string') return name;
  return name.replace(/\s*\[[^\[\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

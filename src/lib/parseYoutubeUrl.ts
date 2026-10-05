const ID_RE = /^[\w-]{11}$/;

const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);
const LONG_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
]);
const PATH_KINDS = new Set(['shorts', 'embed', 'live', 'v']);

export function parseYoutubeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  // 1. Пользователь вставил просто id
  if (ID_RE.test(text)) return text;

  // 2. Разбираем как URL (допускаем ссылку без https://)
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;

  if (SHORT_HOSTS.has(host)) {
    // youtu.be/ID?t=10
    candidate = url.pathname.split('/')[1] || null;
  } else if (LONG_HOSTS.has(host)) {
    if (url.pathname === '/watch') {
      // youtube.com/watch?v=ID&list=...
      candidate = url.searchParams.get('v');
    } else {
      // youtube.com/shorts/ID, /embed/ID, /live/ID, /v/ID
      const [, kind, id] = url.pathname.split('/');
      if (PATH_KINDS.has(kind)) candidate = id || null;
    }
  }

  // 3. Финальная проверка формата
  return candidate && ID_RE.test(candidate) ? candidate : null;
}
// Отправляет запрос на сервер сигналинга, чтобы бесплатный хостинг успел проснуться.
// Ответ нам не нужен, ошибки глушим.
export function warmUpSignaling(): void {
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;
  if (!host || host === "localhost" || host === "127.0.0.1") return;

  const secure = import.meta.env.VITE_PEER_SECURE !== "false";
  const port = import.meta.env.VITE_PEER_PORT as string | undefined;
  const defaultPort = secure ? "443" : "80";
  const portPart = port && port !== defaultPort ? `:${port}` : "";

  fetch(`${secure ? "https" : "http"}://${host}${portPart}/`, {
    mode: "no-cors",
  }).catch(() => {});
}
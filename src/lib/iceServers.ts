const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

export function getIceServers(): RTCIceServer[] {
  const urls = import.meta.env.VITE_TURN_URLS as string | undefined;
  const username = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  // TURN не настроен: работаем только на STUN
  if (!urls || !username || !credential) return STUN_SERVERS;

  const turn: RTCIceServer = {
    urls: urls.split(',').map((u) => u.trim()).filter(Boolean),
    username,
    credential,
  };

  return [...STUN_SERVERS, turn];
}
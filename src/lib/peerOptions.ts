import type { PeerOptions } from "peerjs";
import { getIceServers } from "./iceServers";

export function getPeerOptions(): PeerOptions {
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;

  return {
    // Если хост не задан, PeerJS использует публичное облако
    ...(host && {
      host,
      port: Number(import.meta.env.VITE_PEER_PORT) || 443,
      path: (import.meta.env.VITE_PEER_PATH as string) || "/",
      secure: import.meta.env.VITE_PEER_SECURE !== "false",
    }),
    config: { iceServers: getIceServers() },
  };
}
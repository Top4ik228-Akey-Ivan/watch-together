export type Status = 'connecting' | 'waiting' | 'connected' | 'error';

export type PlayerState = { videoId: string; isPlaying: boolean; position: number };

export type Msg =
  | ({ t: "state"; hb?: boolean } & PlayerState)
  | { t: "welcome" }
  | { t: "sync" }
  | { t: "full" }
  | { t: "ping" }
  | { t: "bye" };
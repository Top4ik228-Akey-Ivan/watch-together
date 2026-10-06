import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import type { Msg, Status } from "@/lib/types";
import { getPeerOptions } from "@/lib/peerOptions";

type Options = {
  roomId: string;
  role: "host" | "guest";
  onMessage: (m: Msg) => void;
  onConnected: () => void;
};

const CONNECT_TIMEOUT_MS = 15_000;
const PING_MS = 2_000;
const DEAD_MS = 6_000;

function peerErrorText(type: string): string {
  switch (type) {
    case "unavailable-id":
      return "Комната уже открыта в другой вкладке. Подождите несколько секунд и повторите";
    case "peer-unavailable":
      return "Комната не найдена";
    case "network":
    case "server-error":
    case "socket-error":
    case "socket-closed":
      return "Нет связи с сервером";
    default:
      return "Ошибка соединения";
  }
}

export function usePeerRoom({ roomId, role, onMessage, onConnected }: Options) {
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  // Всегда свежие колбэки, не заставляя эффект пересоздавать Peer
  const onMessageRef = useRef(onMessage);
  const onConnectedRef = useRef(onConnected);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectedRef.current = onConnected;
  });

  useEffect(() => {
    let disposed = false;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let lastSeen = Date.now();

    setStatus("connecting");
    setError(null);

    // ---------- Проверка «жив ли партнёр» ----------
    const stopLiveness = () => {
      clearInterval(pingTimer);
      pingTimer = undefined;
    };

    const startLiveness = (conn: DataConnection, onDead: () => void) => {
      stopLiveness();
      lastSeen = Date.now();
      pingTimer = setInterval(() => {
        if (!conn.open) return;
        if (Date.now() - lastSeen > DEAD_MS) {
          stopLiveness();
          onDead();
          return;
        }
        conn.send({ t: "ping" } satisfies Msg);
      }, PING_MS);
    };

    // ---------- Ошибки ----------
    const fail = (text: string) => {
      if (disposed) return;
      clearTimeout(connectTimer);
      stopLiveness();
      setError((prev) => prev ?? text); // первая ошибка не затирается
      setStatus("error");

      const c = connRef.current;
      connRef.current = null;
      c?.close();
    };

    // ---------- Хост: гость ушёл ----------
    const dropGuest = (c: DataConnection) => {
      if (disposed || connRef.current !== c) return;
      stopLiveness();
      connRef.current = null;
      c.close();
      setStatus("waiting");
    };

    // ---------- Гость: хост подтвердил вход ----------
    const becomeConnected = (conn: DataConnection) => {
      if (disposed || connRef.current !== conn) return;
      clearTimeout(connectTimer);
      startLiveness(conn, () => fail("Потеряна связь с хостом"));
      setStatus("connected");
      onConnectedRef.current();
    };

    // ---------- Входящие данные ----------
    const handleData = (data: unknown, from: DataConnection) => {
      if (disposed || connRef.current !== from) return;
      if (typeof data !== "object" || data === null || !("t" in data)) return;

      lastSeen = Date.now();
      const msg = data as Msg;

      switch (msg.t) {
        case "ping":
          return;
        case "bye":
          if (role === "host") dropGuest(from);
          else fail("Хост закрыл комнату");
          return;
        case "welcome":
          if (role === "guest") becomeConnected(from);
          return;
        case "full":
          fail("Комната занята");
          return;
        default:
          onMessageRef.current(msg);
      }
    };

    // ---------- Peer ----------
    const peer = new Peer(
      role === "host" ? roomId : undefined!,
      getPeerOptions(),
    );
    peerRef.current = peer;

    // ---------- Общее ----------
    peer.on("error", (err) => {
      if (disposed) return;
      // Если канал с партнёром жив, сбои сигналинга нам уже не важны
      if (connRef.current?.open) return;
      fail(peerErrorText(err.type));
    });

    // ---------- Хост ----------
    if (role === "host") {
      peer.on("open", () => {
        if (disposed) return;
        setStatus("waiting");
      });

      peer.on("connection", (c) => {
        if (disposed) return;

        const current = connRef.current;

        // Уже есть гость: отказываем третьему
        if (current?.open && Date.now() - lastSeen < DEAD_MS) {
          c.on("open", () => {
            c.send({ t: "full" } satisfies Msg);
            setTimeout(() => c.close(), 300);
          });
          return;
        }

        // Гость есть, но молчит: считаем его ушедшим и заменяем
        if (current) {
          stopLiveness();
          connRef.current = null;
          current.close();
        }

        connRef.current = c;

        c.on("open", () => {
          if (disposed || connRef.current !== c) return;
          c.send({ t: "welcome" } satisfies Msg);
          startLiveness(c, () => dropGuest(c));
          setStatus("connected");
          onConnectedRef.current();
        });

        c.on("data", (data) => handleData(data, c));
        c.on("close", () => dropGuest(c));
        c.on("error", () => dropGuest(c));
      });
    }

    // ---------- Гость ----------
    if (role === "guest") {
      peer.on("open", () => {
        if (disposed) return;

        let conn: DataConnection

        try {
          conn = peer.connect(roomId, { reliable: true });
        } catch (e) {
          console.error(e);
          fail("Ошибка соединения");
          return;
        }
        connRef.current = conn;

        connectTimer = setTimeout(
          () => fail("Не удалось подключиться"),
          CONNECT_TIMEOUT_MS,
        );

        conn.on("data", (data) => handleData(data, conn));
        conn.on("close", () => fail("Хост закрыл комнату"));
        conn.on("error", () => fail("Ошибка соединения"));
      });
    }

    // ---------- Прощальное сообщение ----------
    const sendBye = () => {
      const c = connRef.current;
      if (c?.open) {
        try {
          c.send({ t: "bye" } satisfies Msg);
        } catch {
          /* вкладка и так закрывается */
        }
      }
    };

    window.addEventListener("pagehide", sendBye);

    // ---------- Очистка ----------
    return () => {
      disposed = true;
      window.removeEventListener("pagehide", sendBye);
      clearTimeout(connectTimer);
      stopLiveness();
      sendBye();
      connRef.current = null;
      peer.destroy();
      peerRef.current = null;
    };
  }, [roomId, role, attempt]);

  const send = useCallback((m: Msg) => {
    const conn = connRef.current;
    if (conn?.open) conn.send(m);
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { status, error, send, retry };
}
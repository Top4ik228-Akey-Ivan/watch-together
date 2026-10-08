import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";

import { getPeerOptions } from "@/lib/peerOptions";
import type { Msg, Status } from "@/lib/types";

type Options = {
  roomId: string;
  role: "host" | "guest";
  onMessage: (m: Msg) => void;
  onConnected: () => void;
};

const CONNECT_TIMEOUT_MS = 15_000;
const PING_MS = 2_000;
const DEAD_MS = 6_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 15_000;

export const SIGNALING_DOWN_TEXT = "Нет связи с сервером";

// Ошибки, которые относятся к серверу сигналинга, а не к партнёру
const SIGNALING_ERRORS = new Set([
  "network",
  "server-error",
  "socket-error",
  "socket-closed",
]);

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
      return SIGNALING_DOWN_TEXT;
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
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let lastSeen = Date.now();
    let registered = false; // были ли мы зарегистрированы на сервере сигналинга
    let reconnectAttempts = 0;

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
      clearTimeout(reconnectTimer);
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

    // Регистрация на сервере прошла (в том числе повторная после reconnect)
    peer.on("open", () => {
      registered = true;
      reconnectAttempts = 0;
    });

    // Переподключение к серверу сигналинга с нарастающей паузой
    const scheduleReconnect = () => {
      if (disposed || peer.destroyed) return;
      clearTimeout(reconnectTimer);

      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** reconnectAttempts,
        RECONNECT_MAX_MS,
      );
      reconnectAttempts += 1;

      reconnectTimer = setTimeout(() => {
        if (disposed || peer.destroyed || !peer.disconnected) return;
        peer.reconnect();
      }, delay);
    };

    peer.on("disconnected", () => {
      if (disposed || peer.destroyed) return;
      if (registered) scheduleReconnect();
    });

    peer.on("error", (err) => {
      if (disposed) return;

      // Сервер моргнул, когда мы уже были зарегистрированы: тихо переподключаемся
      if (registered && SIGNALING_ERRORS.has(err.type)) {
        scheduleReconnect();
        return;
      }

      // Канал с партнёром жив: остальные ошибки не важны
      if (connRef.current?.open) return;

      fail(peerErrorText(err.type));
    });

    // ---------- Хост ----------
    if (role === "host") {
      peer.on("open", () => {
        if (disposed) return;
        // Повторное «open» после reconnect: гость на месте, статус не трогаем
        if (connRef.current?.open) return;
        setStatus("waiting");
      });

      peer.on("connection", (c) => {
        if (disposed) return;

        const current = connRef.current;

        // Гость есть и отвечает: отказываем третьему
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
        // Повторное «open» после reconnect: соединение с хостом уже есть
        if (connRef.current) return;

        let conn: DataConnection;
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

        // Статус connected ставим не по open, а по welcome от хоста
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
      clearTimeout(reconnectTimer);
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
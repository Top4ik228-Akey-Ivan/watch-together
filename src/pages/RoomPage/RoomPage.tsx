import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import YouTube from "react-youtube";
import { toast } from "sonner";

import CopyLink from "@/components/CopyLink/CopyLink";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import ChangeVideoForm from "@/components/ChangeVideoForm/ChangeVideoForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePeerRoom } from "@/hooks/usePeerRoom";
import { usePlayer } from "@/hooks/usePlayer";
import type { Msg, PlayerState } from "@/lib/types";
import { PLAYER_OPTS } from "@/constants/player";

// Было ли у страницы хоть одно взаимодействие пользователя (нужно для автоплея)
function hadUserInteraction(): boolean {
  const nav = navigator as Navigator & {
    userActivation?: { hasBeenActive: boolean };
  };
  return Boolean(nav.userActivation?.hasBeenActive);
}

// Обёртка: проверяет параметр маршрута до вызова хуков
export default function RoomPage() {
  const { roomId } = useParams();
  if (!roomId) return <Navigate to="/" replace />;
  return <RoomContent roomId={roomId} />;
}

function RoomContent({ roomId }: { roomId: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  const role: "host" | "guest" = location.state?.host ? "host" : "guest";
  const initialVideoId: string | undefined = location.state?.videoId;

  const [entered, setEntered] = useState(hadUserInteraction);
  const pendingRef = useRef<PlayerState | null>(null);
  const pendingAtRef = useRef(0);

  // Мост между хуками: usePlayer нужен send, а он создаётся позже
  const sendRef = useRef<(m: Msg) => void>(() => { });

  // Счётчики для отладки
  const [sentCount, setSentCount] = useState(0);
  const [received, setReceived] = useState<{ count: number; last: Msg | null }>({
    count: 0,
    last: null,
  });

  // ---------- Плеер ----------
  const player = usePlayer({
    initialVideoId,
    onLocalChange: (s) => {
      setSentCount((c) => c + 1);
      sendRef.current({ t: "state", ...s });
    },
    onError: (text) => toast.error(text),
    onVideoChange: (videoId) => {
      if (role !== "host") return; // гость получит видео от хоста при подключении
      // history state переживает перезагрузку страницы
      navigate(`/room/${roomId}`, {
        replace: true,
        state: { host: true, videoId },
      });
    },
  });

  // ---------- Соединение ----------
  const { status, error, send, retry } = usePeerRoom({
    roomId,
    role,
    onMessage: (m) => {
      setReceived((r) => ({ count: r.count + 1, last: m }));

      if (m.t === "sync") {
        const s = player.getState();
        if (s) sendRef.current({ t: "state", ...s });
        return;
      }

      if (m.t !== "state") return;

      if (!entered) {
        pendingRef.current = m;
        pendingAtRef.current = Date.now();
        player.preload(m.videoId);
        return;
      }
      player.applyState(m);
    },
    onConnected: () =>
      toast.success(role === "host" ? "Друг подключился" : "Вы в комнате"),
  });

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // ---------- Хост отправляет состояние, когда друг подключился ----------
  useEffect(() => {
    if (role !== "host" || status !== "connected" || !player.ready) return;
    const s = player.getState();
    if (s) send({ t: "state", ...s });
  }, [role, status, player.ready, player.getState, send]);

  // ---------- Консольный доступ для ручных тестов (только dev) ----------
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      __wt: {
        getState: player.getState,
        applyState: player.applyState,
        send,
      },
    });
  }, [player.getState, player.applyState, send]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      player.suppress(2500);                 // глушим «пробуждение» плеера
      sendRef.current({ t: "sync" });        // просим актуальное состояние
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [player.suppress]);

  // ---------- Кнопка «Присоединиться» ----------
  const handleJoin = () => {
    setEntered(true);

    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;

    // Пока гость решался нажать кнопку, хост мог играть дальше
    const waited = (Date.now() - pendingAtRef.current) / 1000;

    player.applyState({
      ...pending,
      position: pending.isPlaying ? pending.position + waited : pending.position,
    });
  };

  // ---------- Смена видео ----------
  const handleChangeVideo = (videoId: string) => {
    // То же видео: перезапускать незачем
    if (player.getState()?.videoId === videoId) {
      toast.info("Это видео уже открыто");
      return;
    }

    // Клик по кнопке считается взаимодействием, а своё действие важнее
    // отложенного состояния от партнёра
    setEntered(true);
    pendingRef.current = null;

    const s: PlayerState = { videoId, isPlaying: true, position: 0 };

    player.applyState(s); // у себя
    setSentCount((c) => c + 1); // только для отладочной панели
    send({ t: "state", ...s }); // партнёру
  };

  const shareUrl = `${window.location.origin}/room/${roomId}`;

  // Что показать поверх плеера
  const overlay = !player.startVideoId
    ? "wait"
    : !entered && status === "connected"
      ? "join"
      : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4">
      {/* Шапка */}
      <header className="flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          Выйти
        </Button>
      </header>

      {/* Ссылка для друга */}
      {role === "host" && status === "waiting" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Отправьте эту ссылку другу:
          </p>
          <CopyLink url={shareUrl} />
        </div>
      )}

      {/* Ошибка */}
      {status === "error" && (
        <Card className="border-destructive">
          <CardContent className="space-y-3 pt-6">
            <p role="alert" className="text-destructive">
              {error ?? "Что-то пошло не так"}
            </p>
            <div className="flex gap-2">
              <Button onClick={retry}>Повторить</Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                На главную
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Плеер */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black">
        {player.startVideoId && (
          <YouTube
            videoId={player.startVideoId}
            opts={PLAYER_OPTS}
            className="size-full"
            iframeClassName="size-full"
            {...player.handlers}
          />
        )}

        {overlay && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 p-4 text-center text-white">
            {overlay === "join" ? (
              <>
                <p>Друг уже в комнате</p>
                <Button onClick={handleJoin}>Присоединиться к просмотру</Button>
              </>
            ) : (
              <p>Ждём видео от хоста…</p>
            )}
          </div>
        )}
      </div>

      <ChangeVideoForm disabled={!player.ready} onChange={handleChangeVideo} />

      {/* Отладка (только в dev) */}
      {import.meta.env.DEV && (
        <Card>
          <CardContent className="space-y-2 pt-6 font-mono text-xs">
            <div>
              role: {role} | status: {status} | ready: {String(player.ready)} |
              entered: {String(entered)}
            </div>
            <div>
              отправлено: {sentCount} | получено: {received.count}
            </div>
            <pre className="overflow-x-auto rounded bg-muted p-2">
              {received.last
                ? JSON.stringify(received.last, null, 2)
                : "сообщений пока нет"}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
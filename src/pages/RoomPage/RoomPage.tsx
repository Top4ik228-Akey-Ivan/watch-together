import { useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import CopyLink from "@/components/CopyLink/CopyLink";
import StatusBadge from "@/components/StatusBadge/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePeerRoom } from "@/hooks/usePeerRoom";
import type { Msg } from "@/lib/types";

// Обёртка: проверяет параметр маршрута до вызова хуков
export default function Room() {
  const { roomId } = useParams();
  if (!roomId) return <Navigate to="/" replace />;
  return <RoomInner roomId={roomId} />;
}

function RoomInner({ roomId }: { roomId: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  const role = location.state?.host ? "host" : "guest";

  // Только для отладки (на второй день уберём)
  const [lastMessage, setLastMessage] = useState<Msg | null>(null);

  const { status, error, send, retry } = usePeerRoom({
    roomId,
    role,
    onMessage: (m) => setLastMessage(m),
    onConnected: () =>
      toast.success(
        role === "host" ? "Друг подключился" : "Вы в комнате",
      ),
  });

  const shareUrl = `${window.location.origin}/room/${roomId}`;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4">
      {/* Шапка */}
      <header className="flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          Выйти
        </Button>
      </header>

      {/* Ссылка для друга: только хосту и только пока никого нет */}
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

      {/* Заглушка плеера */}
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-muted text-muted-foreground">
        Здесь будет плеер
      </div>

      {/* Отладочная панель (временная) */}
      <Card>
        <CardContent className="space-y-3 pt-6 text-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="text-muted-foreground">Комната:</span>
            <span className="font-mono">{roomId}</span>
            <span className="text-muted-foreground">Роль:</span>
            <span>{role}</span>
            <span className="text-muted-foreground">Статус:</span>
            <span>{status}</span>
          </div>

          <Button
            size="sm"
            variant="secondary"
            disabled={status !== "connected"}
            onClick={() =>
              send({
                t: "state",
                videoId: "test",
                isPlaying: false,
                position: Math.round(Math.random() * 100),
              })
            }
          >
            Отправить тест
          </Button>

          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
            {lastMessage
              ? JSON.stringify(lastMessage, null, 2)
              : "Сообщений пока нет"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
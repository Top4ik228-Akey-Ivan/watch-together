import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { YouTubeEvent } from "react-youtube";

import type { PlayerState } from "@/lib/types";

// Коды состояний плеера YouTube
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;

const IGNORE_MS = 800;        // окно игнора после обычной команды
const IGNORE_LOAD_MS = 3000;  // окно игнора после загрузки нового видео
const SEEK_THRESHOLD = 0.5;   // расхождение позиции, после которого делаем seekTo

// Минимальный тип нативного плеера YouTube (методы синхронные)
type Player = {
    getPlayerState(): number;
    getCurrentTime(): number;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    loadVideoById(o: { videoId: string; startSeconds?: number }): void;
    cueVideoById(o: { videoId: string; startSeconds?: number }): void;
};

type Options = {
    initialVideoId?: string;
    onLocalChange: (s: PlayerState) => void;
    onError: (text: string) => void;
};

function errorText(code: number): string {
    switch (code) {
        case 2:
            return "Некорректная ссылка на видео";
        case 100:
            return "Видео недоступно";
        case 101:
        case 150:
            return "Автор запретил встраивание этого видео";
        default:
            return "Ошибка воспроизведения";
    }
}

export function usePlayer({ initialVideoId, onLocalChange, onError }: Options) {
    const [ready, setReady] = useState(false);
    const [startVideoId, setStartVideoId] = useState<string | null>(
        initialVideoId ?? null,
    );

    const playerRef = useRef<Player | null>(null);
    const videoIdRef = useRef<string | null>(initialVideoId ?? null);
    const ignoreUntil = useRef(0);
    const pendingRef = useRef<PlayerState | null>(null);

    // Всегда свежие колбэки без пересоздания обработчиков
    const onLocalChangeRef = useRef(onLocalChange);
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onLocalChangeRef.current = onLocalChange;
        onErrorRef.current = onError;
    });

    // ---------- Снимок текущего состояния ----------
    const getState = useCallback((): PlayerState | null => {
        const p = playerRef.current;
        const videoId = videoIdRef.current;
        if (!p || !videoId) return null;

        const st = p.getPlayerState();
        return {
            videoId,
            isPlaying: st === PLAYING || st === BUFFERING,
            position: p.getCurrentTime(),
        };
    }, []);

    // ---------- Применить состояние к готовому плееру ----------
    const apply = useCallback((s: PlayerState) => {
        const p = playerRef.current;
        if (!p) return;

        // Другое видео: загружаем с нужной позиции
        if (s.videoId !== videoIdRef.current) {
            ignoreUntil.current = Date.now() + IGNORE_LOAD_MS;
            videoIdRef.current = s.videoId;

            if (s.isPlaying) {
                p.loadVideoById({ videoId: s.videoId, startSeconds: s.position });
            } else {
                p.cueVideoById({ videoId: s.videoId, startSeconds: s.position });
            }
            return;
        }

        // То же видео: поправляем позицию и play/pause
        ignoreUntil.current = Date.now() + IGNORE_MS;

        if (Math.abs(p.getCurrentTime() - s.position) > SEEK_THRESHOLD) {
            p.seekTo(s.position, true);
        }

        if (s.isPlaying) p.playVideo();
        else p.pauseVideo();
    }, []);

    // ---------- Публичный метод: применить чужое состояние ----------
    const applyState = useCallback(
        (s: PlayerState) => {
            // Плеер ещё не создан или не готов: запоминаем, применим в onReady
            if (!playerRef.current) {
                pendingRef.current = s;

                // У гостя видео ещё нет: монтируем <YouTube> с этим видео
                if (videoIdRef.current === null) {
                    videoIdRef.current = s.videoId;
                    setStartVideoId(s.videoId);
                }
                return;
            }

            apply(s);
        },
        [apply],
    );

    // ---------- Обработчики для <YouTube> ----------
    const handleReady = useCallback(
        (e: YouTubeEvent) => {
            playerRef.current = e.target as unknown as Player;
            setReady(true);

            const pending = pendingRef.current;
            if (pending) {
                pendingRef.current = null;
                apply(pending);
            }
        },
        [apply],
    );

    const handleStateChange = useCallback(
        (e: YouTubeEvent<number>) => {
            if (e.data !== PLAYING && e.data !== PAUSED) return;
            if (Date.now() < ignoreUntil.current) return; // эхо от нашей же команды

            const s = getState();
            if (s) onLocalChangeRef.current(s);
        },
        [getState],
    );

    const handleError = useCallback((e: YouTubeEvent<number>) => {
        onErrorRef.current(errorText(e.data));
    }, []);

    // ---------- Смонтировать плеер без запуска воспроизведения ----------
    const preload = useCallback((videoId: string) => {
        if (videoIdRef.current !== null) return; // видео уже есть
        videoIdRef.current = videoId;
        setStartVideoId(videoId);
    }, []);

    const handlers = useMemo(
        () => ({
            onReady: handleReady,
            onStateChange: handleStateChange,
            onError: handleError,
        }),
        [handleReady, handleStateChange, handleError],
    );

    return { ready, startVideoId, getState, applyState, preload, handlers };
}
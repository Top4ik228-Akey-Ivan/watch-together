import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { YouTubeEvent } from "react-youtube";

import type { PlayerState } from "@/lib/types";

// Коды состояний плеера YouTube
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;

const IGNORE_MS = 500; // «глухота» после обычной команды
const IGNORE_LOAD_MS = 1000; // «глухота» после загрузки нового видео
const EXPECT_MS = 15_000; // сколько ждём ответное событие на свою команду
const SEEK_THRESHOLD = 0.5; // расхождение, после которого применяем seekTo

const POLL_MS = 500; // период опроса позиции (детектор перемотки)
const JUMP_PLAYING = 1.0; // скачок позиции при воспроизведении = перемотка
const JUMP_PAUSED = 0.5; // скачок позиции на паузе = перемотка
const DEDUPE_MS = 400; // защита от двойной отправки одного и того же
const UNSTARTED = -1;
const CUED = 5;

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
    onVideoChange?: (videoId: string) => void;
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

export function usePlayer({
    initialVideoId,
    onLocalChange,
    onError,
    onVideoChange,
}: Options) {
    const [ready, setReady] = useState(false);
    const [startVideoId, setStartVideoId] = useState<string | null>(
        initialVideoId ?? null,
    );

    const playerRef = useRef<Player | null>(null);
    const videoIdRef = useRef<string | null>(initialVideoId ?? null);
    const ignoreUntil = useRef(0);
    const pendingRef = useRef<PlayerState | null>(null);
    const expected = useRef<{ isPlaying: boolean; until: number } | null>(null);

    // Трекер позиции для детектора перемотки: где плеер был и когда
    const trackerRef = useRef({ pos: 0, at: Date.now() });
    // Последняя отправка (защита от дублей: событие + опрос на одно действие)
    const lastEmitRef = useRef({ at: 0, isPlaying: false });

    // Всегда свежие колбэки без пересоздания обработчиков
    const onLocalChangeRef = useRef(onLocalChange);
    const onVideoChangeRef = useRef(onVideoChange);
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onLocalChangeRef.current = onLocalChange;
        onErrorRef.current = onError;
    });

    useEffect(() => {
        onLocalChangeRef.current = onLocalChange;
        onErrorRef.current = onError;
        onVideoChangeRef.current = onVideoChange;
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

    // ---------- Единая точка отправки локальных изменений ----------
    const emitLocal = useCallback(() => {
        const s = getState();
        if (!s) return;

        const now = Date.now();
        trackerRef.current = { pos: s.position, at: now };
        lastEmitRef.current = { at: now, isPlaying: s.isPlaying };
        onLocalChangeRef.current(s);
    }, [getState]);

    // ---------- Применить состояние к готовому плееру ----------
    const apply = useCallback((s: PlayerState) => {
        const p = playerRef.current;
        if (!p) return;

        const now = Date.now();
        const st = p.getPlayerState();
        const notStarted = st === UNSTARTED || st === CUED;
        const sameVideo = s.videoId === videoIdRef.current;

        // Другое видео, либо плеер ещё ни разу не запускался:
        // загружаем с нужной позиции (seekTo + pause на пустом плеере даёт чёрный экран)
        if (!sameVideo || notStarted) {
            if (!sameVideo) onVideoChangeRef.current?.(s.videoId)

            ignoreUntil.current = now + (s.isPlaying ? IGNORE_LOAD_MS : IGNORE_MS);
            videoIdRef.current = s.videoId;
            trackerRef.current = { pos: s.position, at: now };

            if (s.isPlaying) {
                expected.current = { isPlaying: true, until: now + EXPECT_MS };
                p.loadVideoById({ videoId: s.videoId, startSeconds: s.position });
            } else {
                expected.current = null; // cue не порождает PAUSED, ждать нечего
                p.cueVideoById({ videoId: s.videoId, startSeconds: s.position });
            }
            return;
        }

        // То же видео, плеер уже работал: поправляем позицию и play/pause
        expected.current = { isPlaying: s.isPlaying, until: now + EXPECT_MS };
        ignoreUntil.current = now + IGNORE_MS;

        const cur = p.getCurrentTime();
        const needSeek = Math.abs(cur - s.position) > SEEK_THRESHOLD;
        if (needSeek) p.seekTo(s.position, true);

        // Наш собственный прыжок не должен выглядеть как перемотка пользователя
        trackerRef.current = { pos: needSeek ? s.position : cur, at: now };

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

    // ---------- Смонтировать плеер без запуска воспроизведения ----------
    const preload = useCallback((videoId: string) => {
        if (videoIdRef.current !== null) return;
        videoIdRef.current = videoId;
        setStartVideoId(videoId);
    }, []);

    // ---------- Временно игнорировать события плеера ----------
    const suppress = useCallback((ms: number) => {
        ignoreUntil.current = Math.max(ignoreUntil.current, Date.now() + ms);
    }, []);

    // ---------- Обработчики для <YouTube> ----------
    const handleReady = useCallback(
        (e: YouTubeEvent) => {
            playerRef.current = e.target as unknown as Player;
            trackerRef.current = {
                pos: playerRef.current.getCurrentTime(),
                at: Date.now(),
            };
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

            const isPlaying = e.data === PLAYING;
            const now = Date.now();
            const exp = expected.current;

            // Ответ на нашу собственную команду, пусть и запоздавший
            if (exp && now < exp.until && exp.isPlaying === isPlaying) {
                expected.current = null;
                const p = playerRef.current;
                if (p) trackerRef.current = { pos: p.getCurrentTime(), at: now };
                return;
            }

            // Явная «глухота» (окно после команды, возврат на вкладку)
            if (now < ignoreUntil.current) return;

            // Это действие человека: старое ожидание больше не актуально
            expected.current = null;

            // То же самое мы только что отправили (например, сработал опрос)
            const last = lastEmitRef.current;
            if (last.isPlaying === isPlaying && now - last.at < DEDUPE_MS) return;

            emitLocal();
        },
        [emitLocal],
    );

    const handleError = useCallback((e: YouTubeEvent<number>) => {
        onErrorRef.current(errorText(e.data));
    }, []);

    // ---------- Детектор перемотки (опрос позиции) ----------
    useEffect(() => {
        if (!ready) return;

        const id = setInterval(() => {
            const p = playerRef.current;
            if (!p || !videoIdRef.current) return;

            const now = Date.now();
            const cur = p.getCurrentTime();
            const st = p.getPlayerState();

            const resetTracker = () => {
                trackerRef.current = { pos: cur, at: now };
            };

            // Мы сами командуем плеером
            if (now < ignoreUntil.current) return resetTracker();

            // Нас интересуют только устойчивые состояния
            if (st !== PLAYING && st !== PAUSED) return resetTracker();

            // Ждём, пока плеер дойдёт до состояния, которое мы ему задали
            const exp = expected.current;
            if (exp && now < exp.until && exp.isPlaying !== (st === PLAYING)) {
                return resetTracker();
            }

            const t = trackerRef.current;
            const playing = st === PLAYING;
            const expectedPos = t.pos + (playing ? (now - t.at) / 1000 : 0);
            const threshold = playing ? JUMP_PLAYING : JUMP_PAUSED;

            if (Math.abs(cur - expectedPos) > threshold) {
                emitLocal(); // перемотка пользователя
                return;
            }

            trackerRef.current = { pos: cur, at: now };
        }, POLL_MS);

        return () => clearInterval(id);
    }, [ready, emitLocal]);

    const handlers = useMemo(
        () => ({
            onReady: handleReady,
            onStateChange: handleStateChange,
            onError: handleError,
        }),
        [handleReady, handleStateChange, handleError],
    );

    return {
        ready,
        startVideoId,
        getState,
        applyState,
        preload,
        suppress,
        handlers,
    };
}
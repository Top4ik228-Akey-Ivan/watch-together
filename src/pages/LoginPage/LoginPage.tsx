import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseYoutubeUrl } from "@/lib/parseYoutubeUrl";
import { createRoomId } from "@/lib/roomId";
import { warmUpSignaling } from "@/lib/warmUp";

export default function CreateRoomCard() {
  const navigate = useNavigate();

  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    warmUpSignaling();
  }, []);

  const handleCreateRoom = () => {
    const videoId = parseYoutubeUrl(url);

    if (!videoId) {
      setError("Это не похоже на ссылку YouTube");
      return;
    }

    navigate(`/room/${createRoomId()}`, {
      state: { host: true, videoId },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>🍿 Watch Together</CardTitle>
          <CardDescription>
            Создайте комнату и смотрите YouTube вместе с друзьями.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateRoom();
            }}
            className="space-y-4"
          >
            <Input
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                if (error) setError("");
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              aria-invalid={!!error}
              autoComplete="off"
              autoFocus
            />

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full">
              Создать комнату
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
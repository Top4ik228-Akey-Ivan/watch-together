import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseYoutubeUrl } from "@/lib/parseYoutubeUrl";

type Props = {
  disabled?: boolean;
  onChange: (videoId: string) => void;
};

export default function ChangeVideoForm({ disabled, onChange }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    const videoId = parseYoutubeUrl(url);

    if (!videoId) {
      setError("Это не похоже на ссылку YouTube");
      return;
    }

    onChange(videoId);
    setUrl("");
    setError("");
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError("");
          }}
          placeholder="Ссылка на другое видео"
          aria-label="Ссылка на другое видео"
          aria-invalid={!!error}
          autoComplete="off"
          disabled={disabled}
        />
        <Button
          type="submit"
          disabled={disabled || !url.trim()}
          className="shrink-0"
        >
          Сменить
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
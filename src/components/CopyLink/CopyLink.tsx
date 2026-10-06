import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
    url: string;
};

export default function CopyLink({ url }: Props) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timerRef.current), []);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Не удалось скопировать, выделите ссылку вручную");
        }
    };

    return (
        <div className="flex gap-2">
            <Input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Ссылка на комнату"
            />
            <Button type="button" onClick={handleCopy} className="shrink-0">
                {copied ? <Check /> : <Copy />}
                {copied ? "Готово" : "Копировать"}
            </Button>
        </div>
    );
}
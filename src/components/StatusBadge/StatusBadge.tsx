import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/types";

const CONFIG: Record<Status, { label: string; dot: string; pulse: boolean }> = {
  connecting: { label: "Подключаемся…", dot: "bg-yellow-500", pulse: true },
  waiting: { label: "Ждём друга", dot: "bg-blue-500", pulse: true },
  connected: { label: "Друг в комнате", dot: "bg-green-500", pulse: false },
  error: { label: "Ошибка", dot: "bg-red-500", pulse: false },
};

type Props = {
  status: Status;
  className?: string;
};

export default function StatusBadge({ status, className }: Props) {
  const { label, dot, pulse } = CONFIG[status];

  return (
    <Badge variant="outline" className={cn("gap-2", className)}>
      <span
        className={cn("size-2 rounded-full", dot, pulse && "animate-pulse")}
        aria-hidden
      />
      {label}
    </Badge>
  );
}
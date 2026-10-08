import { useEffect, useState } from "react";

// true, если `active` держится дольше `ms` миллисекунд
export function useSlowHint(active: boolean, ms = 6000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);

  return slow;
}
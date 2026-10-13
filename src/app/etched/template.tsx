/** Re-mounts on every navigation inside /etched: new page content fades in and rises 12px. */
import type { ReactNode } from "react";
import { PageFade } from "@/components/shared/PageCurtain";

export default function EtchedTemplate({ children }: { children: ReactNode }) {
  return <PageFade>{children}</PageFade>;
}

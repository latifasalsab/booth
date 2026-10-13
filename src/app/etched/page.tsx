/** /etched: the booth itself (fixed 100dvh). */
import EtchedBooth from "@/booths/etched/components/EtchedBooth";
import { etchedConfig } from "@/booths/etched/config";

export default function EtchedPage() {
  return <EtchedBooth sound={etchedConfig.sound} />;
}

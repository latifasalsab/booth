/** /etched: the booth itself (fixed 100dvh). The heavy component loads with next/dynamic behind a small skeleton. */
import dynamic from "next/dynamic";
import BoothSkeleton from "@/booths/etched/components/BoothSkeleton";
import { etchedConfig } from "@/booths/etched/config";

const EtchedBooth = dynamic(() => import("@/booths/etched/components/EtchedBooth"), { loading: () => <BoothSkeleton /> });

export default function EtchedPage() {
  return <EtchedBooth sound={etchedConfig.sound} />;
}

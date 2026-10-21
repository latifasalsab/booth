/** Etched Booth loading state: sits inside the booth shell (charcoal + grain already there), same LOADING label. */
import Loader from "@/components/shared/Loader";

export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Loader />
    </div>
  );
}

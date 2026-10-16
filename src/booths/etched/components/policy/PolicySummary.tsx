/** Three big policy points (Anton), each with a small line icon. Revealed with a short stagger. */
import Reveal from "@/components/shared/Reveal";
import type { PolicyIcon } from "../../content/policy";

function Icon({ name }: { name: PolicyIcon }) {
  const common = { viewBox: "0 0 24 24", width: 26, height: 26, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "device")
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="12" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    );
  if (name === "camera")
    return (
      <svg {...common}>
        <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

export default function PolicySummary({ points }: { points: { icon: PolicyIcon; text: string }[] }) {
  return (
    <ul className="grid gap-6">
      {points.map((p, i) => (
        <li key={p.text}>
          <Reveal delay={i * 0.07} className="flex items-center gap-4">
            <span className="icon-box">
              <Icon name={p.icon} />
            </span>
            <p className="t-point">{p.text}</p>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

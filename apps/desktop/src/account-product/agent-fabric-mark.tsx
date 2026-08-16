import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

export const AGENT_FABRIC_MARK_PATH = "M590 194C696 200 775 282 811 407C839 505 840 627 810 692C769 762 670 780 512 780C353 780 255 762 218 694C183 641 191 542 230 444C280 318 421 225 548 198C562 195 576 193 590 194ZM396 434C413 434 427 448 427 465V525C427 542 413 556 396 556C379 556 365 542 365 525V465C365 448 379 434 396 434ZM629 434C646 434 660 448 660 465V525C660 542 646 556 629 556C612 556 598 542 598 525V465C598 448 612 434 629 434Z";

export const AgentFabricMark: LucideIcon = forwardRef<SVGSVGElement, Omit<LucideProps, "ref">>(function AgentFabricMark(
  { size = 24, color = "currentColor", strokeWidth: _strokeWidth, absoluteStrokeWidth: _absoluteStrokeWidth, ...props },
  ref,
) {
  void _strokeWidth;
  void _absoluteStrokeWidth;
  return <svg
    ref={ref}
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    fill="none"
    color={color}
    focusable="false"
    data-agent-fabric-mark=""
    {...props}
  >
    <path d={AGENT_FABRIC_MARK_PATH} fill="currentColor" fillRule="evenodd" clipRule="evenodd" stroke="none" />
  </svg>;
});

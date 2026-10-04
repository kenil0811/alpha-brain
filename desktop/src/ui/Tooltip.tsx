import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { Info } from "./icons";

/** Wrap the app once so tooltips share one delay. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={300}>{children}</RadixTooltip.Provider>;
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip" sideOffset={6}>
          {text}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/** The explanation beside a title, as a small mark that says it on hover or focus: the title
 *  stays short and the page quiet (an idea from pull request #3). */
export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip text={text}>
      <button type="button" className="infotip" aria-label={text}>
        <Info size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

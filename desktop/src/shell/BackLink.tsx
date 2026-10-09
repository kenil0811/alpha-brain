/** The way back from an item's page to the list it belongs to, in the page header's left slot
 *  (the UI rulebook §5). A button with an icon, never a character arrow. */
import { Button } from "../ui";
import { ArrowLeft, ICON_SM } from "../ui/icons";

export function BackLink({ to, onClick }: { to: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      <ArrowLeft size={ICON_SM} aria-hidden="true" /> {to}
    </Button>
  );
}

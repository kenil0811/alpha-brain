/**
 * The composer's "+" menu (after Alpha's AttachMenu). Advanced -> Model picks which model this
 * conversation's messages go to, and its model; the composer itself never shows it. The default
 * is the starred row in Settings -> Models.
 *
 * ponytail: no "add files / folder / image / audio" yet: AB's core takes text turns only and the
 * window can't hand it a file's path. Add them with a host file dialog and a core endpoint.
 */
import { useState } from "react";
import { Check, Plus, Settings2 } from "lucide-react";
import type { Client, ModelProvider, ModelRoute, ProviderModel } from "../core/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, IconButton } from "../ui";

export function AttachMenu({ client, thread }: { client: Client; thread: string | null }) {
  const [rows, setRows] = useState<ModelProvider[] | null>(null);
  const [route, setRoute] = useState<ModelRoute | null>(null);
  const [models, setModels] = useState<ProviderModel[]>([]);

  const loadModels = (provider: string) => {
    setModels([]);
    client
      .providerModels(provider)
      .then((p) => setModels(p.models))
      .catch(() => undefined);
  };
  const onOpen = (open: boolean) => {
    if (!open) return;
    client.modelProviders().then(setRows, () => undefined);
    client.route(thread).then((r) => {
      setRoute(r);
      loadModels(r.provider);
    }, () => undefined);
  };
  const choose = (provider: string | null, model: string | null = null) => {
    client.setRoute(thread, provider, model).then((r) => {
      setRoute(r);
      if (r.provider !== route?.provider) loadModels(r.provider);
    }, () => undefined);
  };

  const star = rows?.find((r) => r.default)?.id;
  const active = rows?.find((r) => r.id === route?.provider);
  const current = models.find((m) => m.id === route?.model);
  return (
    <DropdownMenu onOpenChange={onOpen}>
      <DropdownMenuTrigger asChild>
        <IconButton aria-label="More for this message" size="sm" className="composer__plus">
          <Plus size={14} aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Settings2 size={14} aria-hidden="true" /> Advanced
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            {(rows ?? []).map((r) => {
              const ticked = r.id === route?.provider;
              return (
                <DropdownMenuItem key={r.id} onSelect={() => choose(r.id === star ? null : r.id)}>
                  <span className={`ui-menu__dot ui-menu__dot--${r.dot.color}`} title={r.dot.tooltip} aria-hidden="true" />
                  <span className="ui-menu__body truncate">
                    {r.label}
                    {r.id === star ? " (default)" : ""}
                  </span>
                  {ticked ? <Check size={14} aria-hidden="true" className="ui-menu__check" /> : <span className="ui-menu__check" />}
                </DropdownMenuItem>
              );
            })}
            {active && models.length ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <span className="ui-menu__check" />
                  <span className="ui-menu__body truncate">
                    {active.label} model{current ? ` · ${current.label}` : ""}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {models.map((m) => (
                    <DropdownMenuItem key={m.id} onSelect={() => choose(active.id, m.id)}>
                      {m.id === route?.model ? <Check size={14} aria-hidden="true" className="ui-menu__check" /> : <span className="ui-menu__check" />}
                      <span className="ui-menu__body truncate">{m.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

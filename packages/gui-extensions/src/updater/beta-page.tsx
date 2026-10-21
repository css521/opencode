import { Show } from "solid-js"
import { Option } from "effect"
import { Button } from "@opencode/ui/button"
import { useExtension } from "../sdk"
import { Section } from "./beta-dialog"
import { allBetaNotes, betaHistory, decodeEmbeddedNotes, type EmbeddedNotes } from "./beta-notes"
import type definition from "./index"

/** Settings > What's new in beta: every change this build carries, as the dialog shows them. */
export default function BetaNotesPage() {
  const ctx = useExtension<typeof definition>()

  return (
    <BetaNotesView
      embedded={Option.getOrUndefined(decodeEmbeddedNotes(import.meta.env.OPENCODE_BETA_NOTES))}
      open={(href) => ctx.system.openExternal(href)}
    />
  )
}

export function BetaNotesView(props: { embedded: EmbeddedNotes | undefined; open: (href: string) => void }) {
  const ctx = useExtension<typeof definition>()

  return (
    <Show when={props.embedded}>
      {(embedded) => {
        const notes = allBetaNotes(embedded())

        return (
          <>
            <div class="settings-tab-header">
              <div class="settings-tab-header-row">
                <div class="flex flex-col gap-1">
                  <h2 class="settings-tab-title">{ctx.t("beta.title")}</h2>
                  <span class="text-11-regular text-v2-text-text-muted">{ctx.t("beta.page.description")}</span>
                </div>
                <div class="settings-tab-header-actions">
                  <Button type="button" variant="ghost" onClick={() => props.open(betaHistory(embedded()))}>
                    {ctx.t("beta.github")}
                  </Button>
                </div>
              </div>
            </div>
            <div class="settings-tab-body settings-tab-body--sectioned">
              <Section title={ctx.t("beta.added")} notes={notes.added} open={props.open} />
              <Section title={ctx.t("beta.fixed")} notes={notes.fixed} open={props.open} />
            </div>
          </>
        )
      }}
    </Show>
  )
}

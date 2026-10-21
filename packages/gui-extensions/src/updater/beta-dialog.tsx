import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Option } from "effect"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { enter, prefersReducedMotion } from "@opencode/ui/motion"
import { useExtension, type DialogHandle, type SetupContext } from "../sdk"
import {
  betaBuild,
  decodeEmbeddedNotes,
  sliceBetaNotes,
  visualSource,
  type BetaNote,
  type BetaNotes,
} from "./beta-notes"
import type definition from "./index"

/**
 * Shows the features and fixes this beta build carries since the commit of the build the user saw last, and remembers
 * this build as seen. Everything comes from the build itself; only the links reach the network, when clicked.
 */
export function showBetaNotes(
  ctx: SetupContext<typeof definition>,
  input: { readonly previous: string; readonly previousCommit: string | undefined; readonly markSeen: () => void },
) {
  const notes = Option.flatMap(decodeEmbeddedNotes(import.meta.env.OPENCODE_BETA_NOTES), (embedded) =>
    sliceBetaNotes(embedded, input.previousCommit),
  )

  input.markSeen()

  if (Option.isNone(notes)) return

  ctx.dialogs.open(
    (dialog) => (
      <DialogBetaNotes
        notes={notes.value}
        previous={input.previous}
        dialog={dialog}
        open={(href) => ctx.system.openExternal(href)}
        viewAll={() => {
          dialog.close()
          ctx.layout.settings("whats-new")
        }}
      />
    ),
    { replace: true },
  )
}

/** What's new in beta: the listed features and fixes, and the What's new page when some are not listed. */
export function DialogBetaNotes(props: {
  notes: BetaNotes
  previous: string
  dialog: DialogHandle
  open: (href: string) => void
  viewAll: () => void
}) {
  const ctx = useExtension<typeof definition>()
  const [fade, setFade] = createSignal({ top: 0, bottom: 0 })
  let list!: HTMLDivElement

  // The edges feather by as much as there is left to scroll, so they appear and leave without a jump.
  const measure = () =>
    setFade({
      top: Math.min(FADE, list.scrollTop),
      bottom: Math.min(FADE, list.scrollHeight - list.clientHeight - list.scrollTop),
    })

  onMount(() => {
    measure()
    createResizeObserver(list, measure)
    list
      .querySelectorAll("[data-beta-icon]")
      // A quick settle as the dialog opens: every icon is in place within 150 ms, and reduced motion skips it.
      .forEach((icon, index) => enter(icon, { scale: 0.9, duration: 110, delay: Math.min(index, 4) * 10 }))
  })

  return (
    <Dialog fit containerClass="w-[min(calc(100vw-32px),520px)]!">
      <DialogHeader>
        <DialogTitleGroup
          title={ctx.t("beta.title")}
          description={ctx.plural("beta.since", props.notes.total, { build: betaBuild(props.previous) })}
        />
      </DialogHeader>
      <DialogBody class="min-h-0">
        <div
          ref={list}
          class="flex max-h-[min(calc(100vh-220px),440px)] flex-col gap-5 overflow-y-auto px-4 pb-2"
          style={{
            "mask-image":
              fade().top || fade().bottom
                ? `linear-gradient(to bottom, transparent, #000 ${fade().top}px, #000 calc(100% - ${fade().bottom}px), transparent)`
                : undefined,
          }}
          onScroll={measure}
        >
          <Section title={ctx.t("beta.added")} notes={props.notes.added} open={props.open} />
          <Section title={ctx.t("beta.fixed")} notes={props.notes.fixed} open={props.open} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Show when={props.notes.more}>
          <Button type="button" variant="ghost" class="me-auto" onClick={() => props.viewAll()}>
            {ctx.t("beta.viewAll")}
          </Button>
        </Show>
        <Button type="button" variant="contrast" autofocus onClick={() => props.dialog.close()}>
          {ctx.t("beta.done")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

/** How far the list's edges feather once it scrolls. */
const FADE = 24

export function Section(props: { title: string; notes: readonly BetaNote[]; open: (href: string) => void }) {
  return (
    <Show when={props.notes.length > 0}>
      <section class="flex flex-col gap-2">
        <h2 class="m-0 text-12-medium leading-[var(--line-height-compact)] text-v2-text-text-muted">{props.title}</h2>
        <ul class="m-0 flex list-none flex-col gap-3.5 p-0">
          <For each={props.notes}>
            {(note) => (
              <li class="flex min-w-0 items-start gap-3">
                <span aria-hidden="true" class="mt-0.5 flex size-4 shrink-0 text-v2-icon-icon-muted">
                  <Show when={!note.visual}>
                    <span data-beta-icon class="flex">
                      <KindIcon type={note.type} />
                    </span>
                  </Show>
                </span>
                <div class="flex min-w-0 flex-1 flex-col gap-1.5 [overflow-wrap:anywhere]">
                  <p class="m-0 text-[13px] leading-5 font-[500] tracking-[-0.04px] text-v2-text-text-base">
                    {note.summary}
                  </p>
                  <Show when={note.visual}>{(visual) => <Visual visual={visual()} label={note.description} />}</Show>
                  <Meta note={note} open={props.open} />
                </div>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  )
}

/** What changed, drawn: the pull request's looping SVG, only ever as an image, in the dialog's icon colour. */
function Visual(props: { visual: NonNullable<BetaNote["visual"]>; label?: string }) {
  const [color, setColor] = createSignal<string>()
  let frame!: HTMLSpanElement

  // The theme lives on the root element's attributes; read the colour again when they change.
  onMount(() => {
    const read = () => setColor(getComputedStyle(frame).color)
    const observer = new MutationObserver(read)

    read()
    observer.observe(document.documentElement, { attributes: true })
    onCleanup(() => observer.disconnect())
  })

  return (
    <span
      ref={frame}
      class="block h-[72px] w-[240px] max-w-full rounded-[8px] bg-current/[0.04] text-v2-icon-icon-base"
    >
      <Show when={color()}>
        {(value) => (
          <img
            src={visualSource(props.visual, { color: value(), still: prefersReducedMotion() })}
            alt={props.label ?? ""}
            width="240"
            height="72"
            draggable={false}
            class="block size-full object-contain"
          />
        )}
      </Show>
    </span>
  )
}

/** Who made it and its pull request, quietly. */
function Meta(props: { note: BetaNote; open: (href: string) => void }) {
  return (
    <Show when={props.note.author || props.note.pr}>
      <div class="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] leading-4 font-[440] text-v2-text-text-faint">
        <Show when={props.note.author}>
          {(author) => (
            <span class="flex min-w-0 items-center gap-1.5 text-v2-text-text-muted">
              <Avatar name={author().name} src={author().avatar} />
              {author().name}
            </span>
          )}
        </Show>
        <Show when={props.note.pr}>
          {(pr) => (
            <>
              <Show when={props.note.author}>
                <span aria-hidden="true">·</span>
              </Show>
              <a
                href={pr().url}
                class="rounded-[4px] tabular-nums text-v2-text-text-faint underline-offset-2 hover:text-v2-text-text-base hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={(event) => {
                  event.preventDefault()
                  props.open(pr().url)
                }}
              >
                #{pr().number}
              </a>
            </>
          )}
        </Show>
      </div>
    </Show>
  )
}

/** The author's initial, which the avatar fades in over once it loads; an avatar that fails leaves the initial. */
function Avatar(props: { name: string; src?: string }) {
  const [loaded, setLoaded] = createSignal(false)

  return (
    <span
      aria-hidden="true"
      class="relative grid size-4 shrink-0 place-items-center overflow-hidden rounded-full bg-v2-background-bg-layer-02 text-[9px] leading-none font-[530] text-v2-text-text-muted uppercase after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_0_0_0.5px_var(--v2-border-border-base)]"
    >
      {Array.from(props.name.trim())[0]}
      <Show when={props.src}>
        {(src) => (
          <img
            src={src()}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            class="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-200 ease-out"
            classList={{ "opacity-100": loaded() }}
            onLoad={() => setLoaded(true)}
          />
        )}
      </Show>
    </span>
  )
}

/** Stands in for a change without a visual. New is a sparkle, a fix a check, a speedup a bolt. */
function KindIcon(props: { type: BetaNote["type"] }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linejoin="round">
      <Switch>
        <Match when={props.type === "feat"}>
          <path d="M8 2.5c.4 3.1 2.4 5.1 5.5 5.5-3.1.4-5.1 2.4-5.5 5.5-.4-3.1-2.4-5.1-5.5-5.5 3.1-.4 5.1-2.4 5.5-5.5Z" />
        </Match>
        <Match when={props.type === "fix"}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="m5.75 8.25 1.5 1.5 3-3.25" stroke-linecap="round" />
        </Match>
        <Match when={props.type === "perf"}>
          <path d="M8.75 2.5 4.5 9h3.25l-.5 4.5L11.5 7H8.25l.5-4.5Z" />
        </Match>
      </Switch>
    </svg>
  )
}

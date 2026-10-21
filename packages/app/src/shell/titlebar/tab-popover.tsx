import { HoverCard } from "@kobalte/core/hover-card"
import { frameLoop, prefersReducedMotion, Spring } from "@opencode/ui/motion"
import { motionTuning } from "@opencode/ui/motion-tuning"
import { createEffect, createSignal, on, onCleanup, Show, type JSXElement } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { createMediaQuery } from "@solid-primitives/media"
import "./tab-popover.css"

// Initial hover delay before the preview appears, per design.
const OPEN_DELAY = 750

const CLOSE_DELAY = 0

// After a preview closes, hovering a neighbouring tab within this window skips
// the open delay — mirrors the tooltip's skipDelayDuration so moving across
// tabs doesn't re-wait the full delay each time.
const SKIP_WINDOW = 500

let lastClosedAt = 0

let activePreview: (() => void) | undefined

const glides = motionTuning.toggle("sidebars.preview.glide", {
  label: "Tab preview glides",
  group: "Sidebars",
  value: true,
})

const spring = motionTuning.spring("sidebars.preview", {
  label: "Tab preview glide",
  group: "Sidebars",
  presets: {
    snappy: { duration: 0.2, bounce: 0 },
    smooth: { duration: 0.28, bounce: 0 },
    calm: { duration: 0.36, bounce: 0 },
  },
})

// In the vertical strip, a preview that closes stays behind as a stand-in. If the next tab's preview opens within a
// couple of frames, the stand-in and the new card travel together from the old place to the new tab while the new text
// fades in over the old; otherwise the stand-in goes, as a closed preview does.
const glide: Glide = {
  left: 0,
  // The stand-in's visual top, and the new card's laid-out top once its positioner has placed it.
  top: 0,
  base: Number.NaN,
  frames: 0,
  offset: Spring.fromDuration(0, spring()),
  fade: Spring.fromDuration(1, { duration: 0.15, bounce: 0 }),
}

export interface TabPreviewData {
  projectName?: string
  title?: string
  path?: string
  serverName?: string
}

export function TabPreviewPopover(props: {
  trigger: JSXElement
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TabPreviewData
  orientation?: "horizontal" | "vertical"
}) {
  const language = useLanguage()
  const mobile = createMediaQuery("(max-width: 767px)")
  let triggerEl: HTMLDivElement | undefined
  let card: HTMLElement | undefined
  // When opened during a rapid tab-hopping streak, this preview appears and
  // disappears instantly (no repeated enter/exit animation) — only the first,
  // "cold" preview animates. Mirrors how browsers reuse one tab tooltip.
  const [instant, setInstant] = createSignal(false)

  const warm = () => !!activePreview || Date.now() - lastClosedAt < SKIP_WINDOW
  const open = () => props.open && !mobile()
  const close = () => props.onOpenChange(false)

  // Observe accepted, controlled state, including drag/menu suppression in TabNav.
  createEffect(() => {
    if (open()) {
      if (activePreview !== close) activePreview?.()
      activePreview = close

      return
    }

    if (activePreview !== close) return
    activePreview = undefined
    lastClosedAt = Date.now()
  })
  createEffect(
    on(
      open,
      (now, before) => {
        if (before && !now && card && props.orientation === "vertical" && glides()) leave(card)
      },
      { defer: true },
    ),
  )
  onCleanup(() => {
    if (activePreview !== close) return
    activePreview = undefined
    lastClosedAt = Date.now()
  })
  // Kobalte reads openDelay lazily when the pointer enters the trigger, so this
  // resolves the skip window per-hover.
  const resolveOpenDelay = () => (warm() ? 0 : OPEN_DELAY)

  const handleOpenChange = (open: boolean) => {
    if (open) setInstant(warm())
    props.onOpenChange(open)
  }

  // Kept out of JSX: an inline nested ternary compiles to a memo created on every read, and Kobalte reads
  // placement from a ResizeObserver callback, where that memo has no owner and is never disposed.
  const placement = () =>
    props.orientation === "vertical" ? (language.direction() === "rtl" ? "left-start" : "right-start") : "bottom-start"

  return (
    <HoverCard
      open={open()}
      onOpenChange={handleOpenChange}
      openDelay={resolveOpenDelay()}
      closeDelay={CLOSE_DELAY}
      // Informational previews belong to their tab, not to a hoverable safe area.
      ignoreSafeArea
      placement={placement()}
      gutter={6}
    >
      <HoverCard.Trigger ref={triggerEl} as="div" data-component="session-tab-popover-trigger" tabIndex={-1}>
        {props.trigger}
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          ref={(el) => {
            // Portalled content lives outside the themed subtree, so mirror the
            // active theme like the v2 tooltip does.
            const theme = triggerEl?.closest("[data-theme]")?.getAttribute("data-theme")

            if (theme) el.setAttribute("data-theme", theme)
            card = el

            if (props.orientation !== "vertical" || !glides()) return

            if (glide.ghost) claim(el)
            glide.opened = { card: el, at: performance.now() }
            measure(el)
          }}
          data-component="session-tab-popover"
          data-instant={instant() || undefined}
        >
          <div data-slot="header">
            <Show when={props.data.projectName}>
              <span data-slot="project">{props.data.projectName}</span>
            </Show>
            <Show when={props.data.title}>
              <span data-slot="title">{props.data.title}</span>
            </Show>
          </div>

          <Show when={props.data.path}>
            <div data-slot="row">
              <span data-slot="detail">{props.data.path}</span>
            </div>
          </Show>

          <Show when={props.data.serverName}>
            <div data-slot="server">{props.data.serverName}</div>
          </Show>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard>
  )
}

function leave(card: HTMLElement) {
  // A card closing before it was placed hands the stand-in it was taking over to the next one.
  if (card === glide.card && Number.isNaN(glide.base)) {
    glide.card = undefined
    glide.frames = 0

    return
  }

  const rect =
    card === glide.card
      ? { left: glide.left, top: glide.top }
      : card.isConnected
        ? card.getBoundingClientRect()
        : placed.get(card)

  if (!rect) return
  glide.ghost?.remove()
  // SAFETY: cloning an element yields an element.
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.dataset.component = "session-tab-popover-ghost"
  ghost.setAttribute("aria-hidden", "true")
  ghost.removeAttribute("id")
  ghost.removeAttribute("role")
  Object.assign(ghost.style, { position: "fixed", left: "0", top: "0", opacity: "1" })
  ghost.style.transform = `translate(${rect.left}px, ${rect.top}px)`
  document.body.append(ghost)
  Object.assign(glide, { ghost, card: undefined, left: rect.left, top: rect.top, base: Number.NaN, frames: 0 })
  glide.stop ??= frameLoop.addMeasured(read, write)

  // The next tab's preview usually opens first and closes this one, in the same task.
  const opened = glide.opened

  if (opened && opened.card !== card && opened.card.isConnected && performance.now() - opened.at < 50) claim(opened.card)
}

// Where each open card was placed. Kobalte may already have removed a closing card by the time it hands over.
const placed = new WeakMap<HTMLElement, DOMRect>()

function measure(card: HTMLElement) {
  frameLoop.addMeasured(
    () => {
      if (card.parentElement?.style.transform) placed.set(card, card.getBoundingClientRect())
    },
    () => card.isConnected && !placed.has(card),
  )
}

function claim(card: HTMLElement) {
  card.style.opacity = "0"
  glide.card = card
  glide.base = Number.NaN
}

function read() {
  // Kobalte's positioner gets its transform once floating-ui has placed it.
  if (glide.card && Number.isNaN(glide.base) && glide.card.parentElement?.style.transform)
    glide.base = glide.card.getBoundingClientRect().top
}

function write(dt: number) {
  const ghost = glide.ghost

  if (!ghost) return finish()

  if (!glide.card || Number.isNaN(glide.base)) {
    glide.frames++

    return glide.frames <= (glide.card ? 6 : 2) || finish()
  }

  if (glide.frames >= 0) {
    // Starts from where the stand-in is, keeping the velocity of a glide already under way.
    glide.offset.value = glide.top - glide.base
    glide.offset.target = 0
    glide.fade.snap(0)
    glide.fade.set(1)
    glide.frames = -1
  }

  glide.offset.omega = (2 * Math.PI) / spring().duration
  glide.offset.zeta = 1 - spring().bounce

  if (prefersReducedMotion()) glide.offset.snap(0)
  const offset = glide.offset.step(dt)
  const fade = glide.fade.step(dt)
  glide.top = glide.base + offset
  glide.card.style.transform = `translateY(${offset}px)`
  glide.card.style.opacity = String(fade)
  ghost.style.transform = `translate(${glide.left}px, ${glide.top}px)`
  // The stand-in stays opaque under the incoming text until it is half in, so the card never looks see-through.
  ghost.style.opacity = String(Math.min(1, 2 - 2 * fade))

  return !(glide.offset.resting && glide.fade.resting) || finish()
}

function finish() {
  glide.card?.style.removeProperty("opacity")
  glide.ghost?.remove()
  glide.ghost = undefined
  glide.stop = undefined

  return false
}

type Glide = {
  ghost?: HTMLElement
  card?: HTMLElement
  left: number
  top: number
  base: number
  frames: number
  offset: Spring
  fade: Spring
  stop?: () => void
  opened?: { card: HTMLElement; at: number }
}

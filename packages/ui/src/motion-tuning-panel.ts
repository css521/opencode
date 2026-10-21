import type { DurationOptions } from "./motion"
import { motionPresets, motionTuning, type Bezier, type MotionKnob, type MotionPreset } from "./motion-tuning"

const global = "Global"

const experiments = "Experiments"

/**
 * Mounts the Motion workspace into `container`: a tab per surface under the shipped values and the Snappy, Smooth and
 * Calm presets for every spring at once. Each tab shows one Global card (speed, slow motion and other settings every surface reads), then one
 * card for its surface: its springs and knobs, with its replay buttons under a Replay sub-heading. knobs loads on first
 * mount, so importing this module costs nothing until then. Works anywhere a surface registered its knobs, including
 * Storybook stories. Returns its removal.
 */
export function mountMotionPanel(
  container: HTMLElement,
  options: { title?: string; section?: string; onClose?: () => void } = {},
) {
  let unmount: (() => void) | undefined
  // The preset chosen to leave a mode, applied once the rebuilt panel has the knobs it sets.
  let switching: string | undefined
  let disposed = false
  let section = options.section

  void start()

  return () => {
    disposed = true
    unmount?.()
  }

  async function start() {
    const { action, choice, defineControls, easing, knob, spring, toggle } = await import("knobs")

    // A lone section needs no tab strip.
    let tabbed = () => false

    const field = (item: MotionKnob) => {
      const meta = { label: item.label, group: item.group, tab: tabbed() ? (item.section ?? item.group) : undefined }

      if (item.kind === "spring") return spring(item.initial, meta)

      // Modes never reach here as rows; they sit in the preset strip.
      if (item.kind === "toggle" || item.kind === "mode") return toggle(item.initial, meta)

      if (item.kind === "easing") return easing(item.initial, meta)

      if (item.kind === "choice") return choice(item.initial, item.options, { ...meta, labels: item.labels })

      return knob(item.initial, { ...meta, min: item.min, max: item.max, step: item.step, unit: item.unit ?? "×" })
    }

    const apply = (item: MotionKnob, value: MotionKnob["value"]) => {
      if (item.kind === "spring") {
        // SAFETY: a spring knob's field is a spring field.
        return motionTuning.set(item, value as DurationOptions)
      }

      if (item.kind === "easing") {
        // SAFETY: an easing knob's field is an easing field.
        return motionTuning.set(item, [...(value as Bezier)] as Bezier)
      }

      if (item.kind === "toggle" || item.kind === "mode") {
        // SAFETY: a toggle knob's field is a toggle field.
        return motionTuning.set(item, value as boolean)
      }

      if (item.kind === "choice") {
        // SAFETY: a choice knob's field is a choice field.
        return motionTuning.set(item, value as string)
      }

      // SAFETY: a number knob's field is a number field.
      motionTuning.set(item, value as number)
    }

    // Knobs whose `when` doesn't hold are left out; a change to it rebuilds the panel like a new knob would.
    const shown = () => motionTuning.list().filter((item) => item.when?.() ?? true)

    const identity = () => [...shown(), ...motionTuning.actions()].map((item) => `${item.group}/${item.id}`).join()

    // Rebuilt when a surface registers or removes a knob or action.
    const mount = () => {
      unmount?.()
      const all = shown()
      // Modes sit in the preset strip, not as rows. While one is on, the spring presets leave its section's springs alone
      // (choosing one on that section's tab switches back to them first); other sections' springs take presets as usual.
      const active = all.find((item) => item.kind === "mode" && item.value)
      const list = all.filter((item) => item.kind !== "mode")
      const actions = motionTuning.actions()
      const mounted = identity()
      const sectionOf = (item: { group: string; section?: string }) => item.section ?? item.group
      const springs = list.flatMap((item) => (item.kind === "spring" && item.group !== active?.group ? [item] : []))
      const preset = (id: MotionPreset) => Object.fromEntries(springs.map((item) => [item.id, item.presets[id]]))
      // Easing editors open inline, like the spring rows beside them, rather than folded behind a chevron.
      openEditors(list.flatMap((item) => (item.kind === "easing" ? [item.id] : [])))

      const sections = [
        ...new Set([...list, ...actions].flatMap((item) => (item.group === global ? [] : [sectionOf(item)]))),
      ].toSorted(
        // Experiments come and go, so they sit last.
        (a, b) => Number(a === experiments) - Number(b === experiments),
      )

      tabbed = () => sections.length > 1

      // A mode sits in the strip only on its own section's tab; switching to or from that tab rebuilds the strip.
      const modes = all.flatMap((item) =>
        item.kind === "mode" && sectionOf(item) === (section ?? sections[0]) ? [item] : [],
      )

      const controls = defineControls(
        "opencode-motion",
        {
          // Global first, then each section's knobs and its replay buttons together, so each shows as one card.
          ...Object.fromEntries(list.filter((item) => item.group === global).map((item) => [item.id, field(item)])),
          ...Object.fromEntries(
            [...list, ...actions]
              .filter((item) => item.group !== global)
              .toSorted((a, b) => sections.indexOf(sectionOf(a)) - sections.indexOf(sectionOf(b)))
              .map((item) =>
                "run" in item
                  ? [
                      `action.${item.id}`,
                      action(item.label, {
                        group: item.group,
                        tab: tabbed() ? sectionOf(item) : undefined,
                        subsection: "Replay",
                        run: item.run,
                      }),
                    ]
                  : [item.id, field(item)],
              ),
          ),
        },
        {
          // knobs enables itself only on localhost; this module is only loaded in developer channels.
          enabled: true,
          ship: () => import("knobs/panel"),
          // Global sits above the tabs and presets leave it alone.
          pinned: [global],
          persist: "variants",
          // Springs ship different presets, so the defaults get their own chip.
          defaultLabel: "Shipped",
          presetLabels: { ...motionPresets, ...Object.fromEntries(modes.map((item) => [item.id, item.label])) },
          presets: {
            snappy: preset("snappy"),
            smooth: preset("smooth"),
            calm: preset("calm"),
            ...Object.fromEntries(modes.map((item) => [item.id, {}])),
          },
          onChange: (patch) =>
            list.forEach((item) => {
              // SAFETY: each field was made from its knob above, so its value is that knob's kind.
              const value = patch[item.id] as MotionKnob["value"] | undefined

              if (value !== undefined) apply(item, value)
            }),
        },
      )

      const sync = () => controls.sync(Object.fromEntries(list.map((item) => [item.id, item.value])))
      sync()

      // The strip shows the mode that's on; a preset chosen while a mode was on applies once its knobs are back.
      if (active && active.id in controls.presets) controls.preset(active.id)

      if (!active && switching && switching in controls.presets) controls.preset(switching)
      switching = undefined

      const stopModes = controls.subscribe(() => {
        const chosen = controls.activePreset()

        modes.forEach((item) => {
          const on = chosen?.kind === "preset" && chosen.id === item.id

          if (on === item.value) return

          if (!on) switching = chosen?.kind === "preset" ? chosen.id : chosen ? undefined : "default"
          motionTuning.set(item, on)
        })
      })

      // What each row and card heading explains and outlines: the first knob of its group that says.
      const about = new Map(
        list.flatMap((item) => {
          const info = list.find((other) => other.group === item.group && (other.description || other.target))

          return info ? [[item.id, info] as const, [item.group, info] as const] : []
        }),
      )

      const stopTarget = explain(container, (key) => about.get(key))

      const stopPanel = controls.mount(container, {
        theme: "auto",
        title: options.title ?? "Knobs",
        onClose: options.onClose,
        // The debug bar shows and hides this panel, and `s` jumps only with focus inside it, so the app keeps its keys.
        toggleKey: false,
        hints: "panel",
        tabs: tabbed() ? sections : undefined,
        tab: section,
        onTab: (id) => {
          const offered = (tab: string | undefined) =>
            all.some((item) => item.kind === "mode" && sectionOf(item) === tab)

          const rebuild = offered(section) !== offered(id)
          section = id

          if (rebuild) mount()
        },
      })

      const stopWatch = motionTuning.subscribe(() => {
        // Edits from elsewhere, such as the debug bar's SLOW, show here too.
        if (identity() === mounted) return sync()
        mount()
      })

      unmount = () => {
        stopWatch()
        stopModes()
        stopTarget()
        stopPanel()
      }
    }

    if (!disposed) mount()
  }
}

// knobs remembers which rows' editors are open in this tab's session; adding ids there opens them on mount.
function openEditors(ids: string[]) {
  if (ids.length === 0 || typeof sessionStorage === "undefined") return
  const key = "knobs:opencode-motion:session:v1"
  const session = JSON.parse(sessionStorage.getItem(key) ?? "{}")
  const expanded: string[] = Array.isArray(session.expanded) ? session.expanded : []

  if (ids.every((id) => expanded.includes(id))) return
  sessionStorage.setItem(key, JSON.stringify({ ...session, expanded: [...new Set([...expanded, ...ids])] }))
}

// What hovering or focusing a row says and shows. knobs shows no group descriptions in a panel, so the description is
// the row's tooltip, and the part of the app it changes gets a pointer-transparent frame that fades in and out. Rows
// carry their key in `data-field` and card headings their group in `data-group`.
function explain(
  container: HTMLElement,
  about: (key: string) => { description?: string; target?: string } | undefined,
) {
  const frames: HTMLElement[] = []

  const clear = () =>
    frames.splice(0).forEach((frame) => {
      frame.style.opacity = "0"
      setTimeout(() => frame.remove(), 200)
    })

  const show = (event: Event) => {
    const spot =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-field], [data-group]") : null

    const info = spot ? about(spot.dataset.field ?? spot.dataset.group ?? "") : undefined

    clear()

    if (!spot || !info) return

    if (info.description) spot.title = info.description

    if (!info.target) return

    document.querySelectorAll(info.target).forEach((element) => {
      const rect = element.getBoundingClientRect()

      if (rect.width === 0 || rect.height === 0) return
      const frame = document.body.appendChild(document.createElement("div"))

      frame.style.cssText = `position:fixed;z-index:60;pointer-events:none;opacity:0;transition:opacity .15s;border-radius:6px;
        left:${rect.left - 3}px;top:${rect.top - 3}px;width:${rect.width + 6}px;height:${rect.height + 6}px;
        border:1.5px solid var(--border-interactive-base);background:color-mix(in srgb, var(--surface-interactive-base) 50%, transparent)`
      requestAnimationFrame(() => (frame.style.opacity = "1"))
      frames.push(frame)
    })
  }

  container.addEventListener("pointerover", show)
  container.addEventListener("focusin", show)
  container.addEventListener("pointerleave", clear)
  container.addEventListener("focusout", clear)

  return () => {
    container.removeEventListener("pointerover", show)
    container.removeEventListener("focusin", show)
    container.removeEventListener("pointerleave", clear)
    container.removeEventListener("focusout", clear)
    clear()
  }
}

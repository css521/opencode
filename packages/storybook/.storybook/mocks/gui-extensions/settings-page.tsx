import type { JSX } from "solid-js"
// Extension settings pages render inside the app's settings panel, which brings these styles.
import "@/settings/settings.css"

export function SettingsPanel(props: { children: JSX.Element }) {
  return <div class="settings-panel h-screen bg-v2-background-bg-base">{props.children}</div>
}

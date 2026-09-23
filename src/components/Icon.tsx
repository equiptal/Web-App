/**
 * The two glyph wrappers, in their own module.
 *
 * They lived in `ui.tsx`, which is fine until something `ui.tsx` itself imports needs one — the
 * house `Dropdown` does, and `Select` in `ui.tsx` is a `Dropdown`, so the two files would import
 * each other. A cycle that happens to work today is a crash the first time module order changes.
 *
 * `ui.tsx` re-exports both, so every existing `import { Icon } from "@/components/ui"` is untouched.
 */

/** Material Icons Outlined glyph (loaded via globals.css). e.g. <Icon name="place" />. */
export function Icon({ name, className = "", size }: { name: string; className?: string; size?: number }) {
  return (
    <span className={`material-icons-outlined ${className}`} style={size ? { fontSize: size } : undefined} aria-hidden>
      {name}
    </span>
  );
}

/** Material Symbols Rounded glyph (for the triage filter nodes). */
export function MIcon({ name, className = "", size }: { name: string; className?: string; size?: number }) {
  return (
    <span className={`material-symbols-rounded ${className}`} style={size ? { fontSize: size } : undefined} aria-hidden>
      {name}
    </span>
  );
}

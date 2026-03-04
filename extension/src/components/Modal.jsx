/**
 * Reusable modal backdrop + content wrapper.
 *
 * Handles:
 *  - Backdrop blur overlay with mousedown-to-close (safe for text selection)
 *  - Consistent content card styling
 *
 * Props:
 *  - onClose        — called when the backdrop is clicked
 *  - zIndex         — Tailwind z-index class (default: "z-50")
 *  - align          — flex alignment for content (default: "items-center justify-center")
 *  - backdropClass  — extra classes on the backdrop div
 *  - contentClass   — extra classes on the content card (merged with defaults)
 *  - backdropProps  — extra props spread onto the backdrop (e.g. drag handlers)
 *  - children       — modal body
 */
export function Modal({
  onClose,
  zIndex = "z-50",
  align = "items-center justify-center",
  backdropClass = "",
  contentClass = "",
  backdropProps = {},
  children,
}) {
  return (
    <div
      class={`modal-backdrop fixed inset-0 flex ${align} ${zIndex} bg-sky-200/60 backdrop-blur-md ${backdropClass}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      {...backdropProps}
    >
      <div
        class={`modal-content rounded-xl p-6 w-96 mx-4 backdrop-blur-xl border border-white/80 ${contentClass}`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Backdrop-only variant for modals that need full control over their
 * content wrapper (e.g. custom positioning, non-standard sizing).
 */
export function ModalBackdrop({
  onClose,
  zIndex = "z-50",
  align = "items-center justify-center",
  backdropClass = "",
  backdropProps = {},
  children,
}) {
  return (
    <div
      class={`modal-backdrop fixed inset-0 flex ${align} ${zIndex} bg-sky-200/60 backdrop-blur-md ${backdropClass}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      {...backdropProps}
    >
      {children}
    </div>
  );
}

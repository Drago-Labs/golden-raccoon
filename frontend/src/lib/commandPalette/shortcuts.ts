export function isEditable(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])");
}
export function isPaletteShortcut(event: KeyboardEvent) {
  return !event.isComposing && event.keyCode !== 229 && !event.altKey && !event.shiftKey
    && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !isEditable(event.target);
}

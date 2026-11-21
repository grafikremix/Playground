// Shared play gate. Idea pages wait on the template Start button.
// Peek and stills run immediately (muted / posed).

export function isLive() {
  const b = document.body
  return (
    b.classList.contains('is-live') ||
    b.classList.contains('is-peek') ||
    b.classList.contains('is-still')
  )
}

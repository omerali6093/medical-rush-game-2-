/** Single time source so tests can fast-forward the 3-minute mission clock without waiting. */
let offsetMs = 0
export const now = () => Date.now() + offsetMs
export const advanceClock = (ms: number) => {
  offsetMs += ms
}

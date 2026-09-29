/** App-wide quit flag so windows can hide instead of destroying during normal close. */

let quitting = false;

export function markAppQuitting() {
  quitting = true;
}

export function isAppQuitting() {
  return quitting;
}

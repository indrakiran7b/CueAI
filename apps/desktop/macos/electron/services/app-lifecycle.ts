/** App-wide quit flag so windows can hide instead of destroying during normal close. */

let quitting = false;
let allowWindowClose = false;

export function markAppQuitting() {
  quitting = true;
}

export function isAppQuitting() {
  return quitting;
}

/** Title-bar Close should actually close the window, not only hide it. */
export function allowNextWindowClose() {
  allowWindowClose = true;
}

export function consumeAllowWindowClose() {
  const next = allowWindowClose;
  allowWindowClose = false;
  return next;
}

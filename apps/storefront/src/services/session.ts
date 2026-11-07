/** Guest order lookup needs the checkout phone; keep it per order reference in sessionStorage. */
const phoneKey = (ref: string) => `dp_order_phone:${ref}`;
const payKey = (ref: string) => `dp_order_payment:${ref}`;

function get(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export const rememberOrderPhone = (ref: string, phone: string) => set(phoneKey(ref), phone);
export const recallOrderPhone = (ref: string) => get(phoneKey(ref));
export const rememberPaymentId = (ref: string, id: string) => set(payKey(ref), id);
export const recallPaymentId = (ref: string) => get(payKey(ref));

// Toasts are page-wide: any component or the post function can raise one.
export interface ToastItem {
  id: number;
  text: string;
  error: boolean;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of [...listeners]) {
    listener();
  }
};

export function toast(text: string, error = false): void {
  const item = { id: nextId++, text, error };
  items = [...items, item];
  emit();
  setTimeout(
    () => {
      items = items.filter((t) => t !== item);
      emit();
    },
    error ? 7000 : 3000,
  );
}

export const toasts = {
  get: () => items,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export async function copyText(text: string, done = "Copied."): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast("The browser blocked the clipboard; select the text instead.", true);
  }
}

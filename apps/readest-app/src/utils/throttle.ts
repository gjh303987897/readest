interface ThrottleOptions {
  emitLast?: boolean;
}

export const throttle = <T extends (...args: Parameters<T>) => void | Promise<void>>(
  func: T,
  delay: number,
  options: ThrottleOptions = { emitLast: true },
): ((...args: Parameters<T>) => void) & { cancel: () => void } => {
  let lastCall = -Infinity;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>): void => {
    const now = Date.now();
    const remaining = delay - (now - lastCall);

    const callFunc = () => {
      lastCall = Date.now();
      timeout = null;
      func(...args);
    };

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      callFunc();
    } else {
      lastArgs = args;
      if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          if (lastArgs && options.emitLast) {
            lastCall = Date.now();
            func(...(lastArgs as Parameters<T>));
            lastArgs = null;
          }
        }, remaining);
      }
    }
  };
  throttled.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
    lastArgs = null;
  };
  return throttled;
};

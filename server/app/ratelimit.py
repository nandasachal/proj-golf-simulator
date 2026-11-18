import threading
import time


class RateLimiter:
    """Token bucket per key: `burst` requests at once, then one every `every` seconds."""

    def __init__(self, burst, every):
        self.burst = burst
        self.every = every
        self.buckets = {}
        self.lock = threading.Lock()

    def allow(self, key):
        now = time.monotonic()
        with self.lock:
            if len(self.buckets) > 10_000:
                self.buckets.clear()
            tokens, last = self.buckets.get(key, (self.burst, now))
            tokens = min(self.burst, tokens + (now - last) / self.every)
            if tokens < 1:
                self.buckets[key] = (tokens, now)
                return False
            self.buckets[key] = (tokens - 1, now)
            return True

    def reset(self):
        with self.lock:
            self.buckets.clear()

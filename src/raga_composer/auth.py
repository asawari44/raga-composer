"""Password hashing, password policy, and sign-in throttling.

Hashes are self-describing (``scrypt$n$r$p$salt$digest``) so the cost can be
raised later: ``needs_rehash`` reports when a stored hash should be upgraded on
the user's next successful sign-in.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**15, 8, 1
MIN_PASSWORD, MAX_PASSWORD = 8, 128

COMMON_PASSWORDS = frozenset(
    (
        "password",
        "password1",
        "password123",
        "passw0rd",
        "12345678",
        "123456789",
        "1234567890",
        "qwerty123",
        "qwertyuiop",
        "11111111",
        "00000000",
        "iloveyou",
        "letmein1",
        "welcome1",
        "abc12345",
        "football",
        "baseball",
        "sunshine",
        "princess",
        "admin123",
        "trustno1",
        "dragon12",
        "monkey12",
        "superman",
        "starwars",
        "whatever",
        "computer",
        "internet",
        "changeme",
        "swaramala",
        "sargam123",
        "harmonium",
    )
)


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, maxmem=128 * r * n * 2)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str, legacy_salt: str = "") -> bool:
    """Checks a password against a stored hash, including pre-versioned hashes."""
    if stored.startswith("scrypt$"):
        _, n, r, p, salt, digest = stored.split("$")
        candidate = _scrypt(password, bytes.fromhex(salt), int(n), int(r), int(p)).hex()
    else:
        candidate = _scrypt(password, bytes.fromhex(legacy_salt or "00"), 2**14, 8, 1).hex()
        digest = stored
    return hmac.compare_digest(candidate, digest)


def needs_rehash(stored: str) -> bool:
    return stored.split("$")[:4] != ["scrypt", str(SCRYPT_N), str(SCRYPT_R), str(SCRYPT_P)]


# A fixed hash used to spend the same time on unknown usernames as on real ones.
_DUMMY_HASH = hash_password(secrets.token_hex(8))


def burn_time(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def password_problem(password: str, username: str) -> str | None:
    """Returns why a new password is unacceptable, or None if it's fine."""
    if len(password) < MIN_PASSWORD:
        return f"Use at least {MIN_PASSWORD} characters for your password."
    if len(password) > MAX_PASSWORD:
        return f"Use at most {MAX_PASSWORD} characters for your password."
    lowered = password.lower()
    if username.lower() in lowered:
        return "Your password can't contain your username."
    if lowered in COMMON_PASSWORDS or len(set(password)) < 4:
        return "That password is too easy to guess. Choose a less common one."
    return None


class Throttle:
    """Sliding-window failure counter, kept in memory.

    This suits a single server process. With several instances, move the
    counters to a shared store such as Redis.
    """

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        hits = self._hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if not hits:
            del self._hits[key]
        return hits

    def retry_after(self, key: str) -> int:
        """Seconds until ``key`` may try again; 0 if it isn't blocked."""
        now = time.monotonic()
        with self._lock:
            hits = self._prune(key, now)
            if len(hits) < self.limit:
                return 0
            return max(1, int(hits[0] + self.window - now) + 1)

    def hit(self, key: str) -> None:
        with self._lock:
            self._hits[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

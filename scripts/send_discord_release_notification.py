from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT_DIR / "src" / "js" / "config.js"
DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_RETRIES = 3


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError(f"Failed to read {path}: {error}") from error


def extract_first_match(pattern: str, text: str, label: str) -> str:
    match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    if not match:
        raise RuntimeError(f"Failed to find {label} in config.js")
    return match.group(1).strip()


def build_release_payload(config_text: str) -> dict[str, object]:
    version = extract_first_match(r'version:\s*"([^"]+)"', config_text, "version")
    frontend_origin = extract_first_match(r'frontendOrigin:\s*"([^"]+)"', config_text, "frontendOrigin")
    latest_summary = extract_first_match(r'updateHistory:\s*\[\s*\{\s*version:\s*"[^"]+"\s*,\s*date:\s*"[^"]+"\s*,\s*summary:\s*"([^"]+)"', config_text, "latest update summary")

    content_lines = [
        f"家計簿Webアプリ **v{version}** を更新しました。",
        latest_summary,
        frontend_origin,
    ]
    return {"content": "\n".join(content_lines)}


def post_webhook(url: str, payload: dict[str, object]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "kakeibo-web-release-bot/1.0",
        },
        method="POST",
    )
    last_error: Exception | None = None
    for attempt in range(1, DEFAULT_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
                status = getattr(response, "status", None) or response.getcode()
                if 200 <= status < 300:
                    return
                raise RuntimeError(f"Discord webhook returned status {status}")
        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError) as error:
            last_error = error
            if attempt >= DEFAULT_RETRIES:
                break
            time.sleep(attempt)
    raise RuntimeError(f"Failed to send Discord release notification: {last_error}") from last_error


def notification_is_required() -> bool:
    raw_value = os.environ.get("DISCORD_RELEASE_NOTIFICATION_REQUIRED", "").strip().lower()
    return raw_value in {"1", "true", "yes", "on"}


def main() -> int:
    webhook_url = os.environ.get("DISCORD_RELEASE_WEBHOOK_URL", "").strip()
    if not webhook_url:
        message = "DISCORD_RELEASE_WEBHOOK_URL is not set"
        if notification_is_required():
            raise RuntimeError(message)
        print(f"WARNING: {message}; skipped optional release notification", file=sys.stderr)
        return 0
    config_text = read_text(CONFIG_PATH)
    payload = build_release_payload(config_text)
    try:
        post_webhook(webhook_url, payload)
    except Exception as error:
        if notification_is_required():
            raise
        print(f"WARNING: {error}", file=sys.stderr)
        return 0
    print(f"Discord release notification sent for v{payload['content'].split('**v', 1)[1].split('**', 1)[0]}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # pragma: no cover - build-time operational path
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

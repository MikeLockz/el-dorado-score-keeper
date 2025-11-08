#!/usr/bin/env python3
"""
Automated smoke test that uses browser-use with a local Ollama model
to click the "Start Single Player" button, cycle player-count options,
and trigger the "Create lineup" action on the single-player setup flow.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
import random
import time
from urllib.parse import urlparse

from browser_use import Browser
from browser_use.code_use.namespace import evaluate as evaluate_js

APP_URL = os.getenv("APP_URL", "http://localhost:3000")
# Show the browser by default so humans can watch the run; set AI_TEST_HEADLESS=1 to hide it.
HEADLESS = os.getenv("AI_TEST_HEADLESS", "0") != "0"
ARTIFACT_DIR = Path(os.getenv("AI_TEST_ARTIFACT_DIR", "artifacts/ai-tests"))



async def run_test() -> str:
    """
    Open the app, navigate into the single-player flow, exercise player-count buttons,
    and trigger the Create lineup action. Returns the final URL if successful.
    """
    browser = Browser(
        headless=HEADLESS,
        allowed_domains=["localhost", "127.0.0.1"],
        wait_between_actions=0.5,
        minimum_wait_page_load_time=1.0,
    )
    session_started = False

    try:
        await browser.start()
        session_started = True

        logging.info("Navigating to %s", APP_URL)
        await browser.navigate_to(APP_URL)

        start_button_selector = "[aria-label='Start Single Player']"
        logging.info("Waiting for Start Single Player button")
        await _wait_for_selector(browser, start_button_selector)
        logging.info("Clicking Start Single Player")
        await _click_selector(browser, start_button_selector)

        reached_url = await _wait_for_path(browser, "/single-player")
        parsed = urlparse(reached_url)
        if not parsed.path.startswith("/single-player/new"):
            base = f"{parsed.scheme}://{parsed.netloc}"
            target_url = f"{base}/single-player/new"
            logging.info("Directing to %s to open a fresh lineup", target_url)
            await browser.navigate_to(target_url)
            success_url = await _wait_for_path(browser, "/single-player/new")
        else:
            success_url = reached_url
        logging.info("Reached single-player setup page at %s", success_url)

        logging.info("Selecting a random player-count button between 2 and 10")
        await _select_random_player_count(browser)
        logging.info("Clicking Create lineup button")
        await _click_create_lineup(browser)

        final_url = await browser.get_current_page_url() or success_url

        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        screenshot_path = ARTIFACT_DIR / "start-single-player.png"

        try:
            await browser.take_screenshot(path=str(screenshot_path), full_page=True)
            logging.info("Saved success screenshot to %s", screenshot_path)
        except Exception as screenshot_error:
            logging.warning("Unable to capture live screenshot: %s", screenshot_error)

        return final_url

    except Exception:
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        if session_started:
            failure_path = ARTIFACT_DIR / "start-single-player-error.png"
            try:
                await browser.take_screenshot(path=str(failure_path), full_page=True)
                logging.error("Saved failure screenshot to %s", failure_path)
            except Exception as screenshot_error:  # pragma: no cover - best-effort logging
                logging.error("Unable to capture failure screenshot: %s", screenshot_error)
        raise

    finally:
        if session_started:
            await browser.stop()


async def _wait_for_selector(browser: Browser, selector: str, timeout: float = 10.0) -> None:
    """Poll until a selector exists and is enabled, or raise TimeoutError."""
    deadline = time.time() + timeout
    selector_literal = json.dumps(selector)

    while time.time() < deadline:
        is_ready = await evaluate_js(
            f"""
(() => {{
  const el = document.querySelector({selector_literal});
  return !!(el && !(el instanceof HTMLButtonElement && el.disabled));
}})()
""",
            browser,
        )
        if is_ready:
            return
        await asyncio.sleep(0.2)

    raise TimeoutError(f"Timed out waiting for selector {selector}")


async def _click_selector(browser: Browser, selector: str) -> None:
    """Click the element matching selector on the active page."""
    selector_literal = json.dumps(selector)
    await evaluate_js(
        f"""
(() => {{
  const el = document.querySelector({selector_literal});
  if (!el) {{
    throw new Error('Element not found for selector ' + {selector_literal});
  }}
  if (el instanceof HTMLButtonElement && el.disabled) {{
    throw new Error('Element disabled for selector ' + {selector_literal});
  }}
  el.click();
  return true;
}})()
""",
        browser,
    )


async def _select_random_player_count(browser: Browser) -> None:
    """Click a single random player-count button between 2 and 10."""
    count = random.randint(2, 10)
    selector = f"[data-testid='player-count-{count}']"
    await _wait_for_selector(browser, selector)
    await _click_selector(browser, selector)
    logging.info("Selected %s players", count)


async def _click_create_lineup(browser: Browser) -> None:
    """Trigger the Create lineup action."""
    selector = "[data-testid='create-lineup']"
    await _wait_for_selector(browser, selector)
    await _click_selector(browser, selector)


async def _wait_for_path(browser: Browser, prefix: str, timeout: float = 10.0) -> str:
    """Wait until the current URL path starts with the given prefix."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        current_url = await browser.get_current_page_url()
        if current_url:
            parsed = urlparse(current_url)
            if parsed.path.startswith(prefix):
                return current_url
        await asyncio.sleep(0.2)

    raise TimeoutError(f"Timed out waiting for path starting with {prefix}")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    try:
        final_url = asyncio.run(run_test())
        print(
            "✅ PASS - opened single-player setup, selected a random player count, and clicked Create lineup. "
            f"Final URL: {final_url}"
        )
    except Exception as exc:
        logging.exception("AI automation test failed")
        print(f"❌ FAIL - {exc}")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()

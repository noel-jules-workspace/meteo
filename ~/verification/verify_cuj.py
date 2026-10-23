from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    page.goto("http://localhost:3000/us:fps")

    # Wait for initial loading
    page.wait_for_timeout(2000)

    # Click on the accordion to expand the Data & Diagnostics Principles
    accordion = page.locator("text=Data & Diagnostics Principles")
    accordion.click()

    # Wait for accordion to open
    page.wait_for_timeout(1000)

    # Scroll a bit so the layers are visible
    page.evaluate("window.scrollBy(0, 800)")
    page.wait_for_timeout(2000)

    # Take screenshot at the key moment showing the new 3D component and updated text
    page.screenshot(path=os.path.expanduser("~/verification/screenshots/verification2.png"))
    page.wait_for_timeout(1000)  # Hold final state for the video

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir=os.path.expanduser("~/verification/videos"),
            viewport={'width': 1280, 'height': 800}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()  # MUST close context to save the video
            browser.close()

"""One-time login helper.

Campus Coach signs in through Google, which can't be scripted. Instead:
  1. Run `campus-coach-auth` - it listens on http://127.0.0.1:8765.
  2. Sign in at https://app.campus.coach in your browser.
  3. Open the browser console (F12 -> Console) on that page and paste the
     snippet printed below. The tokens are sent straight to this helper and
     saved to ~/.campuscoach/tokens.json.

With --paste, no local server: the snippet copies the tokens to the clipboard
and you paste them here (input is not echoed). Use it when the browser blocks
requests to 127.0.0.1 (Chrome's Local Network Access, always denied in a
private window).
"""

import json
import sys
from getpass import getpass
from http.server import BaseHTTPRequestHandler, HTTPServer

from .tokens import save_tokens, token_file

PORT = 8765

SNIPPET = (
    f"fetch('http://127.0.0.1:{PORT}/token',{{method:'POST',"
    "body:JSON.stringify({atk:localStorage.getItem('atk'),rtk:localStorage.getItem('rtk')})})"
    ".then(r=>r.text()).then(console.log)"
)

# DevTools' copy() puts the value on the clipboard without printing it.
COPY_SNIPPET = "copy(JSON.stringify({atk:localStorage.getItem('atk'),rtk:localStorage.getItem('rtk')}))"


def _save(raw: str) -> str:
    data = json.loads(raw)
    if not data.get("rtk"):
        raise ValueError("no refresh token (rtk) - are you signed in?")
    save_tokens({"atk": data.get("atk"), "rtk": data["rtk"]})
    return f"Saved Campus Coach tokens to {token_file()}"


class _Handler(BaseHTTPRequestHandler):
    done = False

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "https://app.campus.coach")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            status, msg = 200, _save(body)
            _Handler.done = True
        except Exception as e:
            status, msg = 400, f"Error: {e}"
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(msg.encode())
        print(msg)

    def log_message(self, *args):
        pass


def main():
    print(__doc__)
    if "--paste" in sys.argv[1:]:
        print("Snippet to paste in the console of https://app.campus.coach :\n")
        print(COPY_SNIPPET + "\n")
        try:
            print(_save(getpass("Then paste here (nothing is shown) and press Enter: ")))
        except (ValueError, json.JSONDecodeError) as e:
            sys.exit(f"Error: {e}")
        return
    print("Snippet to paste in the console of https://app.campus.coach :\n")
    print(SNIPPET + "\n")
    print(f"Waiting on http://127.0.0.1:{PORT} ... (Ctrl+C to cancel)")
    server = HTTPServer(("127.0.0.1", PORT), _Handler)
    while not _Handler.done:
        server.handle_request()


if __name__ == "__main__":
    main()

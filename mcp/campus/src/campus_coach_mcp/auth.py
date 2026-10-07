"""One-time login helper.

Campus Coach signs in through Google, which can't be scripted. Instead:
  1. Run `campus-coach-auth` - it listens on http://127.0.0.1:8765.
  2. Sign in at https://app.campus.coach in your browser.
  3. Open the browser console (F12 -> Console) on that page and paste the
     snippet printed below. The tokens are sent straight to this helper and
     saved to ~/.campuscoach/tokens.json.
"""

import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from .tokens import save_tokens, token_file

PORT = 8765

SNIPPET = (
    f"fetch('http://127.0.0.1:{PORT}/token',{{method:'POST',"
    "body:JSON.stringify({atk:localStorage.getItem('atk'),rtk:localStorage.getItem('rtk')})})"
    ".then(r=>r.text()).then(console.log)"
)


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
            data = json.loads(body)
            if not data.get("rtk"):
                raise ValueError("no refresh token (rtk) - are you signed in?")
            save_tokens({"atk": data.get("atk"), "rtk": data["rtk"]})
            status, msg = 200, f"Saved Campus Coach tokens to {token_file()}"
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
    print("Snippet to paste in the console of https://app.campus.coach :\n")
    print(SNIPPET + "\n")
    print(f"Waiting on http://127.0.0.1:{PORT} ... (Ctrl+C to cancel)")
    server = HTTPServer(("127.0.0.1", PORT), _Handler)
    while not _Handler.done:
        server.handle_request()


if __name__ == "__main__":
    main()

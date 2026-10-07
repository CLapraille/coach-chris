"""Token storage for Campus Coach.

Campus Coach (after Google/Apple/email sign-in) issues:
  - atk: short-lived JWT access token (~15 min), sent as "Authorization: Bearer"
  - rtk: refresh token, exchanged via PUT /account/refresh-token/{rtk}

Tokens live in $CAMPUS_COACH_TOKEN_DIR/tokens.json (default ~/.campuscoach).
"""

import json
import os
from pathlib import Path


def token_dir() -> Path:
    return Path(os.environ.get("CAMPUS_COACH_TOKEN_DIR", Path.home() / ".campuscoach"))


def token_file() -> Path:
    return token_dir() / "tokens.json"


def load_tokens() -> dict:
    path = token_file()
    if not path.exists():
        raise FileNotFoundError(
            f"No Campus Coach tokens at {path}. Run 'campus-coach-auth' first."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def save_tokens(tokens: dict) -> None:
    path = token_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(tokens), encoding="utf-8")
    os.replace(tmp, path)

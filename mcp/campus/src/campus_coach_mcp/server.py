"""MCP server for Campus Coach (https://campus.coach): reads, plus one write
(complete_session) that the CoachChris BFF only calls after an explicit confirmation.

Uses the same private API as the web app (https://api.campus.coach), with
tokens captured once by `campus-coach-auth` and refreshed automatically.

Environment:
  CAMPUS_COACH_TOKEN_DIR   where tokens.json lives (default ~/.campuscoach)
  CAMPUS_MCP_TRANSPORT     stdio (default) | streamable-http | sse
  CAMPUS_MCP_HOST          bind address for HTTP transports (default 127.0.0.1)
  CAMPUS_MCP_PORT          bind port for HTTP transports (default 8001)
  CAMPUS_MCP_ALLOWED_HOSTS extra Host header values accepted (comma-separated)
"""

import base64
import json
import logging
import os
import threading
import time
from datetime import date, datetime, timedelta, timezone

# AVG (and some other antivirus) set SSLKEYLOGFILE to a pipe that crashes
# OpenSSL on Windows; we never need key logging.
os.environ.pop("SSLKEYLOGFILE", None)

import truststore  # noqa: E402

# Use the OS certificate store so TLS-inspecting antivirus/proxies work.
truststore.inject_into_ssl()

import httpx  # noqa: E402
from mcp.server.fastmcp import FastMCP  # noqa: E402
from mcp.server.transport_security import TransportSecuritySettings  # noqa: E402

from .tokens import load_tokens, save_tokens  # noqa: E402

API = "https://api.campus.coach"

logging.getLogger("httpx").setLevel(logging.WARNING)


class CampusClient:
    def __init__(self):
        self._lock = threading.Lock()
        self._http = httpx.Client(base_url=API, timeout=60)

    @staticmethod
    def _expires_at(atk: str | None) -> float:
        if not atk:
            return 0
        try:
            payload = atk.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            return json.loads(base64.urlsafe_b64decode(payload))["expiresAt"] / 1000
        except Exception:
            return 0

    def _refresh(self, tokens: dict) -> dict:
        r = self._http.put(
            f"/account/refresh-token/{tokens['rtk']}",
            headers={"Authorization": f"Bearer {tokens.get('atk') or ''}"},
        )
        if r.status_code != 200:
            raise RuntimeError(
                f"Campus Coach token refresh failed ({r.status_code}). "
                "Run 'campus-coach-auth' to sign in again."
            )
        body = r.json()
        tokens = {"atk": body["token"], "rtk": body["refreshToken"]}
        save_tokens(tokens)  # refresh token rotates: persist immediately
        return tokens

    def _access_token(self, force_refresh: bool = False) -> str:
        with self._lock:
            tokens = load_tokens()
            if force_refresh or time.time() > self._expires_at(tokens.get("atk")) - 60:
                tokens = self._refresh(tokens)
            return tokens["atk"]

    def get(self, path: str, params=None):
        for attempt in range(2):
            atk = self._access_token(force_refresh=attempt > 0)
            r = self._http.get(path, params=params, headers={"Authorization": f"Bearer {atk}"})
            if r.status_code != 401:
                break
        if r.status_code >= 400:
            raise RuntimeError(f"Campus Coach API {path} -> {r.status_code}: {r.text[:300]}")
        return r.json()

    def put(self, path: str, body: dict):
        # Same headers as the web app's own call (captured once, see DECISIONS D18).
        headers = {"X-Platform": "WEB", "X-TimeZone": "Europe/Paris"}
        for attempt in range(2):
            atk = self._access_token(force_refresh=attempt > 0)
            r = self._http.put(path, json=body, headers={**headers, "Authorization": f"Bearer {atk}"})
            if r.status_code != 401:
                break
        if r.status_code >= 400:
            raise RuntimeError(f"Campus Coach API {path} -> {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else None


client = CampusClient()

# ---------------------------------------------------------------- helpers


def _ms(d: date | datetime) -> int:
    if not isinstance(d, datetime):
        d = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    return int(d.timestamp() * 1000)


def _parse_date(s: str | None) -> date:
    return date.fromisoformat(s) if s else date.today()


def _range(start: str | None, end: str | None, default_days_back: int, default_days_fwd: int):
    today = date.today()
    d0 = _parse_date(start) if start else today - timedelta(days=default_days_back)
    d1 = _parse_date(end) if end else today + timedelta(days=default_days_fwd)
    return _ms(d0), _ms(d1 + timedelta(days=1)) - 1


_DATE_KEYS = ("date", "at", "until")


def _readable(o):
    """Convert epoch-millisecond fields (startDate, weekDate, createdAt...) to ISO strings."""
    if isinstance(o, dict):
        out = {}
        for k, v in o.items():
            if (
                isinstance(v, (int, float))
                and not isinstance(v, bool)
                and k.lower().endswith(_DATE_KEYS)
                and v > 10**11
            ):
                out[k] = datetime.fromtimestamp(v / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M")
            else:
                out[k] = _readable(v)
        return out
    if isinstance(o, list):
        return [_readable(x) for x in o]
    return o


_SESSION_SUMMARY_KEYS = (
    "displayName", "name", "status", "trainingType", "trainingCategory", "sport",
    "difficulty", "importance", "test", "weekDate", "duration", "stats",
)


def _trim_goal(g: dict) -> dict:
    """Drop bulky nested session content from a goal, keeping the summary fields."""
    g = dict(g)
    info = g.get("sessionCompetitionInfo") or {}
    sc = info.get("sessionCompetition") or {}
    if sc:
        g["sessionCompetitionInfo"] = dict(
            info, sessionCompetition={k: sc.get(k) for k in ("displayName", "name", "weekDate")}
        )
    for k, v in list(g.items()):
        if isinstance(v, list) and v and isinstance(v[0], dict) and "exercisesBlocks" in v[0]:
            g[k] = [_session_summary(s, s.get("weekId"), i) for i, s in enumerate(v)]
    return g


def _session_summary(s: dict, week_id: str, index: int) -> dict:
    out = {"weekId": week_id, "sessionIndex": index}
    out.update({k: s[k] for k in _SESSION_SUMMARY_KEYS if k in s})
    return out


# ---------------------------------------------------------------- server

mcp = FastMCP("Campus Coach")


@mcp.tool()
def get_active_goal() -> str:
    """Get the active Campus Coach training goal(s): goal type, start/end/competition
    dates, number of weeks, sessions per week and progress stats
    (trainingsCount, trainingsDoneCount, distanceTotal km, timeTotal)."""
    goals = [_trim_goal(g) for g in client.get("/smart-training/goal/active")]
    return json.dumps(_readable(goals), ensure_ascii=False)


@mcp.tool()
def get_training_plan(start_date: str | None = None, end_date: str | None = None) -> str:
    """Get planned Campus Coach weeks and their sessions between two dates
    (YYYY-MM-DD; default: this week through next week). Each session lists
    weekId + sessionIndex (use with get_session_details), name, type, status
    (todo/done/skipped...), difficulty, duration and stats. Also returns each
    week's expected vs real distance/duration, cycle theme and estimated paces,
    plus activities logged in the period."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    d0 = _parse_date(start_date) if start_date else monday
    d1 = _parse_date(end_date) if end_date else monday + timedelta(days=13)
    data = client.get(
        "/smart-training/enriched",
        params={"from": _ms(d0), "to": _ms(d1 + timedelta(days=1)) - 1},
    )
    weeks = []
    for w in data.get("weeks", []):
        ctx = w.get("context") or {}
        weeks.append({
            "weekId": w.get("_id"),
            "weekDate": w.get("weekDate"),
            "goalId": ctx.get("goalId"),
            "cycleTheme": ctx.get("cycleTheme"),
            "cycleDescription": ctx.get("cycleDescription"),
            "goalWeek": w.get("goalDuration"),
            "weekStats": w.get("weekStats"),
            "sessions": [
                _session_summary(s, w.get("_id"), i) for i, s in enumerate(w.get("sessions", []))
            ],
        })
    return json.dumps(
        _readable({"weeks": weeks, "loggedSessions": data.get("loggedSessions", [])}),
        ensure_ascii=False,
    )


@mcp.tool()
def get_session_details(week_id: str, session_index: int) -> str:
    """Get the full content of one planned Campus Coach session: description,
    coach advice, exercise blocks (warm-up, intervals, reps, target paces or
    durations), pace zones, gear and coach feedback. Get week_id and
    session_index from get_training_plan."""
    week = client.get(f"/smart-training/week/{week_id}")
    sessions = week.get("sessions", [])
    if not 0 <= session_index < len(sessions):
        return f"Week {week_id} has {len(sessions)} sessions (index 0-{len(sessions) - 1})."
    s = dict(sessions[session_index])
    s["weekId"], s["sessionIndex"] = week_id, session_index
    s["estimatedPaces"] = week.get("estimatedPaces")
    return json.dumps(_readable(s), ensure_ascii=False)


# Form type sent with a completion, per sport. Only trailV2 was captured; road is a best guess
# that the post-call check confirms or refutes.
_RACING_NOTE_FORMS = {"trailV2": "SmartTrailV2RacingNoteForm", "road": "SmartRacingNoteForm"}
_RACING_NOTE_FIELDS = (
    "completionDate", "distance", "time", "pace", "activeCalories",
    "averageHeartRateInBeatsPerMinute", "averageRunCadenceInStepsPerMinute",
    "totalElevationGainInMeters", "totalElevationLossInMeters", "externalId", "name", "deviceName",
)


def _plan_session(week_date: str, session_index: int) -> tuple[str, dict]:
    """Current weekId and session for a week (weekIds change whenever the plan is regenerated)."""
    d0 = _parse_date(week_date)
    data = client.get(
        "/smart-training/enriched",
        params={"from": _ms(d0), "to": _ms(d0 + timedelta(days=7)) - 1},
    )
    for w in data.get("weeks", []):
        if _readable({"weekDate": w.get("weekDate")})["weekDate"][:10] == week_date:
            sessions = w.get("sessions", [])
            if 0 <= session_index < len(sessions):
                return w["_id"], sessions[session_index]
    raise ValueError(f"No session {session_index} in the week of {week_date}.")


@mcp.tool()
def complete_session(week_date: str, session_index: int, session_name: str, racing_note: dict) -> str:
    """WRITE. Mark a planned Campus Coach session as done, linked to a watch activity.

    The plan is re-read first: the session is found by week date (YYYY-MM-DD, Monday),
    index and name, and refused if the plan changed or the session is not 'todo'.
    racing_note holds the activity figures (completionDate epoch ms, distance km,
    time s, pace s/km, activeCalories, averageHeartRateInBeatsPerMinute,
    averageRunCadenceInStepsPerMinute, totalElevationGainInMeters,
    totalElevationLossInMeters, externalId, name, deviceName). The session is read
    again afterwards to check that Campus recorded it."""
    week_id, s = _plan_session(week_date, session_index)
    if s.get("name") != session_name:
        raise ValueError(f"Plan changed: session {session_index} is now '{s.get('name')}'.")
    if s.get("status") != "todo":
        raise ValueError(f"Session '{session_name}' is '{s.get('status')}', not 'todo'.")
    form = _RACING_NOTE_FORMS.get(s.get("sport"))
    if not form:
        raise ValueError(f"Completing a '{s.get('sport')}' session is not supported.")
    note = {k: racing_note[k] for k in _RACING_NOTE_FIELDS if racing_note.get(k) is not None}
    if not note.get("externalId"):
        raise ValueError("racing_note.externalId (Garmin activity id) is required.")
    note.update({
        "_t": form, "source": "garmin", "sessionRating": 0,
        "sessionComment": "", "sessionConditions": None,
    })
    client.put(f"/smart-training/session/{week_id}/{session_index}/complete", {"racingNote": note})

    week_id, after = _plan_session(week_date, session_index)
    recorded = (after.get("racingNote") or {}).get("externalId")
    ok = after.get("status") == "done" and str(recorded) == str(note["externalId"])
    return json.dumps({
        "status": "success" if ok else "unverified",
        "session": session_name,
        "sessionStatus": after.get("status"),
        "externalId": recorded,
        "form": form,
    }, ensure_ascii=False)


@mcp.tool()
def get_logged_sessions() -> str:
    """Get activities logged in Campus Coach (synced from a watch or entered
    manually): date, title, sport, duration, distance, elevation, heart rate,
    cadence, rating and notes."""
    return json.dumps(_readable(client.get("/logged-sessions")), ensure_ascii=False)


@mcp.tool()
def get_training_logs(start_date: str | None = None, end_date: str | None = None) -> str:
    """Get the Campus Coach training journal (completed sessions with the
    runner's feedback/comments) between two dates (YYYY-MM-DD; default last 30 days)."""
    s, e = _range(start_date, end_date, 30, 0)
    return json.dumps(
        _readable(client.get("/smart-training/training-logs", params={"startDate": s, "endDate": e})),
        ensure_ascii=False,
    )


@mcp.tool()
def get_paces() -> str:
    """Get Campus Coach estimated race times and training paces: 5k/10k/half/
    marathon predictions, fundamental endurance, MAS (VMA) and threshold paces,
    plus trail race-time projections."""
    return json.dumps(client.get("/smart-training/paces"), ensure_ascii=False)


@mcp.tool()
def get_stats_summary() -> str:
    """Get Campus Coach lifetime totals: sessions, time, distance and elevation gain."""
    return json.dumps(client.get("/smart-training/stats/summary"), ensure_ascii=False)


@mcp.tool()
def get_goal_history(start_date: str | None = None, end_date: str | None = None) -> str:
    """Get Campus Coach goals/training blocks (past, current and planned) between
    two dates (YYYY-MM-DD; default: one year back to six months ahead)."""
    s, e = _range(start_date, end_date, 365, 182)
    data = client.get("/smart-training/timeline/vertical-goals", params={"startDate": s, "endDate": e})
    if isinstance(data, dict) and isinstance(data.get("goals"), list):
        data["goals"] = [_trim_goal(g) for g in data["goals"]]
    return json.dumps(_readable(data), ensure_ascii=False)


@mcp.tool()
def get_running_diary() -> str:
    """Get the Campus Coach running diary: goals with their results and progression."""
    return json.dumps(_readable(client.get("/smart-training/timeline/running-diary")), ensure_ascii=False)


def main():
    transport = os.getenv("CAMPUS_MCP_TRANSPORT", "stdio").strip().lower()
    if transport != "stdio":
        mcp.settings.host = os.getenv("CAMPUS_MCP_HOST", "127.0.0.1")
        mcp.settings.port = int(os.getenv("CAMPUS_MCP_PORT", "8001"))
        # DNS rebinding protection stays on; extra Host values (e.g. an internal
        # service name behind a reverse proxy) are added explicitly.
        extra = [h.strip() for h in os.getenv("CAMPUS_MCP_ALLOWED_HOSTS", "").split(",") if h.strip()]
        if extra:
            mcp.settings.transport_security = TransportSecuritySettings(
                enable_dns_rebinding_protection=True,
                allowed_hosts=["127.0.0.1:*", "localhost:*", "[::1]:*", *extra],
            )
    mcp.run(transport=transport)


if __name__ == "__main__":
    main()

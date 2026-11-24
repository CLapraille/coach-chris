"""Lanceur du MCP Garmin pour CoachChris : le serveur figé (Taxuspt/garmin_mcp) plus un outil maison (D169).

`upload_activity_fit` envoie à Garmin Connect un fichier FIT d'activité reçu en base64. Le fichier reste en
mémoire (BytesIO) : rien n'est écrit sur disque. Comme les autres outils, il ne s'enregistre que s'il figure
dans GARMIN_ENABLED_TOOLS.
"""

import base64
import binascii
import io
import json

import garmin_mcp
from garmin_mcp import calendar_events

_state = {}
_configure = calendar_events.configure
_register = calendar_events.register_tools


def _capture(client):
    _state["client"] = client
    return _configure(client)


def _register_with_upload(app):
    app = _register(app)

    @app.tool()
    async def upload_activity_fit(fit_base64: str, file_name: str = "activity.fit") -> str:
        """Upload a FIT activity file (base64) to Garmin Connect, from memory.

        Args:
            fit_base64: The FIT file, base64-encoded
            file_name: File name shown to Garmin (must end with .fit)
        """
        try:
            data = base64.b64decode(fit_base64, validate=True)
        except (binascii.Error, ValueError):
            return json.dumps({"success": False, "message": "Invalid base64 content"})
        if len(data) < 14 or data[8:12] != b".FIT":
            return json.dumps({"success": False, "message": "Not a FIT file"})
        if not file_name.lower().endswith(".fit"):
            return json.dumps({"success": False, "message": "file_name must end with .fit"})
        client = _state.get("client")
        if client is None:
            return json.dumps({"success": False, "message": "Garmin client not ready"})
        try:
            garmin = client  # proxy : attend la connexion Garmin au premier accès
            result = garmin.client.post(
                "connectapi",
                garmin.garmin_connect_upload,
                files={"file": (file_name, io.BytesIO(data))},
                api=True,
                timeout=60,
            )
        except Exception as e:  # noqa: BLE001 - message renvoyé tel quel au BFF
            text = str(e)
            duplicate = "409" in text or "uplicate" in text
            return json.dumps({"success": False, "duplicate": duplicate, "message": text[:500]})
        imported = (result or {}).get("detailedImportResult", {}) if isinstance(result, dict) else {}
        successes = imported.get("successes") or []
        failures = imported.get("failures") or []
        if failures and not successes:
            messages = [m.get("content", "") for f in failures for m in (f.get("messages") or [])]
            text = "; ".join(m for m in messages if m) or "Upload refused"
            return json.dumps({"success": False, "duplicate": "uplicate" in text, "message": text[:500]})
        activity_id = successes[0].get("internalId") if successes else None
        return json.dumps({
            "success": True,
            "activity_id": activity_id,
            "upload_id": imported.get("uploadId"),
        })

    return app


calendar_events.configure = _capture
calendar_events.register_tools = _register_with_upload

if __name__ == "__main__":
    garmin_mcp.main()

# MCP Garmin (Taxuspt/garmin_mcp, commit figé) en streamable-http, ingress interne Container Apps (ARCHITECTURE §6).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt && useradd --create-home --uid 1000 mcp
# Lanceur maison (D169) : le serveur figé plus l'outil upload_activity_fit (envoi d'un FIT depuis la mémoire).
COPY coach_tools.py /opt/coach/coach_tools.py

USER mcp
# Jetons sur le partage Azure Files monté en /data ; le MCP les rafraîchit et les réécrit lui-même.
ENV GARMINTOKENS=/data/garmin \
    GARMIN_MCP_TRANSPORT=streamable-http \
    GARMIN_MCP_HOST=0.0.0.0 \
    GARMIN_MCP_PORT=8000
EXPOSE 8000
CMD ["python", "/opt/coach/coach_tools.py"]

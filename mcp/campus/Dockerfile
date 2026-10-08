# MCP Campus Coach en streamable-http, ingress interne Container Apps, 1 réplique au plus (ARCHITECTURE §6).
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY src ./src
RUN uv sync --frozen --no-dev && useradd --create-home --uid 1000 mcp

USER mcp
# Le refresh token Campus change à chaque rafraîchissement : un seul processus doit l'utiliser.
ENV PATH="/app/.venv/bin:$PATH" \
    CAMPUS_COACH_TOKEN_DIR=/data/campus \
    CAMPUS_MCP_TRANSPORT=streamable-http \
    CAMPUS_MCP_HOST=0.0.0.0 \
    CAMPUS_MCP_PORT=8001
EXPOSE 8001
CMD ["campus-coach-mcp"]

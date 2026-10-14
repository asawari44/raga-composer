FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy HOST=0.0.0.0 PORT=8080 RAGA_DATA_DIR=/data
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev
VOLUME /data
EXPOSE 8080
CMD ["uv", "run", "--no-dev", "raga-composer"]

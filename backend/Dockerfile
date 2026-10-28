FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CONTENT_DIR=/app/data

WORKDIR /app/backend

RUN groupadd --system guruji \
    && useradd --system --gid guruji --home-dir /app guruji

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY data /app/data

RUN chmod +x /app/backend/docker-entrypoint.sh \
    && chown -R guruji:guruji /app

USER guruji

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=3)"

ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]

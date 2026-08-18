# Built from the workspace root: docker build -f apps/server/Dockerfile .
FROM rust:1.97-slim AS build
WORKDIR /src

RUN apt-get update && apt-get install -y --no-install-recommends pkg-config && rm -rf /var/lib/apt/lists/*

# The calendar data is embedded at compile time by sajilo-core's build script,
# so the whole workspace has to be present before the build runs.
COPY . .
RUN cargo build --release -p sajilo-server

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 sajilo

COPY --from=build /src/target/release/sajilo-server /usr/local/bin/sajilo-server

# The snapshot outlives a container restart only if this is a mounted volume.
RUN mkdir -p /var/lib/sajilo && chown sajilo:sajilo /var/lib/sajilo
VOLUME /var/lib/sajilo

USER sajilo
ENV PORT=8080 CACHE_PATH=/var/lib/sajilo/snapshot.json
EXPOSE 8080

# No HEALTHCHECK here: the image carries no HTTP client to probe with, and
# adding one to keep Docker happy is weight for nothing. Point the orchestrator
# at GET /healthz instead — it is unversioned and payload-free for exactly this.

CMD ["sajilo-server"]

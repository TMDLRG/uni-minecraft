# THE STRATIFIED PALIMPSEST — reproducible build/run/test image.
# The pure simulation core has ZERO hex dependencies, so the image is tiny and
# fully offline-buildable.
FROM elixir:1.18-otp-27-alpine AS base

WORKDIR /app
ENV MIX_ENV=prod

# No deps to fetch; copy the project and compile.
COPY mix.exs .formatter.exs ./
COPY config ./config
COPY lib ./lib
COPY scripts ./scripts

RUN mix local.hex --force && mix local.rebar --force \
    && mix compile --warnings-as-errors

# --- test stage: run the full QA suite -------------------------------------
FROM base AS test
ENV MIX_ENV=test
COPY test ./test
RUN mix test

# --- runtime stage: operator CLI -------------------------------------------
FROM base AS runtime
# Default command runs the baseline benchmark; override for other entrypoints,
# e.g. `docker run <img> mix run scripts/evidence.exs`.
ENTRYPOINT ["mix"]
CMD ["run", "scripts/benchmark.exs"]

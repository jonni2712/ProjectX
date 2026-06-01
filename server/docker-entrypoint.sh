#!/bin/sh
set -e

# On first boot there is no data/config.json yet. Run the non-interactive setup
# (driven by env vars) to generate the JWT secret, write config.json and seed
# the admin user, so `docker compose up` works out of the box. On later boots
# the config persists in the mounted volume and this step is skipped.
if [ ! -f /app/data/config.json ]; then
  echo "[entrypoint] No configuration found — running non-interactive setup..."
  node dist/setup.js --non-interactive
fi

exec "$@"

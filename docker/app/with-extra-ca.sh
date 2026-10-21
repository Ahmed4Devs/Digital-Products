#!/bin/sh
# Runs a build command trusting an optional extra CA (the `extra_ca` build secret), for
# builds behind a TLS-inspecting proxy. Without the secret it just runs the command.
set -eu
if [ -f /run/secrets/extra_ca ]; then
  export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca
fi
exec "$@"

# The Chainguard minio-client image has no shell; copy its `mc` binary onto
# wolfi-base (same glibc userland) so the bootstrap script can run.
FROM cgr.dev/chainguard/minio-client:latest AS mc

FROM cgr.dev/chainguard/wolfi-base:latest
COPY --from=mc /usr/bin/mc /usr/bin/mc
ENTRYPOINT ["/bin/sh", "/init.sh"]

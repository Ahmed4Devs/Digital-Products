# MinIO runs as the non-root user 65532. A fresh named volume copies the ownership
# of the image directory it is mounted on, so /data must exist and belong to 65532.
FROM cgr.dev/chainguard/wolfi-base:latest AS prep
RUN mkdir -p /data && chown 65532:65532 /data

FROM cgr.dev/chainguard/minio:latest
COPY --from=prep --chown=65532:65532 /data /data

#!/bin/sh
# Idempotent bootstrap for local object storage:
#   - a private bucket for product files (no anonymous access, ever)
#   - a public-read bucket for product images
#   - an application user limited to those two buckets
set -eu

: "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}" "${S3_BUCKET_PRIVATE:?}" "${S3_BUCKET_PUBLIC:?}"

attempt=0
until mc ready local >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "MinIO did not become ready in time" >&2
    exit 1
  fi
  sleep 1
done

mc mb --ignore-existing "local/${S3_BUCKET_PRIVATE}" "local/${S3_BUCKET_PUBLIC}"
mc anonymous set none "local/${S3_BUCKET_PRIVATE}"
mc anonymous set download "local/${S3_BUCKET_PUBLIC}"

policy_file="$(mktemp)"
cat >"$policy_file" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${S3_BUCKET_PRIVATE}", "arn:aws:s3:::${S3_BUCKET_PUBLIC}"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::${S3_BUCKET_PRIVATE}/*", "arn:aws:s3:::${S3_BUCKET_PUBLIC}/*"]
    }
  ]
}
EOF

mc admin user add local "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"
mc admin policy create local app-buckets "$policy_file"
# Attaching an already-attached policy is reported as an error; it is safe to ignore on re-runs.
mc admin policy attach local app-buckets --user "$S3_ACCESS_KEY_ID" >/dev/null 2>&1 || true
rm -f "$policy_file"

echo "Object storage ready: ${S3_BUCKET_PRIVATE} (private), ${S3_BUCKET_PUBLIC} (public-read)"

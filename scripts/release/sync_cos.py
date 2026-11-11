#!/usr/bin/env python3
"""Upload a release directory to Tencent COS without the legacy coscmd CLI."""
import os
import sys
from pathlib import Path
from qcloud_cos import CosConfig, CosS3Client

if len(sys.argv) != 3:
    raise SystemExit("usage: sync_cos.py DIRECTORY PREFIX")
root = Path(sys.argv[1]).resolve()
prefix = sys.argv[2].strip("/")
secret_id = os.environ["COS_SECRET_ID"]
secret_key = os.environ["COS_SECRET_KEY"]
region = os.environ["COS_REGION"]
bucket = os.environ["COS_BUCKET"]
if not root.is_dir():
    raise SystemExit(f"directory not found: {root}")
client = CosS3Client(CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key))
for path in sorted(p for p in root.rglob("*") if p.is_file()):
    key = f"{prefix}/{path.relative_to(root).as_posix()}"
    with path.open("rb") as stream:
        client.put_object(Bucket=bucket, Body=stream, Key=key)
    print(key, flush=True)

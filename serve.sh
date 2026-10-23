#!/bin/bash
# 只在本机起静态服务：127.0.0.1:${PORT:-8799}，不对外、不部署
cd "$(dirname "$0")" && exec python3 -m http.server "${PORT:-8799}" --bind 127.0.0.1

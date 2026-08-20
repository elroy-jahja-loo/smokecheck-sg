#!/bin/sh
set -e

echo ""
echo "  SmokeCheck SG is ready"
echo "  ─────────────────────────────────────────"
echo "  Open your browser to:"
echo ""
echo "    http://localhost:${PORT:-3000}"
echo ""
echo "  ─────────────────────────────────────────"
echo ""

exec "$@"

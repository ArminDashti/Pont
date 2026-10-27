#!/bin/sh
set -eu

if [ "${PONT_OPENVPN_SKIP:-0}" = "1" ]; then
  echo "[pont] OpenVPN skipped (PONT_OPENVPN_SKIP=1)"
  exec node dist/main.js
fi

CONFIG_NAME="${PONT_OPENVPN_CONFIG:-client.ovpn}"
CONFIG_PATH="/etc/openvpn/pont/${CONFIG_NAME}"

if [ ! -f "${CONFIG_PATH}" ]; then
  echo "[pont] OpenVPN config missing: ${CONFIG_PATH}"
  echo "[pont] Set PONT_OPENVPN_SKIP=1 for dev without VPN"
  exit 1
fi

echo "[pont] Starting OpenVPN (${CONFIG_PATH})"
openvpn --config "${CONFIG_PATH}" --daemon

TRIES=60
while [ "$TRIES" -gt 0 ]; do
  if ip link show tun0 >/dev/null 2>&1; then
    echo "[pont] tun0 is up"
    exec node dist/main.js
  fi
  TRIES=$((TRIES - 1))
  sleep 1
done

echo "[pont] OpenVPN failed to bring up tun0 within timeout"
exit 1

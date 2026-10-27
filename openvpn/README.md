# OpenVPN configs (not committed)

Place your client profile here, for example:

- `client.ovpn`
- `auth.txt` (if your profile uses `auth-user-pass`)

Mount this folder into the `pont-api` container at `/etc/openvpn/pont/`.

Set `PONT_OPENVPN_CONFIG=client.ovpn` (default). For local dev without VPN, set `PONT_OPENVPN_SKIP=1`.

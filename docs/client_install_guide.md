# SMC webOS App Installation (Client Guide)

## Package
- App: `com.smc.signage`
- IPK: `com.smc.signage_2.0.0_client_ready.ipk`

## Prerequisites
1. LG Professional Screen with **Developer Mode app** installed.
2. In Developer Mode app:
- `Dev Mode Status` = ON
- `Key Server` = ON
3. Note TV values:
- TV IP address
- Passphrase
4. Windows laptop on same network as TV.

## One-Command Install (Recommended)
Run this in PowerShell from project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\webos\client_install_from_shared_ipk.ps1 `
  -TvIp "192.168.1.120" `
  -Passphrase "TV_DEVMODE_PASSPHRASE" `
  -DeviceName "client-lg" `
  -IpkUrl "https://YOUR-LINK/com.smc.signage_2.0.0_client_ready.ipk"
```

## If IPK is local file
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\webos\client_install_from_shared_ipk.ps1 `
  -TvIp "192.168.1.120" `
  -Passphrase "TV_DEVMODE_PASSPHRASE" `
  -DeviceName "client-lg" `
  -IpkPath ".\dist\com.smc.signage_2.0.0_client_ready.ipk"
```

## What the script does
1. Installs webOS CLI if missing.
2. Registers TV device target.
3. Fetches TV key (`ares-novacom --getkey`).
4. Installs app (`ares-install`).
5. Launches app (`ares-launch`).

## Upgrade / Reinstall
Run the same command again with the new IPK URL/path.

## Quick Troubleshooting
1. `Connection refused`
- TV IP wrong, TV not on same network, or Developer Mode/Key Server OFF.

2. `Failed to get ssh private key`
- Open Developer Mode app on TV and retry.

3. `Install failed`
- Re-run command; script removes old app before install.
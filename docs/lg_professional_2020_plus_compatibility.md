# LG Professional Screen Compatibility (2020+)

## Scope
This app package is configured to target LG webOS professional screens from model year 2020 and newer.

Runtime compatibility detection maps platform version to model year at launch and applies safe playback defaults.

## Platform Mapping Used at Runtime
- `5` => `2020`
- `6` => `2021`
- `7` => `2022`
- `8` => `2023`
- `9` => `2024`
- `10` => `2025`
- `11` => `2026`
- `12` => `2027`
- `22` => `2022`
- `23` => `2023`
- `24` => `2024`
- `25` => `2025`
- `26` => `2026`

If the platform version is unknown, the app falls back to a conservative legacy-safe profile.

## Playback Safety Flags Applied
- `ENABLE_LEGACY_HOME_FLOW = false`
- `ENABLE_WATCHDOG_SERVICE = false`
- `ENABLE_PLAYER_RAW_SIGNALR = false`
- `ENABLE_BLOB_CACHE = true`
- `ENABLE_AV_BLOB_CACHE = false`

## Real Device Validation Required
Emulator behavior does not fully match real panels. Before rollout, validate on representative devices:

1. One 2020 or 2021 model
2. One 2022 or 2023 model
3. One 2024+ model

Run checks per model:
- cold boot and auto play
- full playlist sequence (audio, image, video)
- network drop and reconnect
- overnight loop stability
- memory growth over at least 2 hours

## Operational Notes
- Deliver as one `.ipk` package.
- Login and settings are per-device runtime configuration and remain supported.
- Final model-by-model certification must be done on physical screens used in deployment.

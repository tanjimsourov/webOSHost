# Smc-Signage v2.0.0

## Overview

This package contains the production-ready webOS version of the **Smc-Signage** application. It is designed for installation on LG professional displays and includes comprehensive digital signage capabilities with full Java parity:

* **Complete Java Parity** - All features from the original Android implementation with 100% feature parity
* **Status Reporting** - Login, heartbeat, played songs/ads, and logout status reporting with offline queue
* **Remote Control** - SignalR-based server push commands for remote playlist and playback control
* **Scheduler & Watchdog** - Background content refresh and playback monitoring with automatic recovery
* **Prayer Timing** - Integrated prayer time detection with automatic playback pause/resume
* **Robust Architecture** - Controller-based routing, modular services, and comprehensive error handling

## Installation

### LG Professional Screen Installation

The installable app package extension for LG webOS professional screens is **`.ipk`**.

1. Build and install using the launcher file:
   ```bat
   install_on_lg_screen.cmd <device-name>
   ```
   Example:
   ```bat
   install_on_lg_screen.cmd emulator
   ```
2. Build only (no install):
   ```bat
   install_on_lg_screen.cmd emulator build
   ```
3. The generated package is written to `dist\*.ipk`.

### Manual IPK Installation (Alternative)

1. Package:
   ```bash
   ares-package --no-minify -o dist .
   ```
2. Install:
   ```bash
   ares-install -d <device-name> dist/<latest>.ipk
   ```
3. Launch:
   ```bash
   ares-launch -d <device-name> com.smc.signage
   ```

### Development Installation

To run the application in a browser for testing:

1. Install any HTTP server (for example: `python -m http.server`).
2. Serve the project directory on a local port:

   ```bash
   cd Smc-Signage
   python -m http.server 8080
   ```

3. Open `http://localhost:8080` in your browser. Note that certain features (such as webOS services and permission requests) may not function outside of the LG environment.

## Features

* **Complete Digital Signage Solution** - Playlist management, advertisement support, and media playback
* **Remote Control Capabilities** - Server-side control via SignalR for playlist updates and playback commands
* **Automatic Content Refresh** - Scheduled content updates with download management
* **Status Monitoring** - Real-time status reporting to server with offline queue support
* **Prayer Time Integration** - Automatic pause/resume during prayer times
* **Robust Error Handling** - Network resilience, automatic recovery, and comprehensive logging
* **LG webOS Optimized** - Full integration with webOS services and professional display features

## Architecture

The application follows a modular architecture with clear separation of concerns:

- **Controllers** - Route lifecycle management (`homeController`, `loginController`, etc.)
- **Services** - Background operations (`scheduler`, `watchdog`, `status_reporter`)
- **Engine** - Core business logic (`playlist_manager`, `ads_manager`, `prayer_manager`)
- **Storage** - Data persistence (`PlaylistDataSource`, `SongsDataSource`, etc.)
- **Network** - API communication and real-time updates (`api`, `signalr_client`)

## Support

For technical assistance, refer to the inline documentation within the JavaScript files or contact the SMC support team.

## Version History

* **2.0.0** - Production-ready release with complete Java parity and enhanced features

# REGRESSION_CHECKLIST

This checklist verifies all core flows work correctly after changes. Run through each item manually and record PASS/FAIL.

**Date:** ____________  
**Tester:** ____________  
**Build Version:** ____________

---

## 1. Application Boot Flow

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 1.1 | App loads without crashes | Splash screen appears, no console errors | [ ] PASS / [ ] FAIL | |
| 1.2 | Splash → Login transition | After delay, redirects to login screen | [ ] PASS / [ ] FAIL | |
| 1.3 | Console logs show `[ROUTER]` tags | Logs include `renderRoute START`, `controller mount SUCCESS` | [ ] PASS / [ ] FAIL | |

---

## 2. Login Flow

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 2.1 | Empty username validation | Alert shows "Please enter the user name" | [ ] PASS / [ ] FAIL | |
| 2.2 | Empty token validation | Alert shows "Please enter the token number" | [ ] PASS / [ ] FAIL | |
| 2.3 | Offline login attempt | Banner shows "No network connection", submit disabled | [ ] PASS / [ ] FAIL | |
| 2.4 | Valid credentials login | Navigates to home screen, `[LOGIN] Login and rights successful` logged | [ ] PASS / [ ] FAIL | |
| 2.5 | Invalid credentials | Alert shows "Please enter valid credentials" | [ ] PASS / [ ] FAIL | |
| 2.6 | Permit set on success | `prefs.getString('login')` returns 'Permit' | [ ] PASS / [ ] FAIL | |

---

## 3. Home Screen / Playback

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 3.1 | Home controller mounts | Console logs `[HOME] mount` | [ ] PASS / [ ] FAIL | |
| 3.2 | Playlist fetch starts | Console logs `[HOME] playlist fetch START` | [ ] PASS / [ ] FAIL | |
| 3.3 | Advertisement fetch | Console logs ads manager activity | [ ] PASS / [ ] FAIL | |
| 3.4 | Download manager queues items | No errors in download queue | [ ] PASS / [ ] FAIL | |
| 3.5 | Watcher starts | Playlist watcher monitoring active | [ ] PASS / [ ] FAIL | |
| 3.6 | Playback starts (if content available) | Media plays without errors | [ ] PASS / [ ] FAIL | |

---

## 4. Status Reporting

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 4.1 | Login status reported | `[STATUS] Login status reported` in console | [ ] PASS / [ ] FAIL | |
| 4.2 | Heartbeat starts | After 60s: `[STATUS] Heartbeat reported` | [ ] PASS / [ ] FAIL | |
| 4.3 | Song played status | On song play: `[STATUS] Played song reported` | [ ] PASS / [ ] FAIL | |
| 4.4 | Ad played status | On ad play: `[STATUS] Played ad reported` | [ ] PASS / [ ] FAIL | |
| 4.5 | Logout status | On unmount: `[STATUS] Logout status reported` | [ ] PASS / [ ] FAIL | |
| 4.6 | Offline queue | Disconnect network, play songs, reconnect - queue flushes | [ ] PASS / [ ] FAIL | |

---

## 5. Scheduler & Watchdog

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 5.1 | Scheduler starts | `[SCHEDULER] Starting scheduler service` logged | [ ] PASS / [ ] FAIL | |
| 5.2 | Quick check runs | After 150s: `[SCHEDULER] Running quick check` | [ ] PASS / [ ] FAIL | |
| 5.3 | Watchdog starts | `[WATCHDOG] Starting watchdog service` logged | [ ] PASS / [ ] FAIL | |
| 5.4 | Stall detection | Pause video >30s: watchdog detects stall | [ ] PASS / [ ] FAIL | |
| 5.5 | No infinite loops | Retry counter doesn't exceed 10/hour | [ ] PASS / [ ] FAIL | |

---

## 6. SignalR Remote Control

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 6.1 | SignalR connects | `[SIGNALR] Connected successfully` logged | [ ] PASS / [ ] FAIL | |
| 6.2 | Reconnect on disconnect | Disconnection triggers reconnect attempts | [ ] PASS / [ ] FAIL | |
| 6.3 | Play Next command | (If testable) Next song plays | [ ] PASS / [ ] FAIL | |
| 6.4 | Publish Update command | (If testable) Content refreshes | [ ] PASS / [ ] FAIL | |

---

## 7. Prayer Timing Feature

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 7.1 | Prayer manager starts | `[PRAYER] start SUCCESS` logged | [ ] PASS / [ ] FAIL | |
| 7.2 | Prayer times fetched | `[PRAYER] fetchPrayerTimes START` logged | [ ] PASS / [ ] FAIL | |
| 7.3 | Prayer check runs | Periodic checks without errors | [ ] PASS / [ ] FAIL | |
| 7.4 | Playback pauses for prayer | (If prayer window active) Playback pauses | [ ] PASS / [ ] FAIL | |
| 7.5 | Playback resumes after prayer | Playback resumes when prayer ends | [ ] PASS / [ ] FAIL | |

---

## 8. DataSource Operations

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 8.1 | Playlist DB operations | No `[PLAYLIST_DS]` FAIL logs | [ ] PASS / [ ] FAIL | |
| 8.2 | Songs DB operations | No `[SONGS_DS]` FAIL logs | [ ] PASS / [ ] FAIL | |
| 8.3 | Advertisement DB operations | No `[ADV_DS]` FAIL logs | [ ] PASS / [ ] FAIL | |
| 8.4 | Prayer DB operations | No `[PRAYER_DS]` FAIL logs | [ ] PASS / [ ] FAIL | |
| 8.5 | Stale data cleanup | After refresh, obsolete records removed | [ ] PASS / [ ] FAIL | |

---

## 9. Settings & Logout

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 9.1 | Navigate to settings | Settings screen loads | [ ] PASS / [ ] FAIL | |
| 9.2 | Logout clears Permit | `prefs.getString('login')` returns '' after logout | [ ] PASS / [ ] FAIL | |
| 9.3 | Redirect to login after logout | Navigates to login screen | [ ] PASS / [ ] FAIL | |
| 9.4 | Cannot access home without login | Direct navigation to `/home` redirects to `/login` | [ ] PASS / [ ] FAIL | |

---

## 10. Router & Navigation

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 10.1 | Hash routing works | `location.hash = '#/login'` loads login | [ ] PASS / [ ] FAIL | |
| 10.2 | Back navigation | `router.back()` returns to previous route | [ ] PASS / [ ] FAIL | |
| 10.3 | Controller lifecycle | unmount called before mount on route change | [ ] PASS / [ ] FAIL | |
| 10.4 | Login guard | Unauthenticated access to `/home` redirects to `/login` | [ ] PASS / [ ] FAIL | |

---

## 11. Network Robustness

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|-----------------|--------|-------|
| 11.1 | Offline doesn't crash | App remains stable when offline | [ ] PASS / [ ] FAIL | |
| 11.2 | Downloads resume | Failed downloads retry on reconnect | [ ] PASS / [ ] FAIL | |
| 11.3 | Status queue persists | Offline statuses saved and flushed when online | [ ] PASS / [ ] FAIL | |

---

## Summary

**Total Tests:** 45  
**Passed:** ___  
**Failed:** ___  
**Blocked:** ___

**Critical Issues Found:**
1. 
2. 
3. 

**Notes:**


---

*Last updated: Section 1-3 implementation complete*

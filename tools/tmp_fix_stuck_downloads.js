const fs = require('fs');

function replaceOrThrow(text, label, pattern, replacement) {
  if (!pattern.test(text)) throw new Error('Pattern not found: ' + label);
  return text.replace(pattern, replacement);
}

const path = 'c:/Users/spicy/Documents/projects/smc/LGWebOs/js/download/download_manager.js';
let text = fs.readFileSync(path, 'utf8');

text = replaceOrThrow(
  text,
  'constructor_add_timeout_fields',
  /this\._isRunning = false;\s*\/\/ Load persisted state from preferences\/localStorage/,
  "this._isRunning = false;\n      this._downloadTimeoutMs = 45000;\n      this._cooldownUntil = 0;\n      // Load persisted state from preferences/localStorage"
);

text = replaceOrThrow(
  text,
  'addSongs_skip_invalid_url',
  /for \(const s of songs\) \{\s*if \(Number\(\(s && s\.is_downloaded\) \|\| 0\) === 1 && s && s\.song_path\) \{\s*continue;\s*\}/,
  "for (const s of songs) {\n        if (!s) continue;\n        if (!String((s.song_url || s.song_path || '')).trim()) {\n          continue;\n        }\n        if (Number((s && s.is_downloaded) || 0) === 1 && s && s.song_path) {\n          continue;\n        }"
);

text = replaceOrThrow(
  text,
  'addAds_skip_invalid_url',
  /for \(const ad of ads\) \{\s*if \(Number\(\(ad && ad\.download_status\) \|\| 0\) === 1 && ad && ad\.adv_path\) \{\s*continue;\s*\}/,
  "for (const ad of ads) {\n        if (!ad) continue;\n        if (!String((ad.adv_file_url || ad.adv_path || '')).trim()) {\n          continue;\n        }\n        if (Number((ad && ad.download_status) || 0) === 1 && ad && ad.adv_path) {\n          continue;\n        }"
);

text = replaceOrThrow(
  text,
  'start_add_cooldown_guard',
  /async start\(\) \{\s*await this\._emitStorageSnapshot\('before-download'\);\s*\/\/ Guard against multiple concurrent calls\s*if \(this\._isRunning\) return;/,
  "async start() {\n      await this._emitStorageSnapshot('before-download');\n\n      if (this._cooldownUntil && Date.now() < this._cooldownUntil) {\n        this._emitDownloadEvent({\n          phase: 'storage',\n          stage: 'cooldown',\n          message: 'Low storage/network cooldown active. Retrying shortly.'\n        });\n        return;\n      }\n\n      // Guard against multiple concurrent calls\n      if (this._isRunning) return;"
);

text = replaceOrThrow(
  text,
  'start_add_abort_remaining_flag',
  /var queueStats = this\._getQueueStats\(\);\s*\n\s*try \{/,
  "var queueStats = this._getQueueStats();\n      var abortRemaining = false;\n\n      try {"
);

text = replaceOrThrow(
  text,
  'start_catch_low_storage_break',
  /\} catch \(err\) \{\s*console\.error\('Error downloading', entry, 'attempt', attempt, err\);\s*if \(attempt < maxAttempts\) \{\s*var waitMs = this\._retryDelayMs\(attempt\);\s*await this\._sleep\(waitMs\);\s*\}\s*\}/,
  `} catch (err) {
              console.error('Error downloading', entry, 'attempt', attempt, err);
              var errMsg = String((err && err.message) || '');
              if (errMsg.indexOf('Insufficient storage space for download') >= 0) {
                this._cooldownUntil = Date.now() + (2 * 60 * 1000);
                this._emitDownloadEvent({
                  phase: 'storage',
                  stage: 'low-storage-cooldown',
                  message: 'Storage is low. Pausing download queue for 2 minutes.'
                });
                abortRemaining = true;
                break;
              }
              if (attempt < maxAttempts) {
                var waitMs = this._retryDelayMs(attempt);
                await this._sleep(waitMs);
              }
            }`
);

text = replaceOrThrow(
  text,
  'start_keep_key_on_fail_and_break_if_abort',
  /if \(success\) \{\s*this\.completed\.push\(entry\);\s*\} else \{\s*this\._queuedKeys\.delete\(entryKey\);\s*this\.failed\.push\(entry\);\s*\}\s*\n\s*this\.currentIndex \+= 1;\s*this\._saveState\(\);/,
  "if (success) {\n            this.completed.push(entry);\n          } else {\n            // keep key for current cycle to avoid immediate re-queue loops\n            this.failed.push(entry);\n          }\n\n          this.currentIndex += 1;\n          this._saveState();\n\n          if (abortRemaining) {\n            break;\n          }"
);

text = replaceOrThrow(
  text,
  'add_fetch_with_timeout_method',
  /_emitDownloadEvent\(detail\) \{[\s\S]*?\}\s*\n\s*\/\*\*/,
`_emitDownloadEvent(detail) {
      try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('smc:download', { detail: detail || {} }));
        }
      } catch (e) {
        // best effort
      }
    }

    async _fetchWithTimeout(url, timeoutMs) {
      var controller = (typeof AbortController === 'function') ? new AbortController() : null;
      var timer = null;
      try {
        var options = {};
        if (controller) {
          options.signal = controller.signal;
          timer = setTimeout(function () {
            try { controller.abort(); } catch (_e) {}
          }, Math.max(5000, Number(timeoutMs || 0) || this._downloadTimeoutMs));
        }
        return await fetch(url, options);
      } catch (err) {
        if (err && err.name === 'AbortError') {
          throw new Error('Download timeout');
        }
        throw err;
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    }

    /**`
);

text = replaceOrThrow(
  text,
  'download_song_use_timeout_fetch',
  /const response = await fetch\(fetchUrl\);/,
  "const response = await this._fetchWithTimeout(fetchUrl, this._downloadTimeoutMs);"
);

text = replaceOrThrow(
  text,
  'download_ad_use_timeout_fetch',
  /const response = await fetch\(fetchUrl\);/,
  "const response = await this._fetchWithTimeout(fetchUrl, this._downloadTimeoutMs);"
);

fs.writeFileSync(path, text, 'utf8');
console.log('Patched download_manager.js for stuck-progress resilience');
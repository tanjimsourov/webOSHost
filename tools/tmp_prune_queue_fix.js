const fs = require('fs');

function replaceOrThrow(text, label, pattern, replacement) {
  if (!pattern.test(text)) throw new Error('Pattern not found: ' + label);
  return text.replace(pattern, replacement);
}

const path = 'c:/Users/spicy/Documents/projects/smc/LGWebOs/js/download/download_manager.js';
let text = fs.readFileSync(path, 'utf8');

text = replaceOrThrow(
  text,
  'start_call_prune_queue',
  /\/\/ Guard against multiple concurrent calls\s*if \(this\._isRunning\) return;\s*this\._isRunning = true;\s*\n\s*var queueStats = this\._getQueueStats\(\);/,
  `// Guard against multiple concurrent calls
      if (this._isRunning) return;

      await this._pruneQueue();
      if (!Array.isArray(this.queue) || this.queue.length === 0) {
        this._emitDownloadEvent({
          phase: 'done',
          current: 0,
          total: 0,
          queue: { songs: 0, ads: 0, total: 0 },
          message: 'No pending downloads'
        });
        return;
      }

      this._isRunning = true;

      var queueStats = this._getQueueStats();`
);

text = replaceOrThrow(
  text,
  'insert_prune_method',
  /_getQueueStats\(\) \{[\s\S]*?return \{\s*songs: songs,\s*ads: ads,\s*total: songs \+ ads\s*\};\s*\}\s*\n\s*async _initStorageHints\(\) \{/,
  `_getQueueStats() {
      var songs = 0;
      var ads = 0;
      for (var i = 0; i < this.queue.length; i++) {
        var type = (this.queue[i] && this.queue[i].type) || '';
        if (type === 'song') songs += 1;
        if (type === 'ad') ads += 1;
      }
      return {
        songs: songs,
        ads: ads,
        total: songs + ads
      };
    }

    async _pruneQueue() {
      if (!Array.isArray(this.queue) || this.queue.length === 0) {
        this.queue = [];
        this.currentIndex = 0;
        this.failed = [];
        this.completed = [];
        this._rebuildQueueKeySet();
        this._saveState();
        return;
      }

      var filtered = [];
      var seen = new Set();

      for (var i = 0; i < this.queue.length; i++) {
        var entry = this.queue[i];
        if (!entry || !entry.type || !entry.data) continue;

        var key = this._entryKey(entry.type, entry.data);
        if (!key || key === 'song:' || key === 'ad:' || seen.has(key)) {
          continue;
        }

        if (entry.type === 'song') {
          var song = entry.data || {};
          var sUrl = String(song.song_url || song.song_path || '').trim();
          if (!sUrl) continue;
          if (Number(song.is_downloaded || 0) === 1 && song.song_path) continue;

          var titleId = String(song.title_id || song.titleId || '').trim();
          if (titleId) {
            try {
              var dl = await this.songsDataSource.getAllDownloadedSongs(titleId);
              if (Array.isArray(dl) && dl.length > 0) {
                continue;
              }
            } catch (_e) {
              // best effort
            }
          }
        } else if (entry.type === 'ad') {
          var ad = entry.data || {};
          var aUrl = String(ad.adv_file_url || ad.adv_path || '').trim();
          if (!aUrl) continue;
          if (Number(ad.download_status || 0) === 1 && ad.adv_path) continue;
        } else {
          continue;
        }

        seen.add(key);
        filtered.push(entry);
      }

      this.queue = filtered;
      this.currentIndex = 0;
      this.completed = [];
      this.failed = [];
      this._rebuildQueueKeySet();
      this._saveState();
    }

    async _initStorageHints() {`
);

fs.writeFileSync(path, text, 'utf8');
console.log('Patched queue prune logic in download_manager.js');
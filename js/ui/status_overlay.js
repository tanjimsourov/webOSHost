/**
 * StatusOverlay
 * ------------
 * Enhances waiting/download UX and keeps playback status visible.
 */
(function () {
  const TAG = '[StatusOverlay]';
  const PREF_HIDE_ALWAYS_KEY = 'hide_download_overlay';
  const PREF_SEEN_ONCE_KEY = 'download_overlay_seen';

  function $(id) {
    return document.getElementById(id);
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.style && el.style.display === 'none') return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function setProgress(el, ratio) {
    if (!el) return;
    const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
    el.style.setProperty('--smc-progress', String(clamped));
  }

  function formatPercent(ratio) {
    const val = Math.max(0, Math.min(100, Math.round((Number(ratio) || 0) * 100)));
    return String(val) + '%';
  }

  function attachToCurrentScreen() {
    const rel = $('relative_container');
    const overlay = $('smcStatusOverlay');
    if (!rel || !overlay) return;
    if (overlay.__smcAttached) return;
    overlay.__smcAttached = true;

    const waiting = $('txtWaitingContent');
    const writing = $('txtWritingFile');
    const pbar = $('p_Bar2');
    const spinner = $('circularProgress');
    const token = $('txtTokenId');
    const tokenLine = $('smcTokenLine');
    const phaseLine = $('smcDownloadPhase');
    const metaLine = $('smcDownloadMeta');

    const playbackHud = $('smcPlaybackHud');
    const playbackState = $('smcPlaybackState');
    const playbackTrack = $('smcPlaybackTrack');
    const playbackQueue = $('smcPlaybackQueue');

    function refreshTokenLine() {
      try {
        if (!tokenLine) return;
        var txt = token ? (token.textContent || '').trim() : '';
        if (!txt) {
          var t = (window.prefs && (prefs.getString('token_no', '') || prefs.getString('TokenId', ''))) || '';
          if (t) txt = 'Token ID : ' + t;
        }
        tokenLine.textContent = txt;
      } catch (e) {}
    }

    function isHidePopupAlwaysEnabled() {
      try {
        if (!window.prefs || typeof prefs.getString !== 'function') return false;
        return String(prefs.getString(PREF_HIDE_ALWAYS_KEY, '0') || '0') === '1';
      } catch (e) {
        return false;
      }
    }

    function hasDownloadPopupBeenSeen() {
      try {
        if (!window.prefs || typeof prefs.getString !== 'function') return false;
        return String(prefs.getString(PREF_SEEN_ONCE_KEY, '0') || '0') === '1';
      } catch (e) {
        return false;
      }
    }

    function markDownloadPopupSeen() {
      try {
        if (!window.prefs || typeof prefs.setString !== 'function') return;
        prefs.setString(PREF_SEEN_ONCE_KEY, '1');
      } catch (e) {}
    }

    function isPlaybackActive() {
      try {
        var vv = document.getElementById('video_view');
        var videoEl = vv ? vv.querySelector('video') : null;
        var candidates = [
          videoEl,
          document.getElementById('previmg'),
          document.getElementById('webView'),
          document.getElementById('mp3layout'),
          document.getElementById('player-video'),
          document.getElementById('player-image'),
          document.getElementById('player-web'),
          document.getElementById('player-audio')
        ];

        for (var i = 0; i < candidates.length; i++) {
          var el = candidates[i];
          if (!el) continue;
          var cs = window.getComputedStyle(el);
          if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0') {
            return true;
          }
        }
      } catch (e) {}
      return false;
    }

    function updateDownloadLines(opts) {
      opts = opts || {};

      if (phaseLine) {
        phaseLine.style.display = opts.phaseText ? 'block' : 'none';
        phaseLine.textContent = opts.phaseText || '';
      }

      if (metaLine) {
        metaLine.style.display = opts.metaText ? 'block' : 'none';
        metaLine.textContent = opts.metaText || '';
      }

      if (waiting) {
        waiting.style.display = opts.waitingText ? 'block' : 'none';
        waiting.textContent = opts.waitingText || '';
      }

      if (writing) {
        writing.style.display = opts.fileText ? 'block' : 'none';
        writing.textContent = opts.fileText || '';
      }

      if (pbar) {
        if (opts.showProgress) {
          pbar.style.display = 'block';
          setProgress(pbar, opts.progressRatio || 0);
        } else {
          pbar.style.display = 'none';
          setProgress(pbar, 0);
        }
      }

      if (spinner) {
        spinner.style.display = opts.showSpinner ? 'block' : 'none';
      }
    }

    function updatePlaybackHud(detail) {
      if (!playbackHud) return;
      detail = detail || {};

      var stateText = String(detail.message || detail.state || '').trim();
      var title = String(detail.title || '').trim();
      var artist = String(detail.artist || '').trim();
      var mediaType = String(detail.mediaType || '').trim();
      var source = String(detail.source || '').trim();
      var currentIndex = Number(detail.currentIndex || 0);
      var total = Number(detail.total || 0);
      var playlistId = String(detail.playlistId || '').trim();

      var shouldShow = !!stateText || !!title || !!artist || !!mediaType || !!source || total > 0;
      playbackHud.style.display = shouldShow ? 'block' : 'none';

      if (playbackState) {
        playbackState.textContent = stateText || 'Waiting for playlist...';
      }

      if (playbackTrack) {
        var trackParts = [];
        if (title) trackParts.push(title);
        if (artist) trackParts.push('Artist: ' + artist);
        if (mediaType) trackParts.push('Type: ' + mediaType);
        if (source) trackParts.push('Source: ' + source);
        playbackTrack.textContent = trackParts.join(' | ');
      }

      if (playbackQueue) {
        var queueParts = [];
        if (total > 0) {
          queueParts.push('Item ' + Math.max(1, currentIndex || 1) + ' of ' + total);
        }
        if (playlistId) {
          queueParts.push('Playlist: ' + playlistId);
        }
        playbackQueue.textContent = queueParts.join(' | ');
      }

      if ((detail.state || '').toLowerCase() === 'playing') {
        playbackHud.classList.add('is-playing');
      } else {
        playbackHud.classList.remove('is-playing');
      }
    }

    function refreshOverlayVisibility() {
      if (isPlaybackActive() || isHidePopupAlwaysEnabled()) {
        overlay.style.display = 'none';
        return;
      }

      const waitingHasText = waiting && (waiting.textContent || '').trim().length > 0;
      const writingHasText = writing && (writing.textContent || '').trim().length > 0;
      const phaseHasText = phaseLine && (phaseLine.textContent || '').trim().length > 0;
      const metaHasText = metaLine && (metaLine.textContent || '').trim().length > 0;

      const shouldShow =
        (waitingHasText && isVisible(waiting)) ||
        (writingHasText && isVisible(writing)) ||
        (phaseHasText && isVisible(phaseLine)) ||
        (metaHasText && isVisible(metaLine)) ||
        isVisible(pbar) ||
        isVisible(spinner);
      overlay.style.display = shouldShow ? 'flex' : 'none';
    }

    try {
      const obs = new MutationObserver(refreshOverlayVisibility);
      obs.observe(rel, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
      overlay.__smcObserver = obs;
    } catch (e) {
      console.warn(TAG, 'MutationObserver unavailable', e);
    }

    window.addEventListener('smc:sync', function (ev) {
      const d = (ev && ev.detail) || {};
      refreshTokenLine();

      updateDownloadLines({
        phaseText: 'Syncing with server',
        metaText: typeof d.progress === 'number' ? ('Progress: ' + formatPercent(d.progress)) : '',
        waitingText: d.message || 'Syncing content...',
        fileText: d.fileName ? ('Preparing: ' + d.fileName) : '',
        showProgress: typeof d.progress === 'number',
        progressRatio: typeof d.progress === 'number' ? d.progress : 0,
        showSpinner: !!d.showSpinner
      });

      refreshOverlayVisibility();
    });

    window.addEventListener('smc:download', function (ev) {
      const d = (ev && ev.detail) || {};
      const total = Number(d.total) || 0;
      const current = Number(d.current) || 0;
      const ratio = total > 0 ? (current / total) : 0;
      const done = d.phase === 'done';
      const storageOnly = d.phase === 'storage';
      const isDownloadPhase = !done && !storageOnly;

      const hideAlways = isHidePopupAlwaysEnabled();
      const seenOnce = hasDownloadPopupBeenSeen();
      const playbackNow = isPlaybackActive();
      const suppressDownloadPopup = hideAlways || playbackNow || seenOnce;

      if (suppressDownloadPopup) {
        updateDownloadLines({
          phaseText: '',
          metaText: '',
          waitingText: '',
          fileText: '',
          showProgress: false,
          progressRatio: 0,
          showSpinner: false
        });
        refreshTokenLine();
        overlay.style.display = 'none';
        return;
      }

      var queueSongs = Number((d.queue && d.queue.songs) || 0);
      var queueAds = Number((d.queue && d.queue.ads) || 0);
      var queueTotal = Number((d.queue && d.queue.total) || (queueSongs + queueAds) || 0);
      var queueSuffix = queueTotal > 0 ? (' | Songs: ' + queueSongs + ' Ads: ' + queueAds) : '';

      var phaseText = storageOnly ? 'Storage status' : (done ? 'Download completed' : 'Downloading media files');
      var metaText = '';
      if (storageOnly) {
        metaText = (d.stage ? ('Stage: ' + d.stage + ' | ') : '') + (d.message || '');
      } else if (total > 0 && current > 0) {
        metaText = 'Item ' + Math.min(current, total) + ' of ' + total + ' (' + formatPercent(ratio) + ')' + queueSuffix;
      } else if (done) {
        metaText = 'All queued files processed' + queueSuffix;
      }

      updateDownloadLines({
        phaseText: phaseText,
        metaText: metaText,
        waitingText: storageOnly ? (d.message || 'Checking storage...') : (d.message || (done ? 'Download complete' : 'Downloading content...')),
        fileText: storageOnly ? '' : (d.fileName || ''),
        showProgress: !done && !storageOnly && total > 0,
        progressRatio: ratio,
        showSpinner: !done && !storageOnly
      });

      if (isDownloadPhase && total > 0 && !seenOnce) {
        markDownloadPopupSeen();
      }

      refreshTokenLine();
      refreshOverlayVisibility();
    });

    window.addEventListener('smc:playback', function (ev) {
      updatePlaybackHud((ev && ev.detail) || {});
      refreshOverlayVisibility();
    });

    refreshTokenLine();
    refreshOverlayVisibility();
  }

  window.addEventListener('DOMContentLoaded', function () {
    try {
      const root = document.getElementById('app') || document.body;
      const obs = new MutationObserver(function () {
        attachToCurrentScreen();
      });
      obs.observe(root, { childList: true, subtree: true });
      attachToCurrentScreen();
    } catch (e) {
      console.warn(TAG, 'Failed to observe app container', e);
      attachToCurrentScreen();
    }
  });
})();



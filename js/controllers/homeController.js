/**
 * Home controller orchestrating playlist, advertisement, download and
 * playback management. This implementation follows the high-level
 * ordering of the Android HomeActivity: schedules are fetched,
 * playlists and songs retrieved, downloads enqueued, advertisements
 * fetched, and finally playback begins. A PlaylistWatcher monitors
 * schedule changes and updates the player accordingly.
 *
 * Key features:
 *   - Instantiates PlaylistManager, AdsManager, DownloadManager and
 *     Player on mount.
 *   - Fetches playlist schedules and content from the server using
 *     identifiers persisted in preferences (dfclientid, token_no,
 *     cityid, countryid, stateid, rotation etc.).
 *   - Computes the current day number (1-7 with Sunday=1) to mirror
 *     Utilities.getCurrentDayNumber() for weekNo.
 *   - Enqueues songs and advertisements that are not yet downloaded
 *     into the DownloadManager and starts the download process.
 *   - Starts a PlaylistWatcher to detect active playlist changes and
 *     loads the corresponding downloaded songs into the Player.
 *   - Cleans up timers, playback and listeners when unmounted.
 *
 * SECTION 1-3 additions:
 *   - StatusReporter: login, heartbeat, played song/ad, logout reporting
 *   - Scheduler: periodic refresh of playlists/ads and download queue
 *   - WatchdogService: playback monitoring and recovery
 *   - SignalRClient: server push commands for remote control
 */
(function () {
  var TAG = '[HOME]';
  var log = (window.ControllerBase && window.ControllerBase.createLogger)
    ? window.ControllerBase.createLogger(TAG)
    : {
        info: console.log.bind(console, TAG),
        warn: console.warn.bind(console, TAG),
        error: console.error.bind(console, TAG),
      };

  // Store references to running components for cleanup
  var state = {};

  // Media playback state (mirroring Java HomeActivity)
  var mediaState = {
    currentlyPlayingSongAtIndex: 0,
    currentlyPlayingAdAtIndex: -1,
    currentlyPlayingAdAtIndexMin: -1,
    currentlyPlayingAdAtIndexSong: -1,
    currentlyPlayingAdAtIndexTime: -1,
    currentlyPlayingPlayallAdAtIndexSong: -1,
    playNextSongIex: -1,
    playNextAdvIndex: -1,
    y: 1, // Video visibility flag
    playad: true,
    adextension: "mp5",
    isPendingAd: false,
    shouldPlaySoftStopAd: false,
    ctrplaylistchg: 0,
    playlistcounter: 0,
    imgcounter: 0,
    keyct: 0,
    univKeyCode: "",
    t: 0,
    temploop: 1,
    currentCatPlaylistIndex: 0,
    currentCatPlaylistAdsIndex: 0,
    typemp3: "song",
    AdPlayOnce: "",
    flavourtype: ""
  };

  // Advertisement arrays (mirroring Java)
  var advertisements = {
    arrAdvertisementsSong: [],
    arrAdvertisementsMinute: [],
    arrAdvertisementsTime: [],
    arrAdvertisementsSongFilter: [],
    arrAdvertisementsSongcurrenttime: [],
    arrAdvertisementsPlayAll: [],
    arrAdvertisementsPlaychecker: [],
    arrtotalSongs: [],
    arradvplaylistid: []
  };

  // Playlist arrays (mirroring Java)
  var playlists = {
    arrPlaylists: [],
    arrPlaylistsstatus: [],
    arrSongs: [],
    arrSongsDownloadAll: [],
    arrSongsweb: [],
    songsArrayList: [],
    filtersongsArrayList: [],
    songsArrayListStatus: [],
    playlistCatSchd: []
  };

  // Timer references (mirroring Java)
  var timers = {
    imgCountdowntimer: null,
    imgCountdowntimer1: null,
    imgCountdowntimer2: null,
    mCountDownTimer: null,
    KeyCountdownTimer: null,
    UrlCountdowntimerAd: null
  };

  // Counters and tracking (mirroring Java)
  var counters = {
    PLAY_AD_AFTER_SONGS_COUNTER: 0,
    ADVERTISEMENT_TIME_COUNTER: 0,
    ctrupdate: 0
  };

  // Volume control (mirroring Java)
  var volume = {
    vol: 1.0,
    vol1: 1.0
  };

    // Media completion handlers (mirroring Java MediaPlayer.OnMediaCompletionListener)
  function handleMediaCompletion(mediaType, mediaPlayer) {
    try {
      log.info('Media completion triggered for type:', mediaType);
      
      // Cancel all image countdown timers
      if (timers.imgCountdowntimer) {
        timers.imgCountdowntimer.cancel();
        timers.imgCountdowntimer = null;
      }
      if (timers.imgCountdowntimer1) {
        timers.imgCountdowntimer1.cancel();
        timers.imgCountdowntimer1 = null;
      }
      if (timers.imgCountdowntimer2) {
        timers.imgCountdowntimer2.cancel();
        timers.imgCountdowntimer2 = null;
      }
      
      // Advertisement logic (mirroring Java lines 2024-2040)
      if (advertisements.arrAdvertisementsSong && advertisements.arrAdvertisementsSong.length > 0) {
        if ((mediaState.currentlyPlayingAdAtIndex === 2) || (mediaState.adextension === "mp3")) {
          if (state.playtypechk === "Playallonce") {
            mediaState.playad = false;
          } else {
            mediaState.playad = false;
          }
          mediaState.adextension = "";
        } else {
          mediaState.playad = true;
          counters.PLAY_AD_AFTER_SONGS_COUNTER++;
        }
      }
      
      // Check for advertisements to play
      if (advertisements.arrAdvertisementsSong.length > 0 || 
          advertisements.arrAdvertisementsMinute.length > 0 || 
          advertisements.arrAdvertisementsTime.length > 0) {
        
        if (mediaState.currentlyPlayingAdAtIndex === 2) {
          if (mediaState.playad === false) {
            // Do nothing
          } else {
            counters.ADVERTISEMENT_TIME_COUNTER = 0;
          }
          
          if (counters.PLAY_AD_AFTER_SONGS_COUNTER > 2000000) {
            counters.PLAY_AD_AFTER_SONGS_COUNTER = 0;
          }
        }
        
        // Advertisement type checking (mirroring Java lines 2070-2087)
        var advertisementTypeSong = prefs.getString('is_song_Adv', '0');
        
        if (advertisementTypeSong === "1") {
          if (advertisements.arrtotalSongs.length > 0) {
            if ((counters.PLAY_AD_AFTER_SONGS_COUNTER) % parseInt(advertisements.arrtotalSongs[0]) === 0) {
              var p = playSongAdv();
              if (p === true) {
                if (mediaState.adextension === "mp3") {
                  // Handle MP3 advertisement
                } else {
                  return;
                }
              }
            }
          } else {
            var p = playSongAdv();
            if (p === true) {
              if (mediaState.adextension === "mp3") {
                // Handle MP3 advertisement
              } else {
                return;
              }
            }
          }
        }
      }
      
      // Handle next song playback (mirroring Java lines 2125-2145)
      if (mediaState.playNextSongIex !== -1) {
        playnextSong();
        return;
      }
      
      // Normal playlist advancement
      var schtype = prefs.getString('SchType', 'Normal');
      if (schtype === 'Normal') {
        if (playlists.arrSongs.length - 1 > mediaState.currentlyPlayingSongAtIndex) {
          mediaState.currentlyPlayingSongAtIndex++;
        } else {
          mediaState.currentlyPlayingSongAtIndex = 0;
        }
      } else {
        getCatschdParameters();
      }
      
      // Insert song status and play next
      insertsongStatus(mediaState.currentlyPlayingSongAtIndex);
      playNextMediaItem();
      
    } catch (error) {
      log.error('Error in media completion handler:', error);
    }
  }
  
  // Advertisement visibility and playback (mirroring Java setVisibilityAndPlayAdvertisement)
  function setVisibilityAndPlayAdvertisement(arrAdvertisements, gblindex, type, param) {
    try {
      log.info('Setting visibility and playing advertisement:', type, param);
      
      mediaState.currentlyPlayingAdAtIndex = gblindex;
      if (mediaState.currentlyPlayingAdAtIndex < 0) {
        mediaState.currentlyPlayingAdAtIndex = 0;
      } else if (mediaState.currentlyPlayingAdAtIndex >= arrAdvertisements.length - 1) {
        mediaState.currentlyPlayingAdAtIndex = 0;
      } else {
        mediaState.currentlyPlayingAdAtIndex++;
      }
      
      // Set advertisement indices based on type
      if (type === 'Song') {
        mediaState.currentlyPlayingAdAtIndexSong = mediaState.currentlyPlayingAdAtIndex;
        if (param !== '') {
          // Update tracking maps
          advertisements.totsongfreq[param] = mediaState.currentlyPlayingAdAtIndexSong;
          // PlaylistSongindexAds logic would go here
        }
      } else if (type === 'Minute') {
        mediaState.currentlyPlayingAdAtIndexMin = mediaState.currentlyPlayingAdAtIndex;
        // PlaylistSongindexAdsMin logic would go here
      } else {
        mediaState.currentlyPlayingAdAtIndexTime = mediaState.currentlyPlayingAdAtIndex;
      }
      
      var f = arrAdvertisements[mediaState.currentlyPlayingAdAtIndex].adv_file_url || arrAdvertisements[mediaState.currentlyPlayingAdAtIndex].adv_path;
      var h = f.substring(f.length - 3);
      mediaState.adextension = h;
      
      // Handle different advertisement types (mirroring Java lines 3221-3381)
      if (h !== 'mp3') {
        // Stop current media and cancel timers
        if (state.mediaEngine && state.mediaEngine.videoPlayer) {
          state.mediaEngine.videoPlayer.stop();
        }
        cancelAllImageTimers();
      }
      
      insertAdvertisementStatus(arrAdvertisements, mediaState.currentlyPlayingAdAtIndex);
      
      if (h === 'jpg') {
        playImageAdvertisement(arrAdvertisements, mediaState.currentlyPlayingAdAtIndex);
      } else if (h === 'mp3') {
        playAudioAdvertisement(arrAdvertisements, mediaState.currentlyPlayingAdAtIndex);
      } else if (h === 'mp4') {
        playVideoAdvertisement(arrAdvertisements, mediaState.currentlyPlayingAdAtIndex);
      } else {
        playWebAdvertisement(arrAdvertisements, mediaState.currentlyPlayingAdAtIndex);
      }
      
    } catch (error) {
      log.error('Error setting advertisement visibility:', error);
    }
  }
  
  // Play image advertisement
  function playImageAdvertisement(arrAdvertisements, index) {
    try {
      log.info('Playing image advertisement:', index);
      
      mediaState.y = 0;
      var k = arrAdvertisements[index].adv_file_path || arrAdvertisements[index].adv_path;
      
      // Set visibility states
      setMediaVisibility('image');
      
      // Load image
      if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
        state.mediaEngine.advertisementPlayer.playImage(k);
      }
      
      // Set countdown timer
      var timeinterval = (arrAdvertisements[index].timeinterval || 15) * 1000;
      timers.imgCountdowntimer = setTimeout(function() {
        checkimgSuccesive();
      }, timeinterval);
      
    } catch (error) {
      log.error('Error playing image advertisement:', error);
    }
  }
  
  // Play audio advertisement
  function playAudioAdvertisement(arrAdvertisements, index) {
    try {
      log.info('Playing audio advertisement:', index);
      
      var k = arrAdvertisements[index].adv_file_path || arrAdvertisements[index].adv_path;
      
      if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
        state.mediaEngine.advertisementPlayer.playAudio(k);
      }
      
    } catch (error) {
      log.error('Error playing audio advertisement:', error);
    }
  }
  
  // Play video advertisement
  function playVideoAdvertisement(arrAdvertisements, index) {
    try {
      log.info('Playing video advertisement:', index);
      
      var k = arrAdvertisements[index].adv_file_path || arrAdvertisements[index].adv_path;
      
      if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
        state.mediaEngine.advertisementPlayer.playVideo(k);
      }
      
      // Show video after short delay
      setTimeout(function() {
        setMediaVisibility('video');
      }, 500);
      
    } catch (error) {
      log.error('Error playing video advertisement:', error);
    }
  }
  
  // Play web advertisement
  function playWebAdvertisement(arrAdvertisements, index) {
    try {
      log.info('Playing web advertisement:', index);
      
      var url = arrAdvertisements[index].adv_file_url || arrAdvertisements[index].adv_path;
      
      if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
        state.mediaEngine.advertisementPlayer.playWeb(url);
      }
      
      // Set timer for web advertisement
      timers.UrlCountdowntimerAd = setTimeout(function() {
        checkimgSuccesive();
      }, 20000);
      
    } catch (error) {
      log.error('Error playing web advertisement:', error);
    }
  }
  
  // Cancel all image timers
  function cancelAllImageTimers() {
    if (timers.imgCountdowntimer) {
      clearTimeout(timers.imgCountdowntimer);
      timers.imgCountdowntimer = null;
    }
    if (timers.imgCountdowntimer1) {
      clearTimeout(timers.imgCountdowntimer1);
      timers.imgCountdowntimer1 = null;
    }
    if (timers.imgCountdowntimer2) {
      clearTimeout(timers.imgCountdowntimer2);
      timers.imgCountdowntimer2 = null;
    }
  }
  
  // Set media visibility (mirroring Java visibility management)
  function setMediaVisibility(type) {
    try {
      var elements = {
        txtTokenId: document.getElementById('txtTokenId'),
        myImage: document.getElementById('myImage') || document.getElementById('previmg'),
        Imgicon: document.getElementById('imgID5'),
        txtArtist: document.getElementById('Artist'),
        txtSong: document.getElementById('songtitle1'),
        portraitmp3layout: document.getElementById('mp3layout'),
        circularProgressBar: document.getElementById('circularProgress'),
        webView: document.getElementById('webView'),
        videoPlayer: document.getElementById('mainVideoPlayer') || document.querySelector('#video_view video'),
        blackLayout: document.getElementById('blacklayout')
      };
      
      // Hide all elements first
      Object.values(elements).forEach(function(el) {
        if (el) el.style.display = 'none';
      });
      
      switch (type) {
        case 'image':
          if (elements.myImage) {
            elements.myImage.style.display = 'block';
            elements.myImage.style.visibility = 'visible';
          }
          break;
          
        case 'video':
          if (elements.videoPlayer) {
            elements.videoPlayer.style.display = 'block';
            elements.videoPlayer.style.visibility = 'visible';
          }
          break;
          
        case 'audio':
          if (elements.portraitmp3layout) {
            elements.portraitmp3layout.style.display = 'block';
            elements.portraitmp3layout.style.visibility = 'visible';
          }
          if (elements.Imgicon) {
            elements.Imgicon.style.display = 'block';
            elements.Imgicon.style.visibility = 'visible';
          }
          if (elements.txtArtist) {
            elements.txtArtist.style.display = 'block';
            elements.txtArtist.style.visibility = 'visible';
          }
          if (elements.txtSong) {
            elements.txtSong.style.display = 'block';
            elements.txtSong.style.visibility = 'visible';
          }
          (function() {
            elements.portraitmp3layout.style.display = 'block';
            elements.portraitmp3layout.style.visibility = 'visible';
          })();
          if (elements.Imgicon) {
            (function() {
              var waitingEl = document.getElementById('txtWaitingContent');
              var progressBarEl = document.getElementById('circularProgress');
              var pBar2El = document.getElementById('p_Bar2');
              // Listen for download manager completion to hide waiting and progress
              var onDownloadComplete = async function() {
                // Hide waiting once download queue is processed
                if (waitingEl) waitingEl.style.display = 'none';
                if (progressBarEl) progressBarEl.style.display = 'none';
                if (pBar2El) pBar2El.style.display = 'none';
              };
              // Because DownloadManager does not expose events we poll
              // its internal state every second.  Once currentIndex
              // reaches queue length we consider it complete.
              var downloadPoll = setInterval(function() {
                try {
                  if (!state.downloadManager) return;
                  var qm = state.downloadManager;
                  if (qm.queue && qm.currentIndex >= qm.queue.length) {
                    clearInterval(downloadPoll);
                    onDownloadComplete();
                  } else {
                    // Show progress bar while downloading
                    if (progressBarEl) progressBarEl.style.display = 'block';
                    if (pBar2El) pBar2El.style.display = 'block';
                  }
                } catch (err) {
                  clearInterval(downloadPoll);
                }
              }, 1000);
            })();
          }
          break;
          
        case 'web':
          if (elements.webView) {
            elements.webView.style.display = 'block';
            elements.webView.style.visibility = 'visible';
          }
          break;
          
        case 'none':
          if (elements.blackLayout) {
            elements.blackLayout.style.display = 'block';
            elements.blackLayout.style.visibility = 'visible';
          }
          break;
      }
      
    } catch (error) {
      log.error('Error setting media visibility:', error);
    }
  }
  
  // Play next media item
  function playNextMediaItem() {
    try {
      if (playlists.arrSongs.length === 0) {
        log.warn('No songs available for playback');
        setWaitingText('No songs available for playback');
        emitPlaybackState({ state: 'waiting', message: 'No songs available for playback' });
        return;
      }
      
      var song = playlists.arrSongs[mediaState.currentlyPlayingSongAtIndex];
      var f = song.title_url || song.song_path;
      var mediatype = song.mediatype || 'video';
      var h = f.substring(f.length - 3);
      
      log.info('Playing next media item:', mediatype, h);
      
      // Handle different media types (mirroring Java lines 2158-2399)
      if (mediatype === 'Url') {
        playUrlContent(song);
      } else if (h === 'jpg' || h === 'jpeg' || h === 'png') {
        playImageContent(song);
      } else if (h === 'mp4') {
        playVideoContent(song);
      } else {
        playAudioContent(song);
      }
      
    } catch (error) {
      log.error('Error playing next media item:', error);
    }
  }
  
  // Play URL content
  function playUrlContent(song) {
    try {
      log.info('Playing URL content:', song.title);
      reportPlayback(song, 'web', 'Playing web content');
      
      setMediaVisibility('web');
      
      if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
        var url = song.title_url;
        
        // Handle time parameter replacement
        var uri = new URL(url);
        var ct = uri.searchParams.get('ct');
        if (ct === '00:00') {
          var modurl = url.replace('00:00', getCurrentTimeHHMM());
          state.mediaEngine.advertisementPlayer.playWeb(modurl);
        } else {
          state.mediaEngine.advertisementPlayer.playWeb(url);
        }
      }
      
      // Set countdown timer
      var timeinterval = (song.timeinterval || 30) * 1000;
      timers.imgCountdowntimer2 = setTimeout(function() {
        if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
          state.mediaEngine.advertisementPlayer.stop();
        }
        checkimgSuccesive();
      }, timeinterval);
      
    } catch (error) {
      log.error('Error playing URL content:', error);
    }
  }
  
  // Play image content
  function playImageContent(song) {
    try {
      log.info('Playing image content:', song.title);
      reportPlayback(song, 'image', 'Displaying image content');
      
      mediaState.y = 0;
      var k = song.song_path;
      
      setMediaVisibility('image');
      
      if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
        state.mediaEngine.advertisementPlayer.playImage(k);
      }
      
      // Set countdown timer
      var timeinterval = (song.timeinterval || 15) * 1000;
      timers.imgCountdowntimer2 = setTimeout(function() {
        checkimgSuccesive();
      }, timeinterval);
      
    } catch (error) {
      log.error('Error playing image content:', error);
    }
  }
  
  // Play video content
  function playVideoContent(song) {
    try {
      log.info('Playing video content:', song.title);
      reportPlayback(song, 'video', 'Playing video content');
      
      if (mediaState.y === 0 && state.myImage) {
        state.myImage.style.visibility = 'hidden';
      }
      mediaState.y = 1;
      
      setMediaVisibility('video');
      
      if (state.mediaEngine && state.mediaEngine.videoPlayer) {
        state.mediaEngine.videoPlayer.play(song);
      }
      
    } catch (error) {
      log.error('Error playing video content:', error);
    }
  }
  
  // Play audio content
  function playAudioContent(song) {
    try {
      log.info('Playing audio content:', song.title);
      reportPlayback(song, 'audio', 'Playing audio content');
      
      if (mediaState.y === 0) {
        if (state.myImage) {
          state.myImage.style.visibility = 'hidden';
        }
      }
      mediaState.y = 1;
      
      setMediaVisibility('audio');
      
      if (state.mediaEngine && state.mediaEngine.videoPlayer) {
        state.mediaEngine.videoPlayer.play(song);
      }
      
      // Update UI elements
      var txtSong = document.getElementById('songtitle1');
      var txtArtist = document.getElementById('Artist');
      if (txtSong) txtSong.textContent = song.title || '';
      if (txtArtist) txtArtist.textContent = song.artist_name || '';
      
    } catch (error) {
      log.error('Error playing audio content:', error);
    }
  }
  
  // Get current time in HH:MM format
  function getCurrentTimeHHMM() {
    var now = new Date();
    var hours = now.getHours().toString().padStart(2, '0');
    var minutes = now.getMinutes().toString().padStart(2, '0');
    return hours + ':' + minutes;
  }
  
  // Check image successive (mirroring Java checkimgSuccesive)
  function checkimgSuccesive() {
    try {
      log.info('Checking for successive media playback');
      
      // Advertisement logic
      if (advertisements.arrAdvertisementsSong && advertisements.arrAdvertisementsSong.length > 0) {
        if ((mediaState.currentlyPlayingAdAtIndex === 2) || (mediaState.adextension === 'mp3')) {
          mediaState.playad = false;
          mediaState.adextension = '';
        } else {
          mediaState.playad = true;
          counters.PLAY_AD_AFTER_SONGS_COUNTER++;
        }
      }
      
      // Cancel timers
      cancelAllImageTimers();
      
      // Handle next song from web
      if (mediaState.playNextSongIex !== -1) {
        playnextSong();
        return;
      }
      
      // Normal playlist advancement
      var schtype = prefs.getString('SchType', 'Normal');
      if (schtype === 'Normal') {
        if (playlists.arrSongs.length - 1 > mediaState.currentlyPlayingSongAtIndex) {
          mediaState.currentlyPlayingSongAtIndex++;
        } else {
          mediaState.currentlyPlayingSongAtIndex = 0;
        }
      } else {
        getCatschdParameters();
      }
      
      playNextMediaItem();
      
    } catch (error) {
      log.error('Error in checkimgSuccesive:', error);
    }
  }
  
  // Play song advertisement (mirroring Java playSongAdv)
  function playSongAdv() {
    try {
      if (mediaState.playad === true) {
        var filteredAds = getFiltertimeadv();
        
        if (filteredAds && filteredAds.length > 0) {
          for (var i = 0; i < advertisements.arrtotalSongs.length; i++) {
            if (counters.PLAY_AD_AFTER_SONGS_COUNTER !== 0) {
              if ((counters.PLAY_AD_AFTER_SONGS_COUNTER) % parseInt(advertisements.arrtotalSongs[i]) === 0) {
                if (advertisements.arrAdvertisementsSongFilter.length > 0) {
                  if (advertisements.flavourtype === 'normal') {
                    // Handle normal advertisement
                    setVisibilityAndPlayAdvertisement(advertisements.arrAdvertisementsSongFilter, mediaState.currentlyPlayingAdAtIndexSong, 'Song', advertisements.arrtotalSongs[i]);
                    return true;
                  } else {
                    // Handle category advertisement
                    playCategoryAds(advertisements.arradvplaylistid, mediaState.currentlyPlayingSongAtIndex, 'Song', advertisements.arrtotalSongs[i]);
                    return true;
                  }
                }
              }
            }
            break;
          }
        } else {
          counters.PLAY_AD_AFTER_SONGS_COUNTER = 0;
        }
      }
      
      return false;
      
    } catch (error) {
      log.error('Error in playSongAdv:', error);
      return false;
    }
  }
  
  // Get filtered time advertisements (mirroring Java getFiltertimeadv)
  function getFiltertimeadv() {
    try {
      advertisements.arrAdvertisementsSongFilter = [];
      advertisements.arrtotalSongs = [];
      advertisements.arradvplaylistid = [];
      
      var currentTime = getCurrentTimeMillis();
      
      for (var i = 0; i < advertisements.arrAdvertisementsSong.length; i++) {
        var ad = advertisements.arrAdvertisementsSong[i];
        var starttime = ad.bt_start_adv_time_millis || 0;
        var endtime = ad.end_adv_time_millis || 0;
        
        if (currentTime >= starttime && currentTime < endtime) {
          advertisements.arrAdvertisementsSongFilter.push(ad);
          advertisements.flavourtype = ad.ads_flav_type || '';
          advertisements.arradvplaylistid.push(ad.advt_play_id);
          advertisements.arrtotalSongs.push(ad.total_songs || '1');
        }
      }
      
      // Remove duplicates
      advertisements.arrtotalSongs = [...new Set(advertisements.arrtotalSongs)];
      advertisements.arradvplaylistid = [...new Set(advertisements.arradvplaylistid)];
      
      return advertisements.arrAdvertisementsSongFilter;
      
    } catch (error) {
      log.error('Error in getFiltertimeadv:', error);
      return [];
    }
  }
  
  // Get current time in milliseconds
  function getCurrentTimeMillis() {
    return new Date().getTime();
  }
  
  // Play category advertisements
  function playCategoryAds(arrcat, index, type, param) {
    try {
      if (arrcat.length - 1 > mediaState.currentCatPlaylistAdsIndex) {
        mediaState.currentCatPlaylistAdsIndex++;
      } else {
        mediaState.currentCatPlaylistAdsIndex = 0;
      }
      
      if (arrcat.length > 0) {
        var filterlist = getfilteradslistplaylistwise(advertisements.arrAdvertisementsSongFilter, arrcat[mediaState.currentCatPlaylistAdsIndex]);
        if (filterlist && filterlist.length > 0) {
          advertisements.arrAdvertisementsSongcurrenttime = filterlist;
          setVisibilityAndPlayAdvertisement(advertisements.arrAdvertisementsSongcurrenttime, mediaState.currentlyPlayingAdAtIndexSong, type, param);
        } else {
          setVisibilityAndPlayAdvertisement(advertisements.arrAdvertisementsSongcurrenttime, index, type, param);
        }
      }
      
    } catch (error) {
      log.error('Error in playCategoryAds:', error);
    }
  }
  
  // Filter advertisements by playlist
  function getfilteradslistplaylistwise(advertisements, playlistId) {
    try {
      return advertisements.filter(function(ad) {
        return ad.advt_play_id === playlistId;
      });
    } catch (error) {
      log.error('Error in getfilteradslistplaylistwise:', error);
      return [];
    }
  }
  
  // Get category scheduling parameters
  function getCatschdParameters() {
    try {
      // This would integrate with PlaylistManager for category scheduling
      // For now, implement basic logic
      if (playlists.playlistCatSchd && playlists.playlistCatSchd.length > 0) {
        if (playlists.playlistCatSchd.length - 1 > mediaState.currentCatPlaylistIndex) {
          mediaState.currentCatPlaylistIndex++;
        } else {
          mediaState.currentCatPlaylistIndex = 0;
        }
        
        // Filter songs for current category
        var filterlist = getfiltersonglistplaylistwise(playlists.filtersongsArrayList, (playlists.playlistCatSchd[mediaState.currentCatPlaylistIndex].sp_playlist_id || playlists.playlistCatSchd[mediaState.currentCatPlaylistIndex].spl_playlist_id));
        if (filterlist && filterlist.length > 0) {
          playlists.arrSongs = filterlist;
          // Update current song index logic would go here
        }
      }
      
    } catch (error) {
      log.error('Error in getCatschdParameters:', error);
    }
  }
  
  // Filter songs by playlist
  function getfiltersonglistplaylistwise(songs, playlistId) {
    try {
      return songs.filter(function(song) {
        return (song.sp_playlist_id || song.spl_playlist_id) === playlistId;
      });
    } catch (error) {
      log.error('Error in getfiltersonglistplaylistwise:', error);
      return [];
    }
  }
  
  // Insert song status (mirroring Java insertsongStatus)
  function insertsongStatus(index) {
    try {
      if (!playlists.arrSongs || playlists.arrSongs.length === 0 || index >= playlists.arrSongs.length) {
        return;
      }
      
      var song = playlists.arrSongs[index];
      var artist_id = song.artist_id || '';
      var title_id = song.title_id || '';
      var spl_playlist_id = (song.sp_playlist_id || song.spl_playlist_id) || '';
      
      // This would integrate with PlayerStatusManager
      if (state.playerStatusManager) {
        state.playerStatusManager.insertSongPlayedStatus({
          artist_id: artist_id,
          title_id: title_id,
          spl_playlist_id: spl_playlist_id
        });
      }
      
    } catch (error) {
      log.error('Error in insertsongStatus:', error);
    }
  }
  
  // Insert advertisement status
  function insertAdvertisementStatus(arrAdvertisements, index) {
    try {
      if (!arrAdvertisements || arrAdvertisements.length === 0 || index >= arrAdvertisements.length) {
        return;
      }
      
      var ad = arrAdvertisements[index];
      var currentDate = new Date().toISOString().split('T')[0];
      var currenttime = new Date().toTimeString().split(' ')[0];
      
      // This would integrate with PlayerStatusManager
      if (state.playerStatusManager) {
        state.playerStatusManager.insertAdvPlayerStatus({
          adv_played_date: currentDate,
          adv_played_time: currenttime,
          adv_id_status: ad.adv_id,
          player_status_all: 'adv'
        });
      }
      
    } catch (error) {
      log.error('Error in insertAdvertisementStatus:', error);
    }
  }

  function setWaitingText(message) {
    var waitingEl = document.getElementById('txtWaitingContent');
    if (waitingEl) {
      waitingEl.style.display = 'block';
      waitingEl.textContent = message || '';
    }

    var overlayEl = document.getElementById('smcStatusOverlay');
    if (overlayEl) {
      var suppressOverlay = false;
      try {
        var hideAlways = window.prefs && String(prefs.getString('hide_download_overlay', '0') || '0') === '1';
        var vv = document.getElementById('video_view');
        var videoEl = vv ? vv.querySelector('video') : null;
        var candidates = [
          videoEl,
          document.getElementById('previmg'),
          document.getElementById('webView'),
          document.getElementById('mp3layout')
        ];
        var mediaVisible = candidates.some(function (el) {
          if (!el) return false;
          var cs = window.getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        });
        suppressOverlay = hideAlways || mediaVisible;
      } catch (e) {
        suppressOverlay = false;
      }

      overlayEl.style.display = suppressOverlay ? 'none' : 'flex';
    }

    emitPlaybackState({
      state: 'waiting',
      message: message || 'Waiting for content...'
    });
  }

  function clearWaitingText() {
    var waitingEl = document.getElementById('txtWaitingContent');
    if (waitingEl) {
      waitingEl.textContent = '';
      waitingEl.style.display = 'none';
    }
    var overlayEl = document.getElementById('smcStatusOverlay');
    if (overlayEl) {
      var writing = document.getElementById('txtWritingFile');
      var progress = document.getElementById('p_Bar2');
      var spinner = document.getElementById('circularProgress');
      var hasWriting = writing && writing.style.display !== 'none' && (writing.textContent || '').trim().length > 0;
      var hasProgress = progress && progress.style.display !== 'none';
      var hasSpinner = spinner && spinner.style.display !== 'none';
      if (!hasWriting && !hasProgress && !hasSpinner) {
        overlayEl.style.display = 'none';
      }
    }
  }

  function emitPlaybackState(detail) {
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('smc:playback', { detail: detail || {} }));
      }
    } catch (err) {
      // best effort
    }
  }

  function detectMediaSource(song) {
    if (!song) return 'Unknown';
    var isDownloaded = Number(song.is_downloaded || song.download_status || 0) === 1;
    if (isDownloaded) return 'Downloaded';
    if (song.song_path && song.song_url && String(song.song_path) !== String(song.song_url)) {
      return 'Downloaded';
    }
    return 'Streaming';
  }

  function buildPlaybackState(song, mediaType, stateText) {
    var total = (playlists && playlists.arrSongs && playlists.arrSongs.length) || 0;
    var index = (typeof mediaState.currentlyPlayingSongAtIndex === 'number')
      ? (mediaState.currentlyPlayingSongAtIndex + 1)
      : 0;
    var playlistId = '';

    if (state && state.selectedPlaylistId) {
      playlistId = state.selectedPlaylistId;
    } else if (song) {
      playlistId = song.sp_playlist_id || song.spl_playlist_id || '';
    }

    return {
      state: 'playing',
      message: stateText || 'Playing',
      title: (song && (song.title || song.titles || song.Title || song.TitleName)) || '',
      artist: (song && (song.artist_name || song.artist || song.ArtistName)) || '',
      mediaType: mediaType || (song && song.mediatype) || 'media',
      source: detectMediaSource(song),
      currentIndex: index,
      total: total,
      playlistId: playlistId
    };
  }

  function reportPlayback(song, mediaType, stateText) {
    emitPlaybackState(buildPlaybackState(song, mediaType, stateText));
  }

  function renderPlaylists(playlists) {
    var container = document.getElementById('listViewPlaylists');
    if (!container) return;
    container.innerHTML = '';
    if (!playlists || playlists.length === 0) {
      setWaitingText('No playlists available');
      return;
    }

    playlists.forEach(function (pl, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'playlist_' + String(pl.sp_playlist_id || idx);
      btn.textContent = pl.sp_name || ('Playlist ' + String(pl.sp_playlist_id || idx));
      btn.className = 'playlist-item';
      if (String(state.selectedPlaylistId || '') === String(pl.sp_playlist_id || '')) {
        btn.classList.add('is-active');
      }

      btn.addEventListener('click', function () {
        try {
          state.selectedPlaylistId = pl.sp_playlist_id;
          var all = container.querySelectorAll('.playlist-item');
          all.forEach(function (el) { el.classList.remove('is-active'); });
          btn.classList.add('is-active');
          loadAndRenderSongs(pl.sp_playlist_id);
        } catch (e) {}
      });
      container.appendChild(btn);
    });

    if (!state.selectedPlaylistId && playlists[0] && playlists[0].sp_playlist_id) {
      state.selectedPlaylistId = playlists[0].sp_playlist_id;
      loadAndRenderSongs(playlists[0].sp_playlist_id);
    }
  }

  // Enhanced playlist loading with scheduling types (mirroring Java getSongsForPlaylist)
  function getSongsForPlaylist(playlist) {
    try {
      log.info('Loading songs for playlist:', (playlist.sp_playlist_id || playlist.spl_playlist_id));
      
      mediaState.currentlyPlayingSongAtIndex = 0;
      
      if (playlists.arrSongs.length > 0) {
        playlists.arrSongs = [];
      }
      
      var schtype = prefs.getString('SchType', 'Normal');
      
      if (schtype === 'Normal') {
        // Normal playlist loading
        if (state.playlistManager) {
          playlists.songsArrayList = state.playlistManager.getSongsForPlaylist((playlist.sp_playlist_id || playlist.spl_playlist_id));
        }
      } else {
        // Random playlist loading
        if (state.playlistManager) {
          playlists.songsArrayList = state.playlistManager.getSongsForPlaylistRandom((playlist.sp_playlist_id || playlist.spl_playlist_id));
          
          if (playlists.filtersongsArrayList.length > 0) {
            playlists.filtersongsArrayList = [];
          }
          playlists.filtersongsArrayList = playlists.songsArrayList || [];
          
          // Category scheduling logic
          getAllPlaylistSchdcategory();
          if (playlists.playlistCatSchd && playlists.playlistCatSchd.length > 0) {
            var filterlist = getfiltersonglistplaylistwise(
              playlists.filtersongsArrayList,
              (playlists.playlistCatSchd[mediaState.currentCatPlaylistIndex].sp_playlist_id || playlists.playlistCatSchd[mediaState.currentCatPlaylistIndex].spl_playlist_id)
            );
            if (filterlist && filterlist.length > 0) {
              playlists.songsArrayList = filterlist;
              // PlaylistSongindex logic would go here
            }
          }
        }
      }
      
      if (playlists.songsArrayList && playlists.songsArrayList.length > 0) {
        playlists.arrSongs = playlists.songsArrayList;
      }
      
      // Handle song separation if active
      if (playlists.arrSongs.length > 0 && playlist.is_separation_active === 1) {
        sortSongs(playlists.arrSongs);
      }
      
      // Update UI and check for downloads
      if (playlists.arrSongs.length > 0) {
        renderSongs(playlists.arrSongs);
        
        // Check for songs not downloaded
        if (state.playlistManager) {
          var songNotDownloaded = state.playlistManager.getSongsThatAreNotDownloaded((playlist.sp_playlist_id || playlist.spl_playlist_id));
          if (songNotDownloaded && songNotDownloaded.length > 0) {
            if (state.downloadManager && typeof state.downloadManager.addSongsToQueue === 'function') {
              state.downloadManager.addSongsToQueue(songNotDownloaded);
            }
            setWaitingText('Downloading playlist media... (' + songNotDownloaded.length + ' pending)');
            // Start download service if needed
            if (state.downloadManager && !window.dmIsRunning(state.downloadManager)) {
              state.downloadManager.start();
            }
          }
        }
      } else {
        // Handle empty playlist
        if (state.playlistManager) {
          var songNotDownloaded = state.playlistManager.getSongsThatAreNotDownloaded((playlist.sp_playlist_id || playlist.spl_playlist_id));
          if (songNotDownloaded && songNotDownloaded.length > 0) {
            if (state.downloadManager && typeof state.downloadManager.addSongsToQueue === 'function') {
              state.downloadManager.addSongsToQueue(songNotDownloaded);
            }
            setWaitingText('Downloading playlist media... (' + songNotDownloaded.length + ' pending)');
            if (state.downloadManager && !window.dmIsRunning(state.downloadManager)) {
              state.downloadManager.start();
            }
          } else {
            setMediaVisibility('none');
            setWaitingText('No playable media available for this schedule.');
          }
        }
      }
      
      // Start playback if songs are available
      if (playlists.arrSongs.length > 0) {
        startPlayback();
      }
      
    } catch (error) {
      log.error('Error in getSongsForPlaylist:', error);
    }
  }
  
  // Sort songs for separation (mirroring Java sort)
  function sortSongs(songsArrayList) {
    try {
      // Shuffle songs for separation
      for (var i = songsArrayList.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = songsArrayList[i];
        songsArrayList[i] = songsArrayList[j];
        songsArrayList[j] = temp;
      }
    } catch (error) {
      log.error('Error in sortSongs:', error);
    }
  }
  
  // Get all playlist schedule categories
  function getAllPlaylistSchdcategory() {
    try {
      if (state.playlistManager) {
        playlists.playlistCatSchd = state.playlistManager.getAllPlaylistCatSchd();
      }
    } catch (error) {
      log.error('Error in getAllPlaylistSchdcategory:', error);
    }
  }
  
  // Start playback with media type detection
  function startPlayback() {
    try {
      if (playlists.arrSongs.length === 0) {
        log.warn('No songs available for playback');
        setWaitingText('No songs available for playback');
        emitPlaybackState({ state: 'waiting', message: 'No songs available for playback' });
        return;
      }
      
      var song = playlists.arrSongs[mediaState.currentlyPlayingSongAtIndex];
      var f = song.title_url || song.song_path;
      var mediatype = song.mediatype || 'video';
      var h = f.substring(f.length - 3);
      
      log.info('Starting playback:', mediatype, h);
      clearWaitingText();
      reportPlayback(song, mediatype, 'Starting playback');
      
      insertsongStatus(mediaState.currentlyPlayingSongAtIndex);
      
      // Handle different media types
      if (mediatype === 'Url') {
        playUrlContent(song);
      } else if (h === 'jpg' || h === 'jpeg' || h === 'png') {
        playImageContent(song);
      } else if (h === 'mp4') {
        playVideoContent(song);
      } else {
        playAudioContent(song);
      }
      
    } catch (error) {
      log.error('Error in startPlayback:', error);
    }
  }
  
  // Load advertisements (mirroring Java getAdvertisements)
  async function getAdvertisements() {
    try {
      log.info('Loading advertisements');
      
      // Clear advertisement arrays
      advertisements.arrAdvertisementsSong = [];
      advertisements.arrAdvertisementsMinute = [];
      advertisements.arrAdvertisementsTime = [];
      
      if (state.advertisementsManager) {
        var ads = [];
        if (typeof state.advertisementsManager.getAdvertisementsThatAreDownloaded === 'function') {
          ads = await state.advertisementsManager.getAdvertisementsThatAreDownloaded();
        } else if (
          state.advertisementsManager.advertisementDataSource &&
          typeof state.advertisementsManager.advertisementDataSource.getAllAdv === 'function'
        ) {
          ads = await state.advertisementsManager.advertisementDataSource.getAllAdv();
        }
        if (ads && ads.length > 0) {
          for (var i = 0; i < ads.length; i++) {
            var ad = ads[i];
            if (String(ad.adv_song || ad.is_song || '0') === '1') {
              advertisements.arrAdvertisementsSong.push(ad);
            }
            if (String(ad.adv_time || ad.is_time || '0') === '1') {
              advertisements.arrAdvertisementsTime.push(ad);
            }
            if (String(ad.adv_minute || ad.is_minute || '0') === '1') {
              advertisements.arrAdvertisementsMinute.push(ad);
            }
          }
          
          // Set minute ads if available
          if (advertisements.arrAdvertisementsMinute.length > 0 && state.playlistWatcher) {
            state.playlistWatcher.setMinuteAds(advertisements.arrAdvertisementsMinute, 'AllDownload');
          }
        }
      }
      
    } catch (error) {
      log.error('Error in getAdvertisements:', error);
    }
  }
  
  // Play next song from web (mirroring Java playnextSong)
  function playnextSong() {
    try {
      if (playlists.arrSongsweb.length === 0) {
        log.warn('No web songs available');
        emitPlaybackState({ state: 'waiting', message: 'No songs available for web playback' });
        return;
      }
      
      mediaState.currentlyPlayingAdAtIndex = 2; // VIDEO_VIEW_TAG equivalent
      var f = playlists.arrSongsweb[mediaState.playNextSongIex].title_url;
      var h = f.substring(f.length - 3);
      
      if (h === 'jpg' || h === 'jpeg' || h === 'png') {
        playNextSongImage();
      } else if (h === 'mp4') {
        playNextSongVideo();
      } else if (h === 'mp3') {
        playNextSongAudio();
      } else {
        playNextSongWeb();
      }
      
    } catch (error) {
      log.error('Error in playnextSong:', error);
    }
  }
  
  // Play next song as image
  function playNextSongImage() {
    try {
      mediaState.y = 0;
      setMediaVisibility('image');
      
      var k = playlists.arrSongsweb[mediaState.playNextSongIex].song_path;
      reportPlayback(playlists.arrSongsweb[mediaState.playNextSongIex], 'image', 'Playing requested image');
      if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
        state.mediaEngine.advertisementPlayer.playImage(k);
      }
      
      if (mediaState.temploop !== 1) {
        mediaState.playNextSongIex = -1;
      }
      
      // Set timer
      timers.imgCountdowntimer = setTimeout(function() {
        checkimgSuccesive();
      }, 10000);
      
    } catch (error) {
      log.error('Error in playNextSongImage:', error);
    }
  }
  
  // Play next song as video
  function playNextSongVideo() {
    try {
      if (mediaState.y === 0 && state.myImage) {
        state.myImage.style.visibility = 'hidden';
      }
      mediaState.y = 1;
      
      setMediaVisibility('video');
      reportPlayback(playlists.arrSongsweb[mediaState.playNextSongIex], 'video', 'Playing requested video');
      
      if (state.mediaEngine && state.mediaEngine.videoPlayer) {
        state.mediaEngine.videoPlayer.play(playlists.arrSongsweb[mediaState.playNextSongIex]);
      }
      
      if (mediaState.temploop !== 1) {
        mediaState.playNextSongIex = -1;
      }
      
    } catch (error) {
      log.error('Error in playNextSongVideo:', error);
    }
  }
  
  // Play next song as audio
  function playNextSongAudio() {
    try {
      if (mediaState.y === 0) {
        if (state.myImage) {
          state.myImage.style.visibility = 'hidden';
        }
      }
      mediaState.y = 1;
      
      setMediaVisibility('audio');
      reportPlayback(playlists.arrSongsweb[mediaState.playNextSongIex], 'audio', 'Playing requested audio');
      
      if (state.mediaEngine && state.mediaEngine.videoPlayer) {
        state.mediaEngine.videoPlayer.play(playlists.arrSongsweb[mediaState.playNextSongIex]);
      }
      
      // Update UI
      var txtSong = document.getElementById('songtitle1');
      var txtArtist = document.getElementById('Artist');
      if (txtSong) txtSong.textContent = playlists.arrSongsweb[mediaState.playNextSongIex].title || '';
      if (txtArtist) txtArtist.textContent = playlists.arrSongsweb[mediaState.playNextSongIex].artist_name || '';
      
      if (mediaState.temploop !== 1) {
        mediaState.playNextSongIex = -1;
      }
      
    } catch (error) {
      log.error('Error in playNextSongAudio:', error);
    }
  }
  
  // Play next song as web content
  function playNextSongWeb() {
    try {
      setMediaVisibility('web');
      reportPlayback(playlists.arrSongsweb[mediaState.playNextSongIex], 'web', 'Playing requested web content');
      
      if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
        state.mediaEngine.advertisementPlayer.playWeb(playlists.arrSongsweb[mediaState.playNextSongIex].title_url);
      }
      
      if (mediaState.temploop !== 1) {
        mediaState.playNextSongIex = -1;
      }
      
      // Set timer
      timers.imgCountdowntimer2 = setTimeout(function() {
        if (state.mediaEngine && state.mediaEngine.advertisementPlayer) {
          state.mediaEngine.advertisementPlayer.stop();
        }
        checkimgSuccesive();
      }, 15000);
      
    } catch (error) {
      log.error('Error in playNextSongWeb:', error);
    }
  }
  
  // Render songs with enhanced UI
  function renderSongs(songs) {
    try {
      var container = document.getElementById('listViewSongs');
      if (!container) return;
      container.innerHTML = '';
      
      if (!songs || songs.length === 0) {
        var empty = document.createElement('div');
        empty.textContent = 'No songs available';
        empty.className = 'song-item song-empty';
        container.appendChild(empty);
        return;
      }
      
      songs.forEach(function (s, idx) {
        var row = document.createElement('div');
        row.id = 'song_' + String(s.title_id || idx);
        row.className = 'song-item';
        row.textContent = (idx + 1) + '. ' + (s.title || s.Title || 'Song');
        
        // Highlight current playing song
        if (idx === mediaState.currentlyPlayingSongAtIndex) {
          row.classList.add('is-active');
        }
        
        row.addEventListener('click', function () {
          try {
            mediaState.currentlyPlayingSongAtIndex = idx;
            startPlayback();
            // Update UI to show new selection
            renderSongs(songs);
          } catch (e) {
            log.error('Error playing selected song:', e);
          }
        });
        
        container.appendChild(row);
      });
      
    } catch (error) {
      log.error('Error in renderSongs:', error);
    }
  }

  async function loadAndRenderSongs(playlistId) {
    try {
      if (!playlistId) {
        renderSongs([]);
        return;
      }
      var songsDataSource = new SongsDataSource();
      var downloadedSongs = await songsDataSource.getSongsThoseAreDownloaded(playlistId);
      if (!downloadedSongs || downloadedSongs.length === 0) {
        downloadedSongs = await songsDataSource.getSongsThoseAreNotDownloaded(playlistId);
      }
      renderSongs(downloadedSongs || []);
    } catch (error) {
      log.error('Failed to load songs for playlist:', playlistId, error);
      renderSongs([]);
    }
  }
  
  // Media engine integration with completion handlers
  function initializeMediaEngine() {
    try {
      if (window.MediaEngine) {
        state.mediaEngine = new window.MediaEngine();
        
        // Set up completion handlers
        if (state.mediaEngine.videoPlayer) {
          state.mediaEngine.videoPlayer.on('ended', function() {
            handleMediaCompletion('video', state.mediaEngine.videoPlayer);
          });
        }
        
        if (state.mediaEngine.advertisementPlayer) {
          state.mediaEngine.advertisementPlayer.on('ended', function() {
            handleMediaCompletion('advertisement', state.mediaEngine.advertisementPlayer);
          });
        }
        
        log.info('Media engine initialized with completion handlers');
      }
    } catch (error) {
      log.error('Error initializing media engine:', error);
    }
  }

  async function loadAndRenderPlaylists(playlistManager) {
    try {
      setWaitingText('Loading playlists...');
      var distinct = await playlistManager.playlistDataSource.getAllDistinctPlaylists();
      renderPlaylists(distinct);
    } catch (err) {
      log.error('Failed to render playlists', err);
      setWaitingText('Failed to load playlists');
    }
  }

  /**
   * Compute the day number used by the server for week scheduling.
   * In Java Sunday maps to 1 and Saturday to 7. JavaScript's
   * `getDay()` returns 0 for Sunday so we adjust accordingly.
   */
  function getWeekNumber() {
    var jsDay = new Date().getDay(); // 0=Sunday, 1=Monday, ...
    return jsDay === 0 ? 1 : jsDay + 1;
  }

  /**
   * Mount the home controller. Sets up managers, fetches data and
   * starts playback/watcher loops. Any async errors are logged but
   * do not interrupt the user interface.
   */
  function mount(context) {
    log.info('mount', context && context.route ? 'route=' + context.route : '');
    
    // Legacy media engine is disabled by default because it conflicts with the modern Player pipeline.
    // Enable only for debugging legacy parity behavior.
    var enableLegacyHomeFlow = !!(typeof window !== 'undefined' && window.ENABLE_LEGACY_HOME_FLOW === true);
    
    // Instantiate managers. AdsManager and DownloadManager are
    // constructed without arguments; PlaylistManager accepts an
    // optional listener for progress callbacks. Player accepts
    // references to AdsManager and DownloadManager.
    var playlistManager = new PlaylistManager({
      startedGettingPlaylist: function () {
        log.info('playlist fetch START');
      },
      finishedGettingPlaylist: function () {
        log.info('playlist fetch SUCCESS');
      },
      errorInGettingPlaylist: function () {
        log.error('playlist fetch ERROR');
      },
    });
    var adsManager = new AdsManager();
    var downloadManager = new DownloadManager();
    var player = new Player({ adsManager: adsManager, downloadManager: downloadManager });
    
    // Persist into state for cleanup
    state.playlistManager = playlistManager;
    state.adsManager = adsManager;
    state.downloadManager = downloadManager;
    state.player = player;
    state.advertisementsManager = adsManager; // For advertisement management

    /**
     * Enhanced initialization with Java parity
     * 
     * Mirroring Java HomeActivity onCreate() and onStart() methods
     * - Initialize UI elements
     * - Load playlists and advertisements
     * - Start media engine
     * - Set up completion handlers
     */
    if (enableLegacyHomeFlow) {
      (function initEnhancedSystem() {
        try {
          // Initialize UI elements (mirroring Java lines 771-800)
          initializeUIElements();

          // Load playlists for current time (mirroring Java getPlaylistsForCurrentTime)
          getPlaylistsForCurrentTime();

          // Load advertisements (mirroring Java getAdvertisements)
          getAdvertisements();

          // Check for songs to be downloaded
          var songs = getSongsToBeDownloaded();
          var ads = getAdvertisementsToBeDownloaded();

          if ((songs && songs.length > 0) || (ads && ads.length > 0)) {
            if (songs && songs.length > 0 && state.downloadManager && typeof state.downloadManager.addSongsToQueue === 'function') {
              state.downloadManager.addSongsToQueue(songs);
            }
            if (ads && ads.length > 0 && state.downloadManager && typeof state.downloadManager.addAdsToQueue === 'function') {
              state.downloadManager.addAdsToQueue(ads);
            }
            setWaitingText('Preparing downloads...');
            // Start download service if needed
            if (state.downloadManager && !window.dmIsRunning(state.downloadManager)) {
              state.downloadManager.start();
            }
          }

          // Initialize playlist watcher
          if (window.PlaylistWatcher) {
            // Legacy watcher API is not available in all builds; guard to avoid mount-time failures.
            var legacyWatcher = new window.PlaylistWatcher();
            if (
              legacyWatcher &&
              typeof legacyWatcher.setContext === 'function' &&
              typeof legacyWatcher.setPlaylistStatusListener === 'function' &&
              typeof legacyWatcher.setWatcher === 'function'
            ) {
              state.playlistWatcher = legacyWatcher;
              state.playlistWatcher.setContext(window);
              state.playlistWatcher.setPlaylistStatusListener({
                onPlaylistStatusChanged: onPlaylistStatusChanged,
                playAdvertisement: playAdvertisement,
                checkForPendingDownloads: checkForPendingDownloads,
                refreshPlayerControls: refreshPlayerControls,
                shouldUpdateTimeOnServer: shouldUpdateTimeOnServer
              });
              state.playlistWatcher.setWatcher();
            } else {
              log.info('Skipping legacy PlaylistWatcher wiring; modern watcher initialized later in mount');
            }
          }

          log.info('Enhanced system initialization completed');

        } catch (error) {
          log.error('Error in enhanced system initialization:', error);
        }
      })();
    } else {
      // Ensure legacy UI references still exist for helper methods used by this controller.
      initializeUIElements();
      log.info('Legacy HomeActivity media flow disabled; using modern Player pipeline only');
    }

    /**
     * UI binding (parity with Java HomeActivity)
     *
     * The original Android implementation updates the token display,
     * waiting text and progress indicators during initialisation.  To
     * mirror that behaviour on webOS the controller grabs relevant
     * DOM elements from the home template and sets their initial
     * state based on the persisted preferences and download queue.
     */
    (function initUiBindings() {
      try {
        var tokenTextEl = document.getElementById('txtTokenId');
        var waitingEl = document.getElementById('txtWaitingContent');
        var progressBarEl = document.getElementById('circularProgress');
        var pBar2El = document.getElementById('p_Bar2');
        // Show token id if available
        var tId = prefs.getString('token_no', '') || prefs.getString('TokenId', '');
        if (tokenTextEl && tId) {
          tokenTextEl.style.display = 'block';
          tokenTextEl.textContent = 'Token: ' + tId;
        }
        // Show waiting text until playlists are loaded
        if (waitingEl) {
          waitingEl.style.display = 'block';
        }
        setWaitingText('Waiting for downloaded content...');
        // Hide progress bars initially
        if (progressBarEl) progressBarEl.style.display = 'none';
        if (pBar2El) pBar2El.style.display = 'none';
      } catch (error) {
        log.error('Error initializing home UI bindings:', error);
      }
    })();

  // Initialize UI elements (mirroring Java HomeActivity onCreate)
  function initializeUIElements() {
    try {
      // Get all UI elements (mirroring Java lines 771-800)
      state.uiElements = {
        layout: document.getElementById('mainContainer'),
        portraitmp3layout: document.getElementById('mp3layout'),
        blackLayout: document.getElementById('blacklayout'),
        mp3layout: document.getElementById('mp3rotate'),
        webView: document.getElementById('webView'),
        imglayout: document.getElementById('rotateimg'),
        videolayout: document.getElementById('rotatevideo'),
        rotateweb: document.getElementById('rotateweb'),
        mPreviewads: document.getElementById('video_viewads'),
        circularProgressBar: document.getElementById('circularProgress'),
        hzProgressBar: document.getElementById('p_Bar2'),
        lvPlaylist: document.getElementById('listViewPlaylists'),
        lvSongs: document.getElementById('listViewSongs'),
        Imgmarker: document.getElementById('marker'),
        mPreview: document.getElementById('video_view'),
        txtFileWriter: document.getElementById('txtWritingFile'),
        txtSong: document.getElementById('songtitle1'),
        txtArtist: document.getElementById('Artist'),
        txttimer: document.getElementById('txttimer'),
        myImage: document.getElementById('previmg'),
        Imgicon: document.getElementById('imgID5'),
        waitImgicon: document.getElementById('waitimg'),
        txtTokenId: document.getElementById('txtTokenId'),
        txtwaiting: document.getElementById('txtWaitingContent')
      };
      
      // Set initial visibility states (mirroring Java)
      if (state.uiElements.txtTokenId) {
        var token = prefs.getString('token_no', '') || prefs.getString('TokenId', '');
        if (token.length > 0) {
          state.uiElements.txtTokenId.textContent = 'Token: ' + token;
        }
      }
      
      // Handle indicator image visibility
      var inditype = prefs.getString('Indicatorimg', '0');
      if (state.uiElements.Imgmarker) {
        state.uiElements.Imgmarker.style.visibility = inditype === '1' ? 'visible' : 'hidden';
      }
      
      // Set rotation (mirroring Java lines 823-834)
      var rotation = prefs.getString('Rotation', '0');
      if (rotation === '') rotation = '0';
      
      var rotationAngle = parseInt(rotation);
      if (state.uiElements.mp3layout) {
        state.uiElements.mp3layout.style.transform = 'rotate(' + rotationAngle + 'deg)';
      }
      if (state.uiElements.imglayout) {
        state.uiElements.imglayout.style.transform = 'rotate(' + rotationAngle + 'deg)';
      }
      if (state.uiElements.videolayout) {
        state.uiElements.videolayout.style.transform = 'rotate(' + rotationAngle + 'deg)';
      }
      if (state.uiElements.rotateweb) {
        state.uiElements.rotateweb.style.transform = 'rotate(' + rotationAngle + 'deg)';
      }
      
      log.info('UI elements initialized');
      
    } catch (error) {
      log.error('Error initializing UI elements:', error);
    }
  }
  
  // Get playlists for current time (mirroring Java getPlaylistsForCurrentTime)
  function getPlaylistsForCurrentTime() {
    try {
      log.info('Getting playlists for current time');
      
      if (playlists.arrPlaylists.length > 0) {
        playlists.arrPlaylists = [];
      }
      
      if (state.playlistManager) {
        var playlistArrayList = state.playlistManager.getPlaylistForCurrentTimeOnly();
        
        if (playlistArrayList && playlistArrayList.length > 0) {
          playlists.arrPlaylists = playlistArrayList;
          
          // Handle volume settings (mirroring Java lines 3415-3453)
          var p = playlists.arrPlaylists[0].spl_playlist_category;
          if (p === '1') {
            volume.vol = 0.0;
            volume.vol1 = 0.0;
          } else {
            var volper = playlists.arrPlaylists[0].volper || '100';
            if (volper === '0') {
              volume.vol = 0.0;
              volume.vol1 = 0.0;
            } else {
              volume.vol = 1.0;
              volume.vol1 = 1.0;
            }
          }
          
          // Hide black layout and show content
          if (state.uiElements.blackLayout) {
            state.uiElements.blackLayout.style.display = 'none';
          }
          if (state.uiElements.mPreview) {
            state.uiElements.mPreview.style.display = 'block';
          }
          if (state.uiElements.txtTokenId) {
            state.uiElements.txtTokenId.style.display = 'block';
          }
          
          // Load songs for first playlist
          if (playlists.arrPlaylists.length > 0) {
            getSongsForPlaylist(playlists.arrPlaylists[0]);
          }
          
        } else {
          // No playlists available
          if (state.uiElements.mPreview) {
            state.uiElements.mPreview.style.display = 'none';
          }
          if (state.uiElements.txtTokenId) {
            state.uiElements.txtTokenId.style.display = 'block';
          }
          if (state.uiElements.blackLayout) {
            state.uiElements.blackLayout.style.display = 'block';
          }
                  setWaitingText('No active schedule right now. Waiting for next playlist...');
        }
      }
      
      // Render playlists in UI
      renderPlaylists(playlists.arrPlaylists);
      
    } catch (error) {
      log.error('Error getting playlists for current time:', error);
    }
  }
  
  // Get songs to be downloaded (mirroring Java getSongsToBeDownloaded)
  function getSongsToBeDownloaded() {
    try {
      if (!state.playlistManager) return [];
      
      var playlists = state.playlistManager.getPlaylistFromLocallyToBedDownload();
      var songsToBeDownloaded = [];
      
      if (playlists && playlists.length > 0) {
        for (var i = 0; i < playlists.length; i++) {
          var playlist = playlists[i];
          var songs = state.playlistManager.getSongsThatAreNotDownloaded((playlist.sp_playlist_id || playlist.spl_playlist_id));
          
          if (songs && songs.length > 0) {
            songsToBeDownloaded = songsToBeDownloaded.concat(songs);
          } else {
            // Check for unscheduled songs
            var unschdSongs = state.playlistManager.getUnschdSongs();
            if (unschdSongs && unschdSongs.length > 0) {
              songsToBeDownloaded = songsToBeDownloaded.concat(unschdSongs);
            }
          }
        }
      }
      
      return songsToBeDownloaded.length > 0 ? songsToBeDownloaded : null;
      
    } catch (error) {
      log.error('Error getting songs to be downloaded:', error);
      return null;
    }
  }
  
  // Get advertisements to be downloaded (mirroring Java getAdvertisementsToBeDownloaded)
  function getAdvertisementsToBeDownloaded() {
    try {
      if (!state.advertisementsManager) return [];
      
      return state.advertisementsManager.getAdvertisementsToBeDownloaded();
      
    } catch (error) {
      log.error('Error getting advertisements to be downloaded:', error);
      return [];
    }
  }
  
  // Playlist status change handler (mirroring Java onPlaylistStatusChanged)
  function onPlaylistStatusChanged(status) {
    try {
      log.info('Playlist status changed:', status);
      
      switch (status) {
        case 0: // NO_PLAYLIST
          // Handle no playlist scenario
          if (mediaState.y !== 0) {
            if (state.mediaEngine && state.mediaEngine.videoPlayer) {
              state.mediaEngine.videoPlayer.stop();
            }
          }
          
          cancelAllImageTimers();
          
          if (mediaState.y === 0 && state.uiElements.myImage) {
            state.uiElements.myImage.style.visibility = 'hidden';
          }
          
          mediaState.ctrplaylistchg = 1;
          mediaState.playlistcounter = 1;
          
          if (state.uiElements.txtTokenId) {
            state.uiElements.txtTokenId.style.display = 'block';
          }
          if (state.uiElements.blackLayout) {
            state.uiElements.blackLayout.style.display = 'block';
          }
          if (state.uiElements.webView) {
            state.uiElements.webView.style.display = 'none';
          }
          setWaitingText('No active schedule right now. Waiting for next playlist...');
          emitPlaybackState({ state: 'waiting', message: 'No active playlist scheduled for this time' });
          break;
          
        case 1: // PLAYLIST_PRESENT
          cancelAllImageTimers();
          mediaState.playlistcounter = 0;
          counters.PLAY_AD_AFTER_SONGS_COUNTER = 0;
          mediaState.ctrplaylistchg = 1;
          
          getPlaylistsForCurrentTime();
          
          if (state.uiElements.txtwaiting) {
            state.uiElements.txtwaiting.style.display = 'none';
          }
          if (state.uiElements.hzProgressBar) {
            state.uiElements.hzProgressBar.style.display = 'none';
          }
          if (state.uiElements.waitImgicon) {
            state.uiElements.waitImgicon.style.display = 'none';
          }
          break;
          
        case 2: // PLAYLIST_CHANGE
          // Handle playlist change
          cancelAllImageTimers();
          mediaState.playlistcounter = 0;
          counters.PLAY_AD_AFTER_SONGS_COUNTER = 0;
          
          if (mediaState.y === 0 && state.uiElements.myImage) {
            state.uiElements.myImage.style.visibility = 'hidden';
          }
          
          mediaState.ctrplaylistchg = 1;
          
          if (state.uiElements.txtwaiting) {
            state.uiElements.txtwaiting.style.display = 'none';
          }
          if (state.uiElements.hzProgressBar) {
            state.uiElements.hzProgressBar.style.display = 'none';
          }
          if (state.uiElements.webView) {
            state.uiElements.webView.style.display = 'none';
          }
          
          getPlaylistsForCurrentTime();
          break;
      }
      
    } catch (error) {
      log.error('Error handling playlist status change:', error);
    }
  }
  
  // Play advertisement handler (mirroring Java playAdvertisement)
  function playAdvertisement(arrAdvertisements, type) {
    try {
      log.info('Playing advertisement:', type);
      
      if (!arrAdvertisements || arrAdvertisements.length === 0) {
        counters.ADVERTISEMENT_TIME_COUNTER = 0;
        mediaState.shouldPlaySoftStopAd = false;
        counters.PLAY_AD_AFTER_SONGS_COUNTER = 0;
        return;
      }
      
      var adPlayType = '';
      if (type === '1') {
        adPlayType = arrAdvertisements[0].playing_type || '';
      } else if (type === '3') {
        adPlayType = 'Hard Stop';
      }
      
      if (adPlayType === 'Hard Stop' || adPlayType === 'Soft Stop') {
        if (arrAdvertisements.length > 0) {
          if (type === '1') {
            mediaState.typemp3 = type;
            setVisibilityAndPlayAdvertisement(arrAdvertisements, mediaState.currentlyPlayingAdAtIndexMin, 'Minute', '');
          } else if (type === '3') {
            setVisibilityAndPlayAdvertisement(arrAdvertisements, mediaState.currentlyPlayingAdAtIndexTime, 'FixedTime', '');
          }
        }
      } else if (adPlayType === '') {
        mediaState.shouldPlaySoftStopAd = true;
        if (mediaState.currentlyPlayingAdAtIndex === 2) {
          mediaState.isPendingAd = true;
        }
      }
      
    } catch (error) {
      log.error('Error playing advertisement:', error);
    }
  }
  
  // Check for pending downloads (mirroring Java checkForPendingDownloads)
  function checkForPendingDownloads() {
    // Implementation would check for unfinished downloads
    log.info('Checking for pending downloads');
  }
  
  // Refresh player controls (mirroring Java refreshPlayerControls)
  function refreshPlayerControls() {
    // Implementation would refresh player UI
    log.info('Refreshing player controls');
  }
  
  // Should update time on server (mirroring Java shouldUpdateTimeOnServer)
  function shouldUpdateTimeOnServer() {
    try {
      if (window.Utilities && window.Utilities.isConnected()) {
        // Update player songs status
        if (state.playerStatusManager) {
          state.playerStatusManager.sendPlayedSongsStatusOnServer();
        }
        
        // Check for update data
        checkForUpdateData();
        
        // Free memory
        freeMemory();
      } else {
        freeMemory();
      }
      
    } catch (error) {
      log.error('Error updating time on server:', error);
    }
  }
  
  // Check for update data (mirroring Java checkForUpdateData)
  function checkForUpdateData() {
    try {
      var shouldUpdateData = false; // This would come from AlenkaMedia.getInstance().isUpdateInProgress
      
      if (!shouldUpdateData && state.playlistManager) {
        state.playlistManager.checkUpdatedPlaylistData();
      }
      
    } catch (error) {
      log.error('Error checking for update data:', error);
    }
  }
  
  // Free memory (mirroring Java freeMemory)
  function freeMemory() {
    try {
      // Trigger garbage collection
      if (window.gc) {
        window.gc();
      }
      
      log.info('Memory freed');
      
    } catch (error) {
      log.error('Error freeing memory:', error);
    }
  }

    // SECTION 1: Start status reporting (login + heartbeat)
    if (window.StatusReporter) {
      log.info('Starting status reporter');
      StatusReporter.reportLogin();
      StatusReporter.startHeartbeat();
      // Flush any queued statuses from offline period
      StatusReporter.flushQueue();
    }

    // SECTION 2: Start scheduler service
    if (window.Scheduler) {
      log.info('Starting scheduler service');
      Scheduler.start({
        playlistManager: playlistManager,
        adsManager: adsManager,
        downloadManager: downloadManager
      });
    }

    // SECTION 2: Start watchdog service (disabled by default to avoid duplicate recovery loops).
    var enableExternalWatchdog = !!(typeof window !== 'undefined' && window.ENABLE_WATCHDOG_SERVICE === true);
    if (enableExternalWatchdog && window.WatchdogService) {
      log.info('Starting watchdog service');
      WatchdogService.start({ player: player });
    } else {
      log.info('Watchdog service disabled; Player internal watchdog remains active');
    }

    // SECTION 2 (Prayer): Start prayer manager
    if (window.PrayerManager) {
      log.info('Starting prayer manager');
      PrayerManager.init({ player: player });
      PrayerManager.start();
    }

    // SECTION 3: Start SignalR client for remote control
    if (window.SignalRClient) {
      log.info('Starting SignalR client');
      SignalRClient.setCallbacks({
        onPlayNext: function (data) {
          log.info('SignalR: Play next song', data);
          if (player && player.playlist && player.playlist.length > 0) {
            player._playSongAtIndex((player.currentSongIndex + 1) % player.playlist.length);
          }
        },
        onPlayPlaylist: function (playlistId) {
          log.info('SignalR: Play playlist', playlistId);
          playPlaylistFromServer(playlistId, player, playlistManager);
        },
        onPlayAd: function (adId) {
          log.info('SignalR: Play ad', adId);
          playAdFromServer(adId, player, adsManager);
        },
        onPlaySong: function (data) {
          log.info('SignalR: Play song', data);
          playSongFromServer(data, player);
        },
        onPublishUpdate: function () {
          log.info('SignalR: Publish update requested');
          handlePublishUpdate(playlistManager, adsManager, downloadManager);
        },
        onRestart: function () {
          log.info('SignalR: Restart requested');
          if (player && player.playlist) {
            player.loadPlaylist(player.playlist);
          }
        },
        onConnected: function () {
          log.info('SignalR: Connected');
          // Ping ApplicationChecker on connect
          if (window.ApplicationChecker) {
            window.ApplicationChecker.ping('signalr');
          }
        },
        onDisconnected: function () {
          log.warn('SignalR: Disconnected');
        }
      });
      SignalRClient.connect();
    }

    // SECTION 4: Initialize receivers
    if (window.MyReceiver) {
      log.info('Initializing MyReceiver');
      MyReceiver.init({
        scheduler: window.Scheduler,
        playlistWatcher: null, // Set after watcher is created
        applicationChecker: window.ApplicationChecker,
        downloadManager: downloadManager
      });
    }

    if (window.LaunchReceiver) {
      log.info('Initializing LaunchReceiver');
      LaunchReceiver.init({
        router: window.router,
        scheduler: window.Scheduler,
        signalrClient: window.SignalRClient,
        applicationChecker: window.ApplicationChecker
      });
    }

    // SECTION 5: Start ApplicationChecker
    if (window.ApplicationChecker) {
      log.info('Starting ApplicationChecker');
      ApplicationChecker.start({
        scheduler: window.Scheduler,
        signalrClient: window.SignalRClient,
        player: player,
        prefs: window.prefs,
        webosBridge: window.webosBridge
      });
    }
    // Compute identifiers from preferences
    var dfClientId = prefs.getString('dfclientid', '');
    var tokenId = prefs.getString('token_no', '');
    var cityId = prefs.getString('cityid', '');
    var countryId = prefs.getString('countryid', '');
    var stateId = prefs.getString('stateid', '');
    var weekNo = String(getWeekNumber());
    function formatCurrentDateForAds() {
      var now = new Date();
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return String(now.getDate()) + '-' + months[now.getMonth()] + '-' + String(now.getFullYear());
    }
    // Helper to enqueue songs not downloaded
    async function enqueueMissingSongs() {
      var songsDataSource = new SongsDataSource();
      try {
        var playlists = await playlistManager.playlistDataSource.getAllDistinctPlaylists();
        var songsToQueue = [];
        for (var i = 0; i < playlists.length; i++) {
          var pl = playlists[i];
          if (typeof songsDataSource.removeDuplicateSongsForPlaylist === 'function') {
            await songsDataSource.removeDuplicateSongsForPlaylist(pl.sp_playlist_id);
          }
          var missing = await songsDataSource.getSongsThoseAreNotDownloaded(pl.sp_playlist_id);
          if (missing && missing.length > 0) {
            log.info('enqueue missing songs for playlist', pl.sp_playlist_id, missing.length);
            songsToQueue = songsToQueue.concat(missing);
          }
        }
        if (songsToQueue.length > 0) {
          downloadManager.addSongsToQueue(songsToQueue);
          setWaitingText('Downloading media... (' + songsToQueue.length + ' files pending)');
        }
        if (!window.dmIsRunning(downloadManager) && downloadManager.queue && downloadManager.queue.length > 0) {
          downloadManager.start();
        }
      } catch (err) {
        log.error('error enqueuing missing songs', err);
      }
    }
    // Helper to enqueue advertisements not downloaded
    async function enqueueMissingAds() {
      try {
        var missingAds = [];
        if (adsManager && typeof adsManager.getAdvertisementsToBeDownloaded === 'function') {
          missingAds = await adsManager.getAdvertisementsToBeDownloaded();
        } else {
          var advDS = new AdvertisementDataSource();
          missingAds = await advDS.getAdvThoseAreNotDownloaded();
        }
        if (missingAds.length > 0) {
          log.info('enqueue missing advertisements', missingAds.length);
          downloadManager.addAdsToQueue(missingAds);
          setWaitingText('Downloading media... (' + missingAds.length + ' ads pending)');
        }
        if (!window.dmIsRunning(downloadManager) && downloadManager.queue && downloadManager.queue.length > 0) {
          downloadManager.start();
        }
      } catch (err) {
        log.error('error enqueuing missing advertisements', err);
      }
    }
    // Fetch playlists and songs from server. When complete, queue
    // missing downloads. Do not await enqueueMissingSongs in order
    // to overlap network latency and local operations.
    if (dfClientId && tokenId) {
      playlistManager
        .getPlaylistsFromServer({ dfClientId: dfClientId, tokenId: tokenId, weekNo: weekNo })
        .then(function () {
          loadAndRenderPlaylists(playlistManager);
          enqueueMissingSongs();
        })
        .catch(function (err) {
          log.warn('Playlist server sync failed, using local cache', err);
          loadAndRenderPlaylists(playlistManager);
        });

      // Fetch advertisements from server. Once finished, enqueue any
      // missing advertisement downloads.
      var currentDate = formatCurrentDateForAds();
      adsManager
        .fetchAdvertisements({
          Cityid: cityId,
          CountryId: countryId,
          CurrentDate: currentDate,
          DfClientId: dfClientId,
          StateId: stateId,
          TokenId: tokenId,
          WeekNo: weekNo,
        })
        .then(function () {
          enqueueMissingAds();
        })
        .catch(function (err) {
          log.warn('Advertisement sync failed, keeping local cache', err);
        });
    } else {
      log.warn('Missing TokenId/DfClientId, loading local cache only');
      loadAndRenderPlaylists(playlistManager);
    }
    // Create watcher to monitor active playlist and load songs into the player
    var watcher = new PlaylistWatcher(playlistManager, {
      onPlaylistStatusChanged: async function (status, playlist) {
        if (!playlist) {
          log.info('No active playlist');

          // Fallback mode: if schedule window is absent, keep device useful by
          // playing any downloaded playlist instead of showing a blank screen.
          try {
            var fallbackSongsDS = new SongsDataSource();
            var fallbackPlaylists = await playlistManager.playlistDataSource.getAllDistinctPlaylists();
            for (var fIdx = 0; fIdx < fallbackPlaylists.length; fIdx++) {
              var fp = fallbackPlaylists[fIdx] || {};
              var fallbackPlaylistId = fp.sp_playlist_id || fp.spl_playlist_id;
              if (!fallbackPlaylistId) continue;

              var fallbackSongs = await fallbackSongsDS.getSongsThoseAreDownloaded(fallbackPlaylistId);
              if (fallbackSongs && fallbackSongs.length > 0) {
                if (state.fallbackModeActive !== true || String(state.fallbackPlaylistId || '') !== String(fallbackPlaylistId)) {
                  player.loadPlaylist(fallbackSongs);
                  state.fallbackModeActive = true;
                  state.fallbackPlaylistId = String(fallbackPlaylistId);
                  log.info('Started fallback playback from downloaded playlist', fallbackPlaylistId, 'songs=' + fallbackSongs.length);
                }
                setWaitingText('No active schedule. Playing downloaded fallback playlist...');
                emitPlaybackState({ state: 'fallback', message: 'Playing downloaded fallback playlist' });
                return;
              }
            }
          } catch (fallbackErr) {
            log.warn('Fallback playback check failed', fallbackErr);
          }

          setMediaVisibility('none');
          setWaitingText('No active schedule right now. Waiting for next playlist...');
          emitPlaybackState({ state: 'waiting', message: 'No active playlist scheduled for this time' });
          return;
        }

        state.fallbackModeActive = false;
        state.fallbackPlaylistId = null;
        log.info('Playlist status changed', status, playlist.sp_playlist_id);
        var songsDataSource = new SongsDataSource();
        var playlistId = playlist.sp_playlist_id || playlist.spl_playlist_id;
        var downloadedSongs = await songsDataSource.getSongsThoseAreDownloaded(playlistId);
        if (!Array.isArray(downloadedSongs)) downloadedSongs = [];
        // Enqueue any missing songs for this playlist
        var missing = await songsDataSource.getSongsThoseAreNotDownloaded(playlistId);
        if (!Array.isArray(missing)) missing = [];
        if (missing.length > 0) {
          downloadManager.addSongsToQueue(missing);
          setWaitingText('Downloading playlist media... (' + missing.length + ' pending)');
          if (!window.dmIsRunning(downloadManager)) {
            downloadManager.start();
          }
        }

        // Build playable list from full playlist while online so all scheduled items are shown.
        // Player still prefers local cache per item via its source resolver.
        var playable = downloadedSongs;
        if (navigator.onLine && missing.length > 0) {
          var merged = downloadedSongs.concat(missing);
          var byOrder = new Map();
          for (var mIdx = 0; mIdx < merged.length; mIdx++) {
            var item = merged[mIdx] || {};
            var key = String(item.serial_no || '') + '|' + String(item.title_id || item._id || item.song_url || item.song_path || mIdx);
            var prev = byOrder.get(key);
            if (!prev || (Number(prev.is_downloaded || 0) !== 1 && Number(item.is_downloaded || 0) === 1)) {
              byOrder.set(key, item);
            }
          }
          playable = Array.from(byOrder.values()).sort(function (a, b) {
            return (a.serial_no || 0) - (b.serial_no || 0);
          });
        }

        if (playable && playable.length > 0) {
          log.info('Loading playlist into player', playlistId, 'downloaded=' + downloadedSongs.length, 'pending=' + missing.length, 'playable=' + playable.length);
          player.loadPlaylist(playable);
          if (missing.length === 0) {
            clearWaitingText();
          }
        } else {
          log.warn('No playable songs available for active playlist', playlistId);
          setWaitingText('Waiting for downloaded content...');
        }
      },
    });
    state.watcher = watcher;
    watcher.start();

    // SECTION 6: Start token publish checker.  When the server
    // indicates a publish update is required, refresh playlists,
    // advertisements and downloads.  This mirrors the Android
    // CheckTokenPublish/UpdateTokenPublish handshake.
    if (window.TokenPublisher) {
      log.info('Starting TokenPublisher');
      TokenPublisher.init({
        onRefreshRequested: function() {
          log.info('TokenPublisher: refresh requested');
          // Refresh playlists and advertisements via managers
          try {
            if (playlistManager.refreshAll) {
              Promise.resolve(playlistManager.refreshAll({ dfClientId: dfClientId, tokenId: tokenId, weekNo: weekNo }))
                .then(function () {
                  enqueueMissingSongs();
                });
            } else if (playlistManager.getPlaylistsFromServer) {
              // Force re-fetch schedule
              playlistManager.getPlaylistsFromServer({ dfClientId: dfClientId, tokenId: tokenId, weekNo: weekNo })
                .then(function() {
                  enqueueMissingSongs();
                });
            }
          } catch (err) {
            log.error('Error refreshing playlists during token publish', err);
          }
          try {
            adsManager.fetchAdvertisements({
              Cityid: cityId,
              CountryId: countryId,
              CurrentDate: formatCurrentDateForAds(),
              DfClientId: dfClientId,
              StateId: stateId,
              TokenId: tokenId,
              WeekNo: weekNo
            }).then(function() {
              enqueueMissingAds();
            });
          } catch (err) {
            log.error('Error refreshing advertisements during token publish', err);
          }
          try {
            // Restart download manager to ensure new items are fetched
            if (downloadManager && typeof downloadManager.start === 'function') {
              downloadManager.start();
            }
          } catch (err) {
            log.error('Error restarting download manager during token publish', err);
          }
        },
        intervalMs: 30 * 60 * 1000 // 30 minute default
      });
    }
    // Bind settings navigation if a button exists in the template
    var settingsBtn = document.getElementById('btn_settings');
    if (settingsBtn) {
      var handleSettings = function () {
        router.navigate('/settings');
      };
      settingsBtn.addEventListener('click', handleSettings);
      state.settingsHandler = handleSettings;
    }
  }

  /**
   * Play a specific song by index or ID (SignalR PlaySong command handler).
   * Matches Java HomeActivity song playback by server command.
   */
  async function playSongFromServer(data, player) {
    try {
      log.info('Playing song from server:', data);

      if (!player) {
        log.error('No player available');
        return;
      }

      // Navigate to player route if not already there
      var currentRoute = window.location.hash.replace('#', '') || '/home';
      if (currentRoute !== '/player' && currentRoute !== '/home') {
        router.navigate('/home');
      }

      // If songIndex is provided, use it directly
      if (data.songIndex !== null && data.songIndex !== undefined) {
        var index = parseInt(data.songIndex, 10);
        if (!isNaN(index) && player.playlist && player.playlist.length > 0) {
          player.playSong(index);
          log.info('Playing song at index:', index);
          return;
        }
      }

      // If titleId/songId is provided, find by ID
      var songId = data.titleId || data.songId;
      if (songId && player.playSongById) {
        var found = player.playSongById(songId);
        if (found) {
          log.info('Playing song by ID:', songId);
          return;
        }
      }

      // Fallback: try to find in current playlist
      if (player.playlist && player.playlist.length > 0 && data.title) {
        for (var i = 0; i < player.playlist.length; i++) {
          if (player.playlist[i].titles === data.title) {
            player.playSong(i);
            log.info('Playing song by title match:', data.title);
            return;
          }
        }
      }

      log.warn('Could not find song to play:', data);
    } catch (err) {
      log.error('Error playing song from server:', err);
    }
  }

  /**
   * Play a playlist from server by ID (SignalR command handler).
   * Matches Java HomeActivity.playplaylistfromwebnow()
   */
  async function playPlaylistFromServer(playlistId, player, playlistManager) {
    try {
      log.info('Playing playlist from server:', playlistId);
      // Fetch songs for this playlist
      if (playlistManager && playlistManager._fetchSongsForPlaylist) {
        await playlistManager._fetchSongsForPlaylist(playlistId);
      }
      // Get downloaded songs
      var songsDS = new SongsDataSource();
      var songs = await songsDS.getSongsThoseAreDownloaded(playlistId);
      if (songs && songs.length > 0) {
        player.loadPlaylist(songs);
        log.info('Loaded playlist with', songs.length, 'songs');
      } else {
        log.warn('No downloaded songs for playlist:', playlistId);
      }
    } catch (err) {
      log.error('Error playing playlist from server:', err);
    }
  }

  /**
   * Play an advertisement by ID (SignalR command handler).
   * Matches Java HomeActivity.playadvnow()
   */
  async function playAdFromServer(adId, player, adsManager) {
    try {
      log.info('Playing ad from server:', adId);
      // Find the ad
      var advDS = new AdvertisementDataSource();
      var allAds = await advDS.getAllAdv();
      var ad = null;
      for (var i = 0; i < allAds.length; i++) {
        if (String(allAds[i].adv_id) === String(adId)) {
          ad = allAds[i];
          break;
        }
      }
      if (ad) {
        player.resumeIndex = player.currentSongIndex;
        await player._playAd(ad);
        log.info('Playing ad:', adId);
      } else {
        log.warn('Ad not found:', adId);
      }
    } catch (err) {
      log.error('Error playing ad from server:', err);
    }
  }

  /**
   * Handle publish update command (SignalR).
   * Matches Java HomeActivity.updateTokenpublish()
   */
  async function handlePublishUpdate(playlistManager, adsManager, downloadManager) {
    try {
      log.info('Handling publish update');
      var dfClientId = prefs.getString('dfclientid', '') || prefs.getString('DfClientId', '');
      var tokenId = prefs.getString('token_no', '') || prefs.getString('TokenId', '');
      var cityId = prefs.getString('cityid', '') || prefs.getString('Cityid', '');
      var countryId = prefs.getString('countryid', '') || prefs.getString('CountryId', '');
      var stateId = prefs.getString('stateid', '') || prefs.getString('StateId', '');
      var weekNo = String(getWeekNumber());

      // Refresh playlists
      if (playlistManager) {
        await playlistManager.getPlaylistsFromServer({
          dfClientId: dfClientId,
          tokenId: tokenId,
          weekNo: weekNo
        });
      }

      // Refresh advertisements
      if (adsManager) {
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var today = new Date();
        var currentDate = String(today.getDate()) + '-' + months[today.getMonth()] + '-' + String(today.getFullYear());
        await adsManager.fetchAdvertisements({
          Cityid: cityId,
          CountryId: countryId,
          CurrentDate: currentDate,
          DfClientId: dfClientId,
          StateId: stateId,
          TokenId: tokenId,
          WeekNo: weekNo
        });
      }

      // Queue missing downloads
      if (downloadManager) {
        var songsDS = new SongsDataSource();
        var playlistDS = new PlaylistDataSource();
        var playlists = await playlistDS.getAllDistinctPlaylists();
        for (var i = 0; i < playlists.length; i++) {
          var missing = await songsDS.getSongsThoseAreNotDownloaded(playlists[i].sp_playlist_id);
          if (missing && missing.length > 0) {
            downloadManager.addSongsToQueue(missing);
          }
        }
        var advDS = new AdvertisementDataSource();
        var missingAds = await advDS.getAdvThoseAreNotDownloaded();
        if (missingAds.length > 0) {
          downloadManager.addAdsToQueue(missingAds);
        }
        if (!window.dmIsRunning(downloadManager)) {
          downloadManager.start();
        }
      }

      log.info('Publish update complete');
    } catch (err) {
      log.error('Error handling publish update:', err);
    }
  }

  /**
   * Unmount the home controller. Stops the watcher, pauses playback
   * and removes any event listeners added during mount.
   */
  function unmount(context) {
    log.info('unmount', context && context.route ? 'route=' + context.route : '');

    // SECTION 1: Report logout and stop heartbeat
    if (window.StatusReporter) {
      log.info('Stopping status reporter and reporting logout');
      StatusReporter.stopHeartbeat();
      StatusReporter.reportLogout();
    }

    // SECTION 2: Stop scheduler service
    if (window.Scheduler) {
      log.info('Stopping scheduler service');
      Scheduler.stop();
    }

    // SECTION 2: Stop watchdog service
    if (window.WatchdogService) {
      log.info('Stopping watchdog service');
      WatchdogService.stop();
    }

    // SECTION 2 (Prayer): Stop prayer manager
    if (window.PrayerManager) {
      log.info('Stopping prayer manager');
      PrayerManager.stop();
    }

    // SECTION 3: Disconnect SignalR client
    if (window.SignalRClient) {
      log.info('Disconnecting SignalR client');
      SignalRClient.disconnect();
    }

    // SECTION 4: Stop ApplicationChecker
    if (window.ApplicationChecker) {
      log.info('Stopping ApplicationChecker');
      ApplicationChecker.stop();
    }

    // SECTION 5: Destroy LaunchReceiver
    if (window.LaunchReceiver) {
      log.info('Destroying LaunchReceiver');
      LaunchReceiver.destroy();
    }

    if (state.watcher) {
      state.watcher.stop();
    }
    if (state.player) {
      try {
        // Pause any playing media
        if (state.player.video && !state.player.video.paused) {
          state.player.video.pause();
        }
        if (state.player.audio && !state.player.audio.paused) {
          state.player.audio.pause();
        }
      } catch (err) {
        log.error('error stopping player', err);
      }
    }
    // Remove settings handler
    var settingsBtn = document.getElementById('btn_settings');
    if (settingsBtn && state.settingsHandler) {
      settingsBtn.removeEventListener('click', state.settingsHandler);
    }
    // Reset state
    state = {};
  }

  window.homeController = {
    mount: mount,
    unmount: unmount,
  };
})();





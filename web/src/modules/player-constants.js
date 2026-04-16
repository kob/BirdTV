(function attachBirdTVConstants(globalObj) {
  const constants = {
    STORAGE_KEY: 'tvplayer.channels.v1',
    AUTO_M3U_URL_KEY: 'tvplayer.autoM3uUrl.v1',
    AUTO_EPG_URL_KEY: 'tvplayer.autoEpgUrl.v1',
    GLOBAL_UA_KEY: 'tvplayer.globalUserAgent.v1',
    M3U_CONFIGS_KEY: 'tvplayer.m3uConfigs.v1',
    EPG_CONFIGS_KEY: 'tvplayer.epgConfigs.v1',
    UHD_HINT_PATTERN: /(4k|uhd|2160p)/i,
    // eslint-disable-next-line no-useless-escape
    HEVC_HINT_PATTERN: /(?:^|[\s_.\-|()\[\]])(hevc|h\.?265|x265)(?:$|[\s_.\-|()\[\]])/i,
    EPG_CACHE_TTL: 30 * 60 * 1000,
    SHAKA_RETRY: {
      maxAttempts: 4,
      baseDelay: 600,
      backoffFactor: 2,
      fuzzFactor: 0.4,
      timeout: 18000,
    },
    SHAKA_LOAD_TIMEOUT_MS: 25000,
    SHAKA_PROXY_LOAD_TIMEOUT_MS: 7000,
    SHAKA_DIRECT_FIRST_TIMEOUT_MS: 9000,
    PLAY_REQUEST_DEDUP_MS: 1200,
    PROXY_HEALTH_TIMEOUT_MS: 1800,
    PROXY_HEALTH_TTL_MS: 60000,
    DEMO_CHANNELS: [
      {
        name: 'Action Hollywood Movies (auto)',
        url: 'https://amg01076-amg01076c4-mytvsuper-apac-7830.playouts.now.amagi.tv/playlist/amg01076-lightning-actionhollywood-mytvsuperapac/playlist.m3u8',
      },
      {
        name: 'Demo HLS stream',
        url: 'http://example.com/live/stream',
        playerType: 'hls',
      },
      {
        name: 'Demo MPD stream',
        url: 'http://example.com/video/content',
        playerType: 'shaka',
      },
    ],
    UA_PRESETS: [
      { name: 'Default proxy', value: 'okhttp' },
      {
        name: 'Chrome Desktop',
        value:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      {
        name: 'Firefox Desktop',
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
      },
      {
        name: 'Safari iOS',
        value:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      },
      {
        name: 'Android Chrome',
        value:
          'Mozilla/5.0 (Linux; Android 13; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
      },
      { name: 'VLC', value: 'VLC/3.0.20 LibVLC/3.0.20' },
      { name: 'Kodi', value: 'Kodi/21.0 (Linux; Android 13) Android TV' },
      {
        name: 'Apple TV',
        value: 'AppleCoreMedia/1.0.0.20K71 (Apple TV; U; CPU OS 17_2 like Mac OS X; zh_cn)',
      },
      { name: 'Windows Media Player', value: 'NSPlayer/12.00.22621.3672 WMFSDK/12.00.22621.3672' },
      { name: 'IPTV Smarters', value: 'IPTV Smarters Pro/3.0.9' },
      { name: 'OKHttp', value: 'okhttp/4.12' },
    ],
  };

  globalObj.BirdTVConstants = Object.freeze(constants);
})(window);

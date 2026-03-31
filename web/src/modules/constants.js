/**
 * constants.js - 全局常量与配置
 */

const shared = window.BirdTVConstants || {};

export const STORAGE_KEY = shared.STORAGE_KEY || "tvplayer.channels.v1";
export const AUTO_M3U_URL_KEY = shared.AUTO_M3U_URL_KEY || "tvplayer.autoM3uUrl.v1";
export const AUTO_EPG_URL_KEY = shared.AUTO_EPG_URL_KEY || "tvplayer.autoEpgUrl.v1";
export const SIDEBAR_COLLAPSED_KEY = shared.SIDEBAR_COLLAPSED_KEY || "tvplayer.sidebarCollapsed.v1";
export const SIDEBAR_AUTO_COLLAPSE_WIDTH = shared.SIDEBAR_AUTO_COLLAPSE_WIDTH || 1180;
export const GLOBAL_UA_KEY = shared.GLOBAL_UA_KEY || "tvplayer.globalUserAgent.v1";
export const VLC_LINK_MODE_KEY = shared.VLC_LINK_MODE_KEY || "tvplayer.vlcLinkMode.v1";
export const M3U_CONFIGS_KEY = shared.M3U_CONFIGS_KEY || "tvplayer.m3uConfigs.v1";
export const EPG_CONFIGS_KEY = shared.EPG_CONFIGS_KEY || "tvplayer.epgConfigs.v1";

export const UHD_HINT_PATTERN = shared.UHD_HINT_PATTERN || /(4k|uhd|2160p)/i;
export const HEVC_HINT_PATTERN = shared.HEVC_HINT_PATTERN || /(?:^|[\s_.\-|()\[\]])(hevc|h\.?265|x265)(?:$|[\s_.\-|()\[\]])/i;

export const EPG_CACHE_TTL = shared.EPG_CACHE_TTL || 30 * 60 * 1000;

export const SHAKA_RETRY = shared.SHAKA_RETRY || {
    maxAttempts: 6,
    baseDelay: 900,
    backoffFactor: 2,
    fuzzFactor: 0.4,
    timeout: 26000
};

export const SHAKA_LOAD_TIMEOUT_MS = shared.SHAKA_LOAD_TIMEOUT_MS || 30000; // 从 60s 降到 30s
export const SHAKA_PROXY_LOAD_TIMEOUT_MS = shared.SHAKA_PROXY_LOAD_TIMEOUT_MS || 10000; // 从 12s 降到 10s
export const SHAKA_DIRECT_FIRST_TIMEOUT_MS = shared.SHAKA_DIRECT_FIRST_TIMEOUT_MS || 8000; // 从 12s 降到 8s，直连优先快速失败
export const PLAY_REQUEST_DEDUP_MS = shared.PLAY_REQUEST_DEDUP_MS || 1200;
export const VLC_LAUNCH_TIMEOUT_MS = shared.VLC_LAUNCH_TIMEOUT_MS || 9000;
export const PROXY_HEALTH_TIMEOUT_MS = shared.PROXY_HEALTH_TIMEOUT_MS || 4500;
export const PROXY_HEALTH_TTL_MS = shared.PROXY_HEALTH_TTL_MS || 60000;
export const FALLBACK_ENGINE_COOLDOWN_BASE_MS = shared.FALLBACK_ENGINE_COOLDOWN_BASE_MS || 8000;
export const FALLBACK_ENGINE_COOLDOWN_MAX_MS = shared.FALLBACK_ENGINE_COOLDOWN_MAX_MS || 120000;

export const DEFAULT_PROXY_UA = "okhttp";
export const DEMO_CHANNELS = shared.DEMO_CHANNELS || [];
export const UA_PRESETS = shared.UA_PRESETS || [{ name: "Default", value: DEFAULT_PROXY_UA }];

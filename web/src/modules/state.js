/**
 * state.js - 全局共享状态管理
 * 使用单一可变对象，所有模块通过 state.xxx 读写
 */

export const state = {
    // ─── 播放器实例 ───
    player: null,
    artPlayer: null,
    hlsPlayer: null,
    mpegtsPlayer: null,
    overlay: null,

    // ─── 播放状态 ───
    currentPlayerType: null,
    channels: [],
    currentIndex: -1,
    lastEngineDecision: null,

    // ─── 定时器 ───
    statsTimer: null,
    epgTimer: null,
    fallbackCooldownTimer: null,

    // ─── 播放并发控制 ───
    isLoadingSource: false,
    playRequestSeq: 0,
    lastPlayFingerprint: '',
    lastPlayAt: 0,
    globalAbortController: null,
    _pendingCleanupDetach: null,

    // ─── Shaka DRM ───
    shakaLicenseHeaders: {},
    shakaProxyRewriteContext: {
        enabled: false,
        upstreamOrigin: '',
        upstreamManifestUrl: '',
        userAgent: ''
    },

    // ─── 代理健康状态 ───
    proxyHealthState: {
        checkedAt: 0,
        healthy: null
    },

    // ─── 连接/代理模式 ───
    connectionMode: localStorage.getItem('tvplayer.connectionMode') || 'auto',
    tempProxyMode: localStorage.getItem('tvplayer.tempProxyMode') || 'auto',
    proxyMode: localStorage.getItem('tvplayer.proxyMode') || 'auto',

    // ─── 重定向缓存 ───
    redirectCache: new Map(),
    activeRedirectChecks: new Set(),

    // ─── EPG 状态 ───
    epgState: {
        url: "",
        loadedAt: 0,
        programsByChannelId: new Map(),
        nameToChannelId: new Map()
    },

    // ─── 诊断系统状态 ───
    diagnosticEvents: [],
    diagnosticSeq: 0,
    diagnosticLastStatusSig: "",
    diagnosticLastStatusAt: 0,
    diagnosticLastSuccessSig: "",
    diagnosticLastSuccessAt: 0,

    // ─── 回退冷却黑名单 ───
    fallbackEngineCooldown: new Map(),

    // ─── 后端源缓存 ───
    _backendM3uSources: null,
    _backendEpgSources: null
};

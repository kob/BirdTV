/**
 * mobile-player.js - 移动端播放器初始化与控制
 * 简化版本，专为 mobile.html 设计
 */

import { state } from './state.js';
import { initShakaPlayer } from './shaka-init.js';
import { playSource } from './live.js';

/**
 * 获取移动端播放器所需的 DOM 元素
 */
export function getMobileElements() {
    // 创建一个安全的元素包装器，防止 null 引用错误
    const createSafeElement = () => ({
        textContent: '',
        innerHTML: '',
        value: '',
        classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {},
            contains: () => false
        },
        style: {
            display: '',
            visibility: '',
            opacity: '',
            color: '',
            background: ''
        },
        setAttribute: () => {},
        removeAttribute: () => {},
        appendChild: () => {},
        remove: () => {},
        click: () => {}
    });

    const safeNull = createSafeElement();
    
    // 获取实际的 video 元素
    const videoElement = document.getElementById('mobilePlayer');
    
    return {
        video: videoElement,
        // 以下元素为了兼容 playSource 函数，提供最小化实现
        // 特殊处理：让 "video" 元素也指向 mobilePlayer
        nameInput: { value: '' },
        urlInput: { value: '' },
        kidInput: { value: '' },
        keyInput: { value: '' },
        widevineLicenseInput: { value: '' },
        playreadyLicenseInput: { value: '' },
        licenseHeadersInput: { value: '' },
        userAgentInput: { value: '' },
        streamTypeSelect: { value: 'auto' },
        playerTypeSelect: { value: 'auto' },
        vlcLinkModeSelect: { value: 'proxy' },
        stagePlayerTypeSelect: { value: 'auto' },
        playbackModeSelect: { value: 'auto' },
        connectionModeSelect: { value: 'auto' },
        tempProxyModeSelect: { value: 'auto' },
        proxyModeSelect: { value: 'auto' },
        m3uImportTypeSelect: { value: 'auto' },
        vlcPathInput: { value: '' },
        searchInput: { value: '' },
        jsonInput: { value: '' },
        m3uUrlInput: { value: '' },
        epgUrlInput: { value: '' },
        // 特殊处理：让 live.js 中的 document.getElementById("video") 能找到 mobilePlayer
        playlist: safeNull,
        channelCount: safeNull,
        currentTitle: safeNull,
        currentUrl: safeNull,
        currentDrm: safeNull,
        modeText: safeNull,
        connectionModeText: safeNull,
        vlcLinkModeText: safeNull,
        orchestrationText: safeNull,
        fallbackCooldownText: safeNull,
        resolutionText: safeNull,
        bitrateText: safeNull,
        framesText: safeNull,
        statusText: safeNull,
        statusBadge: safeNull,
        epgNow: safeNull,
        epgNowDesc: safeNull,
        epgNext: safeNull,
        epgMeta: safeNull,
        epgProgress: safeNull,
        epgProgressBar: safeNull,
        epgProgressText: safeNull,
        openEpgListButton: safeNull,
        epgModal: safeNull,
        epgModalTitle: safeNull,
        epgDateBar: safeNull,
        epgListContainer: safeNull,
        closeEpgModalButton: safeNull,
        playButton: safeNull,
        playVlcDirectButton: safeNull,
        playVlcProxyButton: safeNull,
        saveButton: safeNull,
        deleteButton: safeNull,
        importButton: safeNull,
        exportButton: safeNull,
        loadM3UButton: safeNull,
        loadM3UUrlButton: safeNull,
        loadEpgButton: safeNull,
        m3uFileInput: safeNull,
        loadExamplesButton: safeNull,
        globalUaSelect: safeNull,
        customUaInput: safeNull,
        addCustomUaButton: safeNull,
        logoutButton: safeNull,
        openAdminButton: safeNull,
        openAdminTopButton: safeNull,
        openMobileButton: safeNull,
        focusCurrentButton: safeNull,
        playerTypeDesc: safeNull,
        sidebarToggleButton: safeNull,
        openConfigCenterButton: safeNull,
        configCenterModal: safeNull,
        closeConfigCenterButton: safeNull,
        m3uSourceSelect: safeNull,
        epgSourceSelect: safeNull,
        m3uConfigList: safeNull,
        epgConfigList: null,
        m3uBackendList: safeNull,
        epgBackendList: safeNull,
        newM3uName: safeNull,
        newM3uUrl: safeNull,
        addM3uConfigButton: safeNull,
        newEpgName: safeNull,
        newEpgUrl: safeNull,
        addEpgConfigButton: safeNull,
        diagnosticsList: safeNull,
        diagnosticsCount: safeNull,
        clearDiagnosticsButton: safeNull,
        exportDiagnosticsButton: safeNull,
        clearFallbackCooldownButton: safeNull,
        shell: safeNull,
        sidebar: safeNull
    };
}

// 添加一个全局方法，让 live.js 能通过 document.getElementById("video") 找到 mobilePlayer
// 在模块加载时执行一次
if (typeof document !== 'undefined') {
    const originalGetElementById = document.getElementById.bind(document);
    document.getElementById = function(id) {
        if (id === 'video') {
            return document.getElementById('mobilePlayer') || originalGetElementById(id);
        }
        return originalGetElementById(id);
    };
}

/**
 * 初始化移动端播放器
 */
export async function initMobilePlayer() {
    const elements = getMobileElements();
    
    try {
        await initShakaPlayer(elements);
        console.log('移动端播放器初始化成功');
        return true;
    } catch (error) {
        console.error('移动端播放器初始化失败:', error);
        return false;
    }
}

/**
 * 播放频道
 * @param {Object} channel - 频道对象
 * @param {Function} onError - 错误回调
 */
export async function playMobileChannel(channel, onError) {
    const elements = getMobileElements();
    
    try {
        // 更新 UI
        const playerTitle = document.getElementById('playerTitle');
        if (playerTitle) {
            playerTitle.textContent = channel.name;
        }
        
        // 调试：输出频道信息
        console.log('[MobilePlayer] 播放频道:', channel.name);
        console.log('[MobilePlayer] 频道配置:', {
            playerType: channel.playerType,
            streamType: channel.streamType,
            sourceDefaultPlayerType: channel.sourceDefaultPlayerType,
            sourceProxyMode: channel.sourceProxyMode,
            url: channel.url?.substring(0, 100)
        });
        
        // 使用与 index.html 相同的播放策略
        await playSource(channel, elements);
        
        // 显示播放器容器
        const playerContainer = document.getElementById('playerContainer');
        if (playerContainer) {
            playerContainer.classList.add('active');
        }
        
    } catch (error) {
        console.error('播放失败:', error);
        if (onError) {
            onError(error);
        }
    }
}

/**
 * 关闭播放器 - 及时释放所有播放进程
 */
export async function closeMobilePlayer() {
    const playerContainer = document.getElementById('playerContainer');
    if (playerContainer) {
        playerContainer.classList.remove('active');
    }

    // 中断任何进行中的请求
    if (state.globalAbortController) {
        state.globalAbortController.abort();
        state.globalAbortController = null;
    }

    // 清理所有播放器实例（Shaka, HLS, MPEGTS, ArtPlayer）
    if (state.artPlayer) {
        try { state.artPlayer.destroy(true); } catch (e) { /* ignore */ }
        state.artPlayer = null;
    }
    if (state.hlsPlayer) {
        try { state.hlsPlayer.destroy(); } catch (e) { /* ignore */ }
        state.hlsPlayer = null;
    }
    if (state.mpegtsPlayer) {
        try { state.mpegtsPlayer.destroy(); } catch (e) { /* ignore */ }
        state.mpegtsPlayer = null;
    }

    // 清理 Shaka Player
    if (state.player) {
        try {
            await state.player.unload();
            await state.player.detach();
        } catch (error) {
            console.warn('Shaka 卸载失败:', error);
        }
    }

    // 清理 video 元素
    const videoEl = document.getElementById('mobilePlayer');
    if (videoEl) {
        videoEl.src = '';
        videoEl.load();
        videoEl.style.display = '';
    }

    // 隐藏 ArtPlayer 容器
    const artCon = document.getElementById('artplayer-container');
    if (artCon) artCon.style.display = 'none';

    // 重置状态
    state.currentIndex = -1;
    state.currentPlayerType = null;
    state.isLoadingSource = false;

    console.log('[MobilePlayer] 播放器已关闭，资源已释放');
}

/**
 * 更新收藏状态
 */
export function updateFavoriteIcon(isFavorite) {
    const icon = document.getElementById('playerFavoriteIcon');
    if (icon) {
        icon.textContent = isFavorite ? '★' : '☆';
    }
}

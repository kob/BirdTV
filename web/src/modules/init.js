/**
 * init.js - 页面初始化入口
 * 版本：2025-03-29 修复重复初始化问题
 */

import { state } from './state.js';
import {
    GLOBAL_UA_KEY, DEFAULT_PROXY_UA, AUTO_M3U_URL_KEY, AUTO_EPG_URL_KEY,
    DEMO_CHANNELS, M3U_CONFIGS_KEY, EPG_CONFIGS_KEY, UHD_HINT_PATTERN
} from './constants.js';
import { loadChannels, persistChannels } from './store.js';

// 用户手动选择的播放器类型（粘性），切频道时保持
let stickyPlayerType = 'auto';
import { parseLicenseHeadersInput } from './drm.js';
import {
    getElements
} from './dom.js';
import { initShakaPlayer } from './shaka-init.js';
import { playSource, updateStatus, updateCurrentInfo } from './live.js';
import { pushDiagnosticEvent, renderDiagnosticsPanel, exportDiagnostics } from './diagnostics.js';
import { startStatsLoop, startEpgLoop } from './stats.js';
import { updateFallbackCooldownText, clearAllFallbackCooldown } from './players/fallback.js';
import { loadEpgData, applyEpgUrlToChannels, openEpgModal, closeEpgModal } from './epg.js';
import {
    importFromM3UUrl, importFromM3UText, tryLoadLocalM3U,
    normalizeStreamType, getSelectedM3UImportType, normalizeM3UUrl, normalizeSource,
    parseM3UToSources
} from './m3u.js';
import {
    getConnectionMode, setConnectionMode,
    getTempProxyMode, setTempProxyMode,
    getProxyMode, setProxyMode, getEffectiveProxyMode
} from './proxy.js';
import {
    updatePlaybackModeLabel, getPlaybackMode,
    updateConnectionModeLabel, applyPlaybackProfile
} from './channels.js';
import {
    initGlobalUaSelect, bindGlobalUaSelect, handleLogout
} from './ua.js';
import { refreshAllConfigUI, addConfig, removeConfig } from './config.js';

async function init() {
    const elements = getElements();

    // 绑定事件（尽早绑定，确保按钮可用）
    bindEvents(elements);

    // 授权检查
    let authRequired = true;
    try {
        const healthResponse = await fetch('/health');
        if (healthResponse.ok) { const data = await healthResponse.json(); authRequired = data.authEnabled === true; }
    } catch {}

    if (authRequired) {
        const token = localStorage.getItem('authToken');
        if (!token) { 
            console.warn('认证检查：未找到 token，跳转到登录页');
            window.location.href = '/login.html'; 
            return; 
        }
        console.log('认证检查：找到 token，验证中...');
        try {
            const response = await fetch('/api/auth/userinfo', { 
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                } 
            });
            console.log('认证检查：响应状态', response.status);
            if (!response.ok) { 
                const errorData = await response.json().catch(() => ({}));
                console.error('认证检查：验证失败', errorData);
                localStorage.removeItem('authToken'); 
                window.location.href = '/login.html'; 
                return; 
            }
            const userData = await response.json();
            console.log('认证检查：验证成功', userData);
            localStorage.setItem('userInfo', JSON.stringify(userData.data || userData));
            
            try {
                const checkResponse = await fetch('/api/auth/check-default-password', { 
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    } 
                });
                if (checkResponse.ok) {
                    const checkData = await checkResponse.json();
                    if (checkData.ok && checkData.data?.isDefaultPassword) {
                        console.log('检测到使用默认密码，跳转到修改密码页面');
                        window.location.href = '/change-password.html';
                        return;
                    }
                }
            } catch (e) {
                console.warn('检查默认密码失败', e);
            }
        } catch (e) {
            console.error('认证检查：请求错误', e);
        }
    } else {
        console.log('认证检查：未启用认证');
        localStorage.removeItem('authToken');
        localStorage.removeItem('userInfo');
    }

    // 初始化播放器
    try { await initShakaPlayer(elements); } catch (error) { console.error('播放器初始化失败:', error); }

    // 加载频道
    state.channels = loadChannels();
    renderPlaylistSkeleton(elements, 7);

    // 检查是否有测试频道（从 admin 传递）
    const urlParams = new URLSearchParams(window.location.search);
    const isTest = urlParams.get('test') === 'true';
    const testChannelJson = localStorage.getItem('birdtv_test_channel');

    if (isTest && testChannelJson) {
        try {
            const testChannel = JSON.parse(testChannelJson);
            console.log('加载测试频道:', testChannel);
            state.channels = [testChannel];
            localStorage.removeItem('birdtv_test_channel');
            updateStatus(elements, `已加载测试频道: ${testChannel.name}`, '测试模式');
        } catch (e) {
            console.error('测试频道解析失败:', e);
        }
    }

    // 初始化选择器
    if (elements.connectionModeSelect) elements.connectionModeSelect.value = getConnectionMode();
    if (elements.tempProxyModeSelect) elements.tempProxyModeSelect.value = getTempProxyMode();
    if (elements.proxyModeSelect) elements.proxyModeSelect.value = getProxyMode();

    // 初始化全局 UA 下拉框（从后端加载，填充预设列表）
    try {
        await initGlobalUaSelect(elements);
        bindGlobalUaSelect(elements);
    } catch (e) {
        console.warn('UA 下拉框初始化失败:', e);
    }

    // 初始UI
    renderDiagnosticsPanel(elements);
    updateFallbackCooldownText(elements);
    pushDiagnosticEvent(elements, { type: "lifecycle", level: "info", message: "页面初始化完成", player: state.currentPlayerType || "none" });
    updatePlaybackModeLabel(elements);
    updateConnectionModeLabel(elements);
    startStatsLoop(elements);
    startEpgLoop(elements);
    refreshAllConfigUI(elements);

    // 后端源配置同步
    try {
        const token = localStorage.getItem("authToken") || "";
        const headers = token ? { "Authorization": "Bearer " + token } : {};

        let backendM3uUrl = "", backendEpgUrl = "", matchedM3uSource = null;

        // 并行请求：settings、m3u sources、epg sources
        try {
            const [settingsRes, m3uRes, epgRes] = await Promise.all([
                fetch("/api/settings", { headers }).catch((err) => { console.warn('[Init] settings请求失败:', err?.message || err); return { ok: false }; }),
                fetch("/api/sources/m3u", { headers }).catch((err) => { console.warn('[Init] m3u源请求失败:', err?.message || err); return { ok: false }; }),
                fetch("/api/sources/epg", { headers }).catch((err) => { console.warn('[Init] epg源请求失败:', err?.message || err); return { ok: false }; })
            ]);

            // 处理 settings
            if (settingsRes.ok) {
                const settingsResult = await settingsRes.json();
                if (settingsResult.ok && settingsResult.data) {
                    backendM3uUrl = (settingsResult.data.defaultM3uSource || "").trim();
                    backendEpgUrl = (settingsResult.data.defaultEpgSource || "").trim();
                }
            }

            // 处理 m3u sources
            if (m3uRes.ok) {
                const result = await m3uRes.json();
                const m3uSources = (result.ok && Array.isArray(result.data)) ? result.data : [];
                if (m3uSources.length > 0) {
                    if (!backendM3uUrl) backendM3uUrl = m3uSources.find(s => s.enabled !== false && s.url)?.url.trim() || "";
                    matchedM3uSource = m3uSources.find(s => s.url === backendM3uUrl) || m3uSources[0] || null;
                }
            }

            // 处理 epg sources
            if (epgRes.ok) {
                const result = await epgRes.json();
                if (result.ok && result.data?.length > 0 && !backendEpgUrl) {
                    backendEpgUrl = result.data.find(s => s.enabled !== false && s.url)?.url.trim() || "";
                }
            }
        } catch (e) {
            console.error("并行请求失败:", e);
        }

        // EPG 加载
        let autoEpgUrl = (localStorage.getItem(AUTO_EPG_URL_KEY) || "").trim();
        if (!autoEpgUrl && backendEpgUrl) { autoEpgUrl = backendEpgUrl; localStorage.setItem(AUTO_EPG_URL_KEY, autoEpgUrl); }
        const epgLoadPromise = autoEpgUrl
            ? (() => { elements.epgUrlInput.value = autoEpgUrl; return loadEpgData(elements, autoEpgUrl, false); })()
            : Promise.resolve();

        // M3U 加载
        let autoM3uUrl = (localStorage.getItem(AUTO_M3U_URL_KEY) || "").trim();
        if (!autoM3uUrl && backendM3uUrl) { autoM3uUrl = backendM3uUrl; localStorage.setItem(AUTO_M3U_URL_KEY, autoM3uUrl); }
        if (autoM3uUrl) {
            elements.m3uUrlInput.value = autoM3uUrl;

            // 并行加载 EPG 和 M3U
            await Promise.all([
                epgLoadPromise,
                importFromM3UUrl(autoM3uUrl, elements, {
                    showStatus: true, persistAutoUrl: false,
                    forcedStreamType: getSelectedM3UImportType(elements.m3uImportTypeSelect),
                    sourceInfo: matchedM3uSource ? { sourceId: matchedM3uSource.id, sourceDefaultPlayerType: matchedM3uSource.defaultPlayerType, sourceProxyMode: matchedM3uSource.proxyMode, sourceName: matchedM3uSource.name } : null
                })
            ]);
        }
    } catch (e) { console.warn("后端源同步失败:", e); }

    // 本地M3U回退
    try {
        if (state.channels.length > 0) {
            await selectChannel(elements, 0, false);
        } else {
            await tryLoadLocalM3U(elements, false);
        }
    } catch (e) { console.warn("本地M3U回退失败:", e); }

    // 忽略可恢复的 Promise 中断错误
    window.addEventListener("unhandledrejection", (event) => {
        if (event.reason && (event.reason.isCancelled || event.reason.name === 'AbortError')) {
            event.preventDefault();
        }
    });
}

// ─── UI 渲染辅助 ───

function renderPlaylistSkeleton(elements, rows = 6) {
    if (!elements.playlist) return;
    elements.playlist.innerHTML = '';
    for (let i = 0; i < rows; i++) {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.innerHTML = `<span class="ch-num">${i + 1}</span><div style="display:grid;gap:6px;min-width:0;flex:1;"><div class="playlist-skeleton long"></div><div class="playlist-skeleton short"></div></div>`;
        elements.playlist.appendChild(item);
    }
}

async function selectChannel(elements, index, autoplay) {
    if (index < 0 || index >= state.channels.length) return;
    state.currentIndex = index;
    const source = state.channels[index];
    if (elements.searchInput && document.activeElement === elements.searchInput) {
        elements.searchInput.blur();
    }
    fillForm(elements, source);
    renderPlaylist(elements);
    updateCurrentInfo(elements, source);
    if (elements.tempProxyModeSelect) elements.tempProxyModeSelect.value = getTempProxyMode();
    if (autoplay) {
        const playSourceArg = { ...source };
        // 如果频道没有手动设置播放器且粘性值存在，使用粘性播放器
        if ((!playSourceArg.playerType || playSourceArg.playerType === 'auto') && stickyPlayerType !== 'auto') {
            playSourceArg.playerType = stickyPlayerType;
        }
        await playSource(playSourceArg, elements);
    }
}

function readFormSource(elements) {
    const name = elements.nameInput ? elements.nameInput.value.trim() : "";
    const url = elements.urlInput ? elements.urlInput.value.trim() : "";
    const kid = elements.kidInput ? elements.kidInput.value.trim() : "";
    const key = elements.keyInput ? elements.keyInput.value.trim() : "";
    const widevineLicense = elements.widevineLicenseInput ? elements.widevineLicenseInput.value.trim() : "";
    const playreadyLicense = elements.playreadyLicenseInput ? elements.playreadyLicenseInput.value.trim() : "";
    const licenseHeaders = elements.licenseHeadersInput ? elements.licenseHeadersInput.value.trim() : "";
    const userAgent = elements.userAgentInput ? elements.userAgentInput.value.trim() : "";
    const streamType = elements.streamTypeSelect ? normalizeStreamType(elements.streamTypeSelect.value, true) : 'auto';
    const playerType = elements.stagePlayerTypeSelect ? elements.stagePlayerTypeSelect.value : 'auto';

    if (!name || !url) {
        updateStatus(elements, "频道名称和播放地址不能为空", "参数缺失", true);
        return null;
    }

    const source = { name, url };
    if (kid || key) {
        if (!kid || !key) {
            updateStatus(elements, "KID 和 KEY 需要同时填写", "DRM 参数不完整", true);
            return null;
        }
        source.drm = source.drm || {};
        source.drm.clearKeys = { [kid]: key };
    }

    if (widevineLicense || playreadyLicense) {
        source.drm = source.drm || {};
        source.drm.licenseServers = {};
        if (widevineLicense) source.drm.licenseServers.widevine = widevineLicense;
        if (playreadyLicense) source.drm.licenseServers.playready = playreadyLicense;
    }

    const rawHeaders = elements.licenseHeadersInput ? elements.licenseHeadersInput.value.trim() : "";
    if (rawHeaders) {
        try {
            const parsedHeaders = parseLicenseHeadersInput(rawHeaders);
            if (Object.keys(parsedHeaders).length > 0) {
                source.drm = source.drm || {};
                source.drm.licenseHeaders = parsedHeaders;
            }
        } catch (error) {
            updateStatus(elements, `License 请求头格式错误：${error.message}`, "参数错误", true);
            return null;
        }
    }

    if (userAgent) source.userAgent = userAgent;
    if (['mpd', 'ts', 'hls', 'unknown'].includes(streamType)) source.streamType = streamType;
    if (playerType && playerType !== 'auto') source.playerType = playerType;
    if (playerType === 'vlc-direct' || playerType === 'vlc-proxy' || playerType === 'vlc') {
        source.playerType = 'auto';
    }
    return source;
}

function fillForm(elements, source) {
    if (!source) return;
    if (elements.nameInput) elements.nameInput.value = source.name || "";
    if (elements.urlInput) elements.urlInput.value = source.url || "";
    if (elements.userAgentInput) elements.userAgentInput.value = source.userAgent || "";
    if (elements.streamTypeSelect) {
        const st = normalizeStreamType(source.streamType, true);
        elements.streamTypeSelect.value = ['mpd', 'ts', 'hls', 'unknown'].includes(st) ? st : 'auto';
    }
    let safePlayerType = source.playerType || 'auto';
    // 如果频道没有手动设置播放器，使用用户上次手动选择的（粘性）
    if ((!source.playerType || source.playerType === 'auto') && stickyPlayerType !== 'auto') {
        safePlayerType = stickyPlayerType;
    }
    if (['art', 'hlsjs'].includes(safePlayerType)) safePlayerType = 'hls';
    if (safePlayerType === 'vlc' || safePlayerType === 'vlc-direct' || safePlayerType === 'vlc-proxy') {
        safePlayerType = 'auto';
    }
    if (elements.stagePlayerTypeSelect) elements.stagePlayerTypeSelect.value = safePlayerType || 'auto';

    const clearKeys = source.drm && source.drm.clearKeys ? Object.entries(source.drm.clearKeys)[0] : null;
    if (elements.kidInput) elements.kidInput.value = clearKeys ? clearKeys[0] : "";
    if (elements.keyInput) elements.keyInput.value = clearKeys ? clearKeys[1] : "";
    if (elements.widevineLicenseInput) elements.widevineLicenseInput.value = (source.drm && source.drm.licenseServers) ? (source.drm.licenseServers.widevine || "") : "";
    if (elements.playreadyLicenseInput) elements.playreadyLicenseInput.value = (source.drm && source.drm.licenseServers) ? (source.drm.licenseServers.playready || "") : "";
    const licenseHeaders = source.drm && source.drm.licenseHeaders ? source.drm.licenseHeaders : null;
    if (elements.licenseHeadersInput) elements.licenseHeadersInput.value = licenseHeaders ? JSON.stringify(licenseHeaders, null, 2) : "";
}

function clearForm(elements) {
    if (elements.nameInput) elements.nameInput.value = "";
    if (elements.urlInput) elements.urlInput.value = "";
    if (elements.kidInput) elements.kidInput.value = "";
    if (elements.keyInput) elements.keyInput.value = "";
    if (elements.widevineLicenseInput) elements.widevineLicenseInput.value = "";
    if (elements.playreadyLicenseInput) elements.playreadyLicenseInput.value = "";
    if (elements.licenseHeadersInput) elements.licenseHeadersInput.value = "";
    if (elements.userAgentInput) elements.userAgentInput.value = "";
    if (elements.streamTypeSelect) elements.streamTypeSelect.value = "auto";
    if (elements.stagePlayerTypeSelect) elements.stagePlayerTypeSelect.value = "auto";
}

function renderPlaylist(elements) {
    const keyword = (elements.searchInput?.value || '').trim().toLowerCase();
    const filtered = state.channels.map((source, index) => ({ source, index })).filter(({ source }) => source.name.toLowerCase().includes(keyword));
    if (elements.playlist) elements.playlist.innerHTML = "";
    if (elements.channelCount) elements.channelCount.textContent = keyword ? `${filtered.length} / ${state.channels.length} 个` : `${state.channels.length} 个`;
    filtered.forEach(({ source, index }) => {
        const item = document.createElement("div");
        item.className = `playlist-item${index === state.currentIndex ? " active" : ""}`;
        item.innerHTML = `<span class="ch-num">${index + 1}</span><strong>${source.name}</strong>`;
        item.addEventListener("click", async () => { await selectChannel(elements, index, true); });
        elements.playlist.appendChild(item);
    });
}

// ─── 事件绑定 ───

function bindEvents(elements) {
    // 播放
    elements.playButton?.addEventListener("click", async () => {
        const source = readFormSource(elements);
        if (source) await playSource(source, elements);
    });

    elements.playVlcDirectButton?.addEventListener("click", () => playWithForcedVlcMode(elements, 'direct'));
    elements.playVlcProxyButton?.addEventListener("click", () => playWithForcedVlcMode(elements, 'proxy'));

    // 搜索
    elements.searchInput?.addEventListener("input", () => renderPlaylist(elements));

    // 频道 CRUD
    elements.saveButton?.addEventListener("click", () => {
        const source = readFormSource(elements);
        if (!source) return;
        const existingIndex = state.channels.findIndex((item) => item.name === source.name);
        if (existingIndex >= 0) {
            const existing = state.channels[existingIndex] || {};
            source.tvgId = source.tvgId || existing.tvgId || "";
            source.tvgName = source.tvgName || existing.tvgName || "";
            source.epg = source.epg || existing.epg || "";
            state.channels[existingIndex] = source;
            state.currentIndex = existingIndex;
        } else {
            const current = state.currentIndex >= 0 ? state.channels[state.currentIndex] : null;
            if (current) {
                source.tvgId = source.tvgId || current.tvgId || "";
                source.tvgName = source.tvgName || current.tvgName || "";
                source.epg = source.epg || current.epg || "";
            }
            state.channels.push(source);
            state.currentIndex = state.channels.length - 1;
        }
        persistChannels(state.channels);
        renderPlaylist(elements);
        updateStatus(elements, "频道已保存", "已保存");
    });

    elements.deleteButton?.addEventListener("click", () => {
        if (state.currentIndex < 0 || state.currentIndex >= state.channels.length) {
            updateStatus(elements, "当前没有可删除的频道", "未删除", true);
            return;
        }
        state.channels.splice(state.currentIndex, 1);
        state.currentIndex = -1;
        persistChannels(state.channels);
        renderPlaylist(elements);
        clearForm(elements);
        updateCurrentInfo(elements, null);
        updateStatus(elements, "频道已删除", "已删除");
    });

    elements.importButton?.addEventListener("click", () => {
        try {
            const parsed = JSON.parse(elements.jsonInput.value.trim());
            if (!Array.isArray(parsed)) throw new Error("JSON 顶层必须是数组");
            state.channels = parsed.map(normalizeSource).filter(Boolean);
            state.currentIndex = -1;
            persistChannels(state.channels);
            renderPlaylist(elements);
            updateStatus(elements, `已导入 ${state.channels.length} 个频道`, "导入成功");
        } catch (error) {
            updateStatus(elements, error.message || "JSON 导入失败", "导入失败", true);
        }
    });

    elements.exportButton?.addEventListener("click", () => {
        elements.jsonInput.value = JSON.stringify(state.channels, null, 2);
        updateStatus(elements, "已导出到下方文本框", "已导出");
    });

    elements.loadExamplesButton?.addEventListener("click", () => {
        state.channels = DEMO_CHANNELS.map((item) => normalizeSource(item));
        state.currentIndex = -1;
        persistChannels(state.channels);
        renderPlaylist(elements);
        elements.jsonInput.value = JSON.stringify(state.channels, null, 2);
        updateStatus(elements, "已加载示例频道", "示例已载入");
    });

    // M3U 导入
    let m3uFileInputHandler = null;
    if (elements.loadM3UButton) {
        elements.loadM3UButton.addEventListener("click", (e) => {
            e?.stopImmediatePropagation?.();
            e?.stopPropagation?.();
            if (elements.m3uFileInput) {
                elements.m3uFileInput.value = "";
                if (m3uFileInputHandler) {
                    elements.m3uFileInput.removeEventListener("change", m3uFileInputHandler);
                }
                m3uFileInputHandler = async (event) => {
                    const file = event.target.files && event.target.files[0];
                    if (!file) return;
                    try {
                        const text = await file.text();
                        importFromM3UText(text, elements, {
                            showStatus: true,
                            sourceLabel: file.name,
                            baseUrl: window.location.href,
                            forcedStreamType: getSelectedM3UImportType(elements.m3uImportTypeSelect)
                        });
                    } catch (error) {
                        updateStatus(elements, error.message || "上传 m3u 失败", "导入失败", true);
                    } finally {
                        elements.m3uFileInput.value = "";
                        elements.m3uFileInput.removeEventListener("change", m3uFileInputHandler);
                        m3uFileInputHandler = null;
                    }
                };
                elements.m3uFileInput.addEventListener("change", m3uFileInputHandler);
                elements.m3uFileInput.click();
            }
        }, { capture: true });
    }

    elements.loadM3UUrlButton?.addEventListener("click", async () => {
        const rawM3uUrl = elements.m3uUrlInput.value.trim();
        if (!rawM3uUrl) {
            updateStatus(elements, "请先填写 m3u 链接地址", "参数缺失", true);
            return;
        }
        const m3uUrl = normalizeM3UUrl(rawM3uUrl);
        elements.m3uUrlInput.value = m3uUrl;
        await importFromM3UUrl(m3uUrl, elements, {
            showStatus: true,
            persistAutoUrl: true,
            sourceLabel: "链接",
            forcedStreamType: getSelectedM3UImportType(elements.m3uImportTypeSelect)
        });
    });

    // EPG
    elements.loadEpgButton?.addEventListener("click", async () => {
        const raw = elements.epgUrlInput.value.trim();
        if (!raw) {
            updateStatus(elements, "请先填写 EPG 链接地址", "参数缺失", true);
            return;
        }
        const epgUrl = normalizeM3UUrl(raw);
        elements.epgUrlInput.value = epgUrl;
        const ok = await loadEpgData(elements, epgUrl, true);
        if (ok) {
            localStorage.setItem(AUTO_EPG_URL_KEY, epgUrl);
            applyEpgUrlToChannels(epgUrl);
            updateStatus(elements, "EPG 已加载", "EPG 就绪");
        }
    });

    // 节目源下拉选择 - 同步URL到输入框
    elements.m3uSourceSelect?.addEventListener("change", function () {
        if (this.value) {
            elements.m3uUrlInput.value = this.value;
        }
    });

    // EPG源下拉选择 - 同步URL到输入框
    elements.epgSourceSelect?.addEventListener("change", function () {
        if (this.value) {
            elements.epgUrlInput.value = this.value;
        }
    });

    elements.openEpgListButton?.addEventListener("click", () => {
        openEpgModal(elements, state.channels[state.currentIndex] || null);
    });

    elements.closeEpgModalButton?.addEventListener("click", () => closeEpgModal(elements));
    elements.epgModal?.addEventListener("click", (e) => { if (e.target === elements.epgModal) closeEpgModal(elements); });

    // 连接/代理模式
    elements.connectionModeSelect?.addEventListener("change", () => {
        setConnectionMode(elements.connectionModeSelect.value);
        updateConnectionModeLabel(elements);
        if (state.currentIndex >= 0) selectChannel(elements, state.currentIndex, true);
    });

    elements.tempProxyModeSelect?.addEventListener("change", () => {
        setTempProxyMode(elements.tempProxyModeSelect.value);
        if (state.currentIndex >= 0) selectChannel(elements, state.currentIndex, true);
    });

    elements.proxyModeSelect?.addEventListener("change", () => {
        setProxyMode(elements.proxyModeSelect.value);
        if (state.currentIndex >= 0) selectChannel(elements, state.currentIndex, true);
    });

    // 播放模式
    elements.playbackModeSelect?.addEventListener("change", () => {
        updatePlaybackModeLabel(elements);
        const sourceHint = { name: elements.nameInput.value.trim(), url: elements.urlInput.value.trim() };
        const isLikelyUhd = UHD_HINT_PATTERN.test(`${sourceHint.name} ${sourceHint.url}`);
        const mode = getPlaybackMode();
        if (state.player) applyPlaybackProfile(elements, { isLikelyUhd, preferFallback: mode === "stable" });
    });

    // 播放器类型
    if (elements.stagePlayerTypeSelect) {
        elements.stagePlayerTypeSelect.value = 'auto';

        elements.stagePlayerTypeSelect.addEventListener('change', async () => {
            const selected = elements.stagePlayerTypeSelect.value || 'auto';
            console.log('[PlayerTypeChange] 用户选择播放器:', selected);
            
            // 更新粘性播放器类型
            stickyPlayerType = selected;
            
            if (state.currentIndex >= 0 && state.currentIndex < state.channels.length) {
                const channel = state.channels[state.currentIndex];
                if (selected === 'auto') delete channel.playerType;
                else channel.playerType = selected;
                persistChannels(state.channels);
                renderPlaylist(elements);
                
                console.log('[PlayerTypeChange] 更新频道播放器类型:', channel.name, '->', channel.playerType || 'auto');
                await playSource(channel, elements);
            } else {
                const source = readFormSource(elements);
                if (!source) { updateStatus(elements, '已切换播放器类型，请填写频道并点击播放', '已切换'); return; }
                if (selected !== 'auto') source.playerType = selected;
                await playSource(source, elements);
            }
        });
    }

    // 退出登录
    elements.logoutButton?.addEventListener("click", handleLogout);
    elements.openAdminButton?.addEventListener("click", () => { window.location.href = '/admin.html'; });
    elements.openAdminTopButton?.addEventListener("click", () => { window.location.href = '/admin.html'; });
    elements.openMobileButton?.addEventListener("click", () => { window.location.href = '/mobile.html'; });

    // 切换到移动版
    elements.switchToMobileButton?.addEventListener("click", () => {
        document.cookie = 'birdtv_device=mobile; path=/; max-age=31536000';
        window.location.href = '/mobile.html';
    });

    // 定位当前频道
    elements.focusCurrentButton?.addEventListener("click", () => {
        const current = elements.playlist ? elements.playlist.querySelector('.playlist-item.active') : null;
        if (current && typeof current.scrollIntoView === 'function') {
            current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            current.classList.add('pulse-focus');
            setTimeout(() => current.classList.remove('pulse-focus'), 520);
        }
    });

    // 诊断
    elements.clearDiagnosticsButton?.addEventListener("click", () => {
        state.diagnosticEvents = [];
        state.diagnosticSeq = 0;
        renderDiagnosticsPanel(elements);
        updateStatus(elements, "诊断记录已清空", "已清空");
    });

    elements.exportDiagnosticsButton?.addEventListener("click", () => exportDiagnostics(elements));

    // 回退冷却
    elements.clearFallbackCooldownButton?.addEventListener("click", () => {
        clearAllFallbackCooldown('button_click');
        updateStatus(elements, "回退冷却已清空", "已清空");
    });

    // 配置中心
    elements.openConfigCenterButton?.addEventListener("click", () => {
        refreshAllConfigUI(elements);
        elements.configCenterModal.classList.add("open");
        elements.configCenterModal.setAttribute("aria-hidden", "false");
    });

    elements.closeConfigCenterButton?.addEventListener("click", () => {
        elements.configCenterModal.classList.remove("open");
        elements.configCenterModal.setAttribute("aria-hidden", "true");
    });

    elements.configCenterModal?.addEventListener("click", (e) => {
        if (e.target === elements.configCenterModal) {
            elements.configCenterModal.classList.remove("open");
            elements.configCenterModal.setAttribute("aria-hidden", "true");
        }
    });

    // 配置中心 - M3U 配置
    elements.addM3uConfigButton?.addEventListener("click", () => addConfig(elements, 'm3u'));
    elements.addEpgConfigButton?.addEventListener("click", () => addConfig(elements, 'epg'));

    // 侧边栏切换
    elements.sidebarToggleButton?.addEventListener("click", () => {
        import('./dom.js').then(({ toggleSidebarCollapsedState }) => {
            toggleSidebarCollapsedState(elements);
        });
    });

    console.log('[init] 事件绑定完成');
}

function playWithForcedVlcMode(elements, mode) {
    const source = readFormSource(elements);
    if (!source) return;
    setTempProxyMode(mode);
    if (elements.tempProxyModeSelect) elements.tempProxyModeSelect.value = mode;
    playSource(source, elements);
}

init();

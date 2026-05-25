/**
 * dom.js - DOM 元素引用与侧边栏管理
 */

import { SIDEBAR_COLLAPSED_KEY, SIDEBAR_AUTO_COLLAPSE_WIDTH } from './constants.js';

export function getElements() {
    return {
        shell: document.querySelector(".shell"),
        sidebar: document.querySelector(".sidebar"),
        nameInput: document.getElementById("nameInput"),
        urlInput: document.getElementById("urlInput"),
        kidInput: document.getElementById("kidInput"),
        keyInput: document.getElementById("keyInput"),
        widevineLicenseInput: document.getElementById("widevineLicenseInput"),
        playreadyLicenseInput: document.getElementById("playreadyLicenseInput"),
        licenseHeadersInput: document.getElementById("licenseHeadersInput"),
        playbackModeSelect: document.getElementById("playbackModeSelect"),
        connectionModeSelect: document.getElementById("connectionModeSelect"),
        userAgentInput: document.getElementById("userAgentInput"),
        tempProxyModeSelect: document.getElementById("tempProxyModeSelect"),
        proxyModeSelect: document.getElementById("proxyModeSelect"),
        streamTypeSelect: document.getElementById("streamTypeSelect"),
        m3uImportTypeSelect: document.getElementById("m3uImportTypeSelect"),
        stagePlayerTypeSelect: document.getElementById("stagePlayerTypeSelect"),
        searchInput: document.getElementById("searchInput"),
        jsonInput: document.getElementById("jsonInput"),
        m3uUrlInput: document.getElementById("m3uUrlInput"),
        epgUrlInput: document.getElementById("epgUrlInput"),
        playlist: document.getElementById("playlist"),
        channelCount: document.getElementById("channelCount"),
        currentTitle: document.getElementById("currentTitle"),
        currentUrl: document.getElementById("currentUrl"),
        currentDrm: document.getElementById("currentDrm"),
        modeText: document.getElementById("modeText"),
        connectionModeText: document.getElementById("connectionModeText"),
        orchestrationText: document.getElementById("orchestrationText"),
        fallbackCooldownText: document.getElementById("fallbackCooldownText"),
        resolutionText: document.getElementById("resolutionText"),
        bitrateText: document.getElementById("bitrateText"),
        framesText: document.getElementById("framesText"),
        statusText: document.getElementById("statusText"),
        statusBadge: document.getElementById("statusBadge"),
        epgNow: document.getElementById("epgNow"),
        epgNowDesc: document.getElementById("epgNowDesc"),
        epgNext: document.getElementById("epgNext"),
        epgMeta: document.getElementById("epgMeta"),
        epgProgress: document.getElementById("epgProgress"),
        epgProgressBar: document.getElementById("epgProgressBar"),
        epgProgressText: document.getElementById("epgProgressText"),
        openEpgListButton: document.getElementById("openEpgListButton"),
        epgModal: document.getElementById("epgModal"),
        epgModalTitle: document.getElementById("epgModalTitle"),
        epgDateBar: document.getElementById("epgDateBar"),
        epgListContainer: document.getElementById("epgListContainer"),
        closeEpgModalButton: document.getElementById("closeEpgModalButton"),
        playButton: document.getElementById("playButton"),
        playVlcDirectButton: document.getElementById("playVlcDirectButton"),
        playVlcProxyButton: document.getElementById("playVlcProxyButton"),
        saveButton: document.getElementById("saveButton"),
        deleteButton: document.getElementById("deleteButton"),
        importButton: document.getElementById("importButton"),
        exportButton: document.getElementById("exportButton"),
        loadM3UButton: document.getElementById("loadM3UButton"),
        loadM3UUrlButton: document.getElementById("loadM3UUrlButton"),
        loadEpgButton: document.getElementById("loadEpgButton"),
        m3uFileInput: document.getElementById("m3uFileInput"),
        loadExamplesButton: document.getElementById("loadExamplesButton"),
        video: document.getElementById("video"),
        globalUaSelect: document.getElementById("globalUaSelect"),
        customUaInput: document.getElementById("customUaInput"),
        addCustomUaButton: document.getElementById("addCustomUaButton"),
        logoutButton: document.getElementById("logoutButton"),
        openAdminButton: document.getElementById("openAdminButton"),
        openAdminTopButton: document.getElementById("openAdminTopButton"),
        openMobileButton: document.getElementById("openMobileButton"),
        switchToMobileButton: document.getElementById("switchToMobileButton"),
        focusCurrentButton: document.getElementById("focusCurrentButton"),
        playerTypeDesc: document.getElementById("playerTypeDesc"),
        sidebarToggleButton: document.getElementById("sidebarToggleButton"),
        openConfigCenterButton: document.getElementById("openConfigCenterButton"),
        configCenterModal: document.getElementById("configCenterModal"),
        closeConfigCenterButton: document.getElementById("closeConfigCenterButton"),
        m3uSourceSelect: document.getElementById("m3uSourceSelect"),
        epgSourceSelect: document.getElementById("epgSourceSelect"),
        m3uConfigList: document.getElementById("m3uConfigList"),
        epgConfigList: document.getElementById("epgConfigList"),
        m3uBackendList: document.getElementById("m3uBackendList"),
        epgBackendList: document.getElementById("epgBackendList"),
        newM3uName: document.getElementById("newM3uName"),
        newM3uUrl: document.getElementById("newM3uUrl"),
        addM3uConfigButton: document.getElementById("addM3uConfigButton"),
        newEpgName: document.getElementById("newEpgName"),
        newEpgUrl: document.getElementById("newEpgUrl"),
        addEpgConfigButton: document.getElementById("addEpgConfigButton"),
        diagnosticsList: document.getElementById("diagnosticsList"),
        diagnosticsCount: document.getElementById("diagnosticsCount"),
        exportDiagnosticsButton: document.getElementById("exportDiagnosticsButton"),
        clearFallbackCooldownButton: document.getElementById("clearFallbackCooldownButton"),
        clearDiagnosticsButton: document.getElementById("clearDiagnosticsButton"),
        // 播放测试区域
        testPlayButton: document.getElementById("testPlayButton"),
        testNameInput: document.getElementById("testNameInput"),
        testUrlInput: document.getElementById("testUrlInput"),
        testKidInput: document.getElementById("testKidInput"),
        testKeyInput: document.getElementById("testKeyInput"),
        testStreamTypeSelect: document.getElementById("testStreamTypeSelect"),
        testImportTextarea: document.getElementById("testImportTextarea"),
        testImportButton: document.getElementById("testImportButton"),
        testClearButton: document.getElementById("testClearButton")
    };
}

export function updateSidebarToggleAnchorPosition(elements) {
    if (!elements.sidebarToggleButton || !elements.shell || !elements.playlist) return;
    if (document.body.classList.contains("sidebar-collapsed")) return;
    const playlistCard = elements.playlist.closest(".card");
    if (!playlistCard || playlistCard.width <= 0) return;
    const shellRect = elements.shell.getBoundingClientRect();
    const cardRect = playlistCard.getBoundingClientRect();
    const top = (cardRect.top - shellRect.top) + 8;
    const left = (cardRect.right - shellRect.left) + 8;
    elements.shell.style.setProperty("--sidebar-toggle-top", `${Math.round(top)}px`);
    elements.shell.style.setProperty("--sidebar-toggle-left", `${Math.round(left)}px`);
}

export function refreshSidebarCollapsedState(elements) {
    const manualCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    const autoCollapsed = window.innerWidth <= SIDEBAR_AUTO_COLLAPSE_WIDTH;
    const mobileExpanded = localStorage.getItem("sidebar_mobile_expanded") === "1";
    const activeEl = document.activeElement;
    const sidebarEl = elements?.sidebar || document.querySelector('.sidebar');
    const isSidebarInputFocused = !!(
        autoCollapsed &&
        sidebarEl &&
        activeEl &&
        sidebarEl.contains(activeEl) &&
        (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.isContentEditable
        )
    );

    const shouldCollapse = autoCollapsed ? !(mobileExpanded || isSidebarInputFocused) : manualCollapsed;

    if (autoCollapsed && !shouldCollapse) {
        localStorage.setItem("sidebar_mobile_expanded", "1");
    }
    document.body.classList.toggle("sidebar-collapsed", !!shouldCollapse);
    document.body.classList.toggle("sidebar-auto-collapsed", !!autoCollapsed);
    if (elements.sidebarToggleButton) {
        elements.sidebarToggleButton.setAttribute("aria-expanded", shouldCollapse ? "false" : "true");
        elements.sidebarToggleButton.classList.toggle("is-collapsed", !!shouldCollapse);
    }
    updateSidebarToggleAnchorPosition(elements);
}

export function toggleSidebarCollapsedState(elements) {
    const autoCollapsed = window.innerWidth <= SIDEBAR_AUTO_COLLAPSE_WIDTH;
    if (autoCollapsed) {
        const current = document.body.classList.contains("sidebar-collapsed");
        const nextCollapsed = !current;
        applySidebarCollapsedState(elements, nextCollapsed);
        if (nextCollapsed) localStorage.removeItem("sidebar_mobile_expanded");
        else localStorage.setItem("sidebar_mobile_expanded", "1");
    } else {
        const next = !loadSidebarCollapsedState();
        applySidebarCollapsedState(elements, next);
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
        localStorage.removeItem("sidebar_mobile_expanded");
    }
    updateSidebarToggleAnchorPosition(elements);
}

let _sidebarAnchorRaf = null;
export function queueSidebarToggleAnchorPositionUpdate() {
    if (_sidebarAnchorRaf) return;
    _sidebarAnchorRaf = requestAnimationFrame(() => {
        _sidebarAnchorRaf = null;
        updateSidebarToggleAnchorPosition({ shell: document.querySelector(".shell"), sidebarToggleButton: document.getElementById("sidebarToggleButton"), playlist: document.getElementById("playlist") });
    });
}

function loadSidebarCollapsedState() {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

function applySidebarCollapsedState(elements, collapsed) {
    document.body.classList.toggle("sidebar-collapsed", !!collapsed);
    if (elements.sidebarToggleButton) {
        elements.sidebarToggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
        elements.sidebarToggleButton.classList.toggle("is-collapsed", !!collapsed);
    }
}

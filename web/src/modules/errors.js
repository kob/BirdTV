/**
 * errors.js - 播放错误格式化
 */

export function formatPlaybackError(error) {
    if (!error) return "视频加载失败";
    const maybeCode = typeof error.code === "number" ? ` [code=${error.code}]` : "";
    const hint = explainPlaybackError(error);
    if (error.message) {
        return hint ? `${error.message}${maybeCode}；${hint}` : `${error.message}${maybeCode}`;
    }
    return hint ? `视频加载失败${maybeCode}；${hint}` : `视频加载失败${maybeCode}`;
}

export function explainPlaybackError(error) {
    const code = typeof error.code === "number" ? error.code : null;
    const rawMessage = String(error.message || "").toLowerCase();

    const codeHints = {
        1001: "网络请求超时，建议检查代理和链路延迟。",
        1002: "请求被中断，可能是源站不稳定或连接被重置。",
        6001: "DRM 密钥系统不可用。请确保页面使用 HTTPS 访问（安全上下文），且浏览器支持对应的加密方案。",
        6601: "检测到 CENC MPD 但未配置 DRM 参数，请填写 Widevine/PlayReady 许可证 URL 或 KID/KEY。",
        6602: "检测到 cenc_m MPD。此类流通常必须使用 Widevine/PlayReady 许可证 URL，KID/KEY 往往不足以播放。",
        6007: "许可证/密钥解析失败，请核对 KID 与 KEY。",
        6012: "DRM 许可证请求失败或授权被拒绝。该流是 CENC（Widevine/PlayReady）加密，不能仅靠 KID/KEY 直接播放。"
    };

    if (rawMessage.includes("hls") || rawMessage.includes("m3u8") || rawMessage.includes("artplayer") || rawMessage.includes("art player")) {
        if (rawMessage.includes("not supported") || rawMessage.includes("unsupported")) {
            return "浏览器不支持HLS播放或ArtPlayer未加载，请使用Chrome、Firefox、Edge等现代浏览器。";
        }
        if (rawMessage.includes("manifest") || rawMessage.includes("playlist")) {
            return "HLS播放列表解析失败，请检查.m3u8文件格式是否正确。";
        }
        if (rawMessage.includes("network")) {
            return "HLS网络错误，可能是.m3u8文件或分片无法访问。";
        }
        if (rawMessage.includes("media") || rawMessage.includes("decod")) {
            return "HLS媒体解码错误，可能是视频编码格式不被支持。";
        }
        return "ArtPlayer播放错误，请检查.m3u8地址和网络连接。";
    }

    if (code !== null && codeHints[code]) return codeHints[code];

    if (code !== null) {
        if (code >= 6000 && code < 7000) return "DRM 阶段失败，通常是密钥不匹配或浏览器 DRM 能力受限。";
        if (code >= 3000 && code < 4000) return "MPD 清单或轨道信息异常，可能是源流格式不完整。";
        if (code >= 1000 && code < 2000) return "网络请求失败，可能是签名参数过期、代理不可达或源站限流。";
    }

    if (rawMessage.includes("403") || rawMessage.includes("forbidden")) return "源地址鉴权失败，常见于签名参数过期。";
    if (rawMessage.includes("manifest") || rawMessage.includes("mpd")) return "MPD 解析失败，请检查返回内容是否为有效 XML。";
    if (rawMessage.includes("key") || rawMessage.includes("drm") || rawMessage.includes("license")) return "DRM 密钥阶段失败，请确认 KID/KEY 与频道对应。";

    return "可尝试切到\"稳定模式\"，或更新带时效参数的播放地址。";
}

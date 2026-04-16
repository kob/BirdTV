(function attachBirdTVRuntime(globalObj) {
  const runtime = {
    proxyBaseUrlKey: 'tvplayer.proxyBaseUrl',
    defaultProxyBaseUrl: window.location.origin + '/m3u-proxy',
  };

  globalObj.BirdTVRuntime = Object.freeze(runtime);
})(window);

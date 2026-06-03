(function registerKakeiboUpdateHistoryFeature(global) {
  function renderUpdateHistory(ctx) {
    const { els, config, state, escapeHtml, buildLoadMoreButtonHtml, COLLAPSED_LOAD_MORE_STEP } = ctx;
    if (!els.updateHistoryList) return;
    const history = Array.isArray(config.app?.updateHistory) ? config.app.updateHistory : [];
    if (!history.length) {
      els.updateHistoryList.innerHTML = '<p class="muted small">まだ表示できる更新履歴はありません。</p>';
      return;
    }
    const visibleItems = history.slice(0, state.updateHistoryVisibleCount);
    els.updateHistoryList.innerHTML = visibleItems.map((item) => `
      <article class="update-history-item">
        <div class="update-history-meta">
          <span class="update-history-version">Ver${escapeHtml(item.version || "")}</span>
          <span class="update-history-date">${escapeHtml(item.date || "")}</span>
        </div>
        <p class="update-history-summary">${escapeHtml(item.summary || "")}</p>
      </article>
    `).join("") + buildLoadMoreButtonHtml("updateHistoryLoadMoreButton", state.updateHistoryVisibleCount, history.length);
    els.updateHistoryList.querySelector("#updateHistoryLoadMoreButton")?.addEventListener("click", () => {
      state.updateHistoryVisibleCount += COLLAPSED_LOAD_MORE_STEP;
      renderUpdateHistory(ctx);
    });
  }

  global.KakeiboUpdateHistoryFeature = {
    renderUpdateHistory,
  };
})(window);

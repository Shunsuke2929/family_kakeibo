(function registerKakeiboSearchFeature(global) {
  function renderSearchResults(ctx) {
    const {
      state,
      els,
      canUseSharedStorage,
      isSharedDataPendingAuthentication,
      filterExpenses,
      buildExpenseAttentionState,
      buildExpenseAttentionSummary,
      formatCurrency,
      sumAmounts,
      renderExpenseCardHtml,
      buildLoadMoreButtonHtml,
      bindExpenseCardEvents,
      renderCategoryIntegrityScan,
      collapsedLoadMoreStep,
    } = ctx;

    if (!state.expensesLoaded) {
      state.searchResults = [];
      if (isSharedDataPendingAuthentication()) {
        els.searchResultInfo.textContent = "Google接続の確認後に全期間の支出を読み込みます。";
        els.searchResults.innerHTML = '<div class="expense-card"><span class="muted">Google接続の確認後に全期間の支出を読み込みます。</span></div>';
      } else if (!canUseSharedStorage() && (state.lastGoogleUser || state.googleReady)) {
        els.searchResultInfo.textContent = "Googleログイン後に全期間の支出を読み込みます。";
        els.searchResults.innerHTML = '<div class="expense-card"><span class="muted">Googleログイン後に全期間の支出を読み込みます。</span></div>';
      } else {
        els.searchResultInfo.textContent = "検索タブを開いたときに全期間の支出を読み込みます。";
        els.searchResults.innerHTML = '<div class="expense-card"><span class="muted">全期間の支出を読み込んでいます...</span></div>';
      }
      renderCategoryIntegrityScan();
      return;
    }

    const results = filterExpenses();
    const attentionState = buildExpenseAttentionState();
    state.searchResults = results;
    const attentionSummary = buildExpenseAttentionSummary(results, attentionState);
    els.searchResultInfo.textContent = `${results.length}件 / 合計 ${formatCurrency(sumAmounts(results))}${attentionSummary ? ` / ${attentionSummary}` : ""}`;
    if (!results.length) {
      els.searchResults.innerHTML = '<div class="expense-card"><span class="muted">条件に一致する支出はありません。</span></div>';
      renderCategoryIntegrityScan();
      return;
    }

    const visibleItems = results.slice(0, state.searchResultsVisibleCount);
    els.searchResults.innerHTML = visibleItems.map((item) => renderExpenseCardHtml(item, { attentionState })).join("")
      + buildLoadMoreButtonHtml("searchResultsLoadMoreButton", state.searchResultsVisibleCount, results.length);
    bindExpenseCardEvents(els.searchResults, visibleItems);
    els.searchResults.querySelector("#searchResultsLoadMoreButton")?.addEventListener("click", () => {
      state.searchResultsVisibleCount += collapsedLoadMoreStep;
      renderSearchResults(ctx);
    });
    renderCategoryIntegrityScan();
  }

  global.KakeiboSearchFeature = {
    renderSearchResults,
  };
})(window);

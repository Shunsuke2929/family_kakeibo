(function registerKakeiboTabsNavigationFeature(global) {
  function switchTab(ctx, tabName) {
    const {
      els,
      state,
      canUseSharedStorage,
      renderSummary,
      ensureAllExpensesLoaded,
      shouldRefreshAllExpenses,
      renderSearchResults,
      renderExpenseList,
      ensureExpenseListHydratedFromExpenses,
      loadExpenseListFromBackend,
      renderTransferList,
      renderHouseholdIncomeList,
      renderChildWalletTotal,
      renderChildTransactionList,
      ensureSharedStateLoaded,
      renderSettingsTabContent,
      warmDriveSession,
      refreshPushNotificationStatus,
      onSharedTabActivation,
    } = ctx;
    const resolvedTabName = els.tabPanels.some((panel) => panel.id === `tab-${tabName}`) ? tabName : "home";
    els.tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.tab === resolvedTabName));
    els.tabPanels.forEach((panel) => panel.classList.toggle("hidden", panel.id !== `tab-${resolvedTabName}`));
    els.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${resolvedTabName}`));
    if (resolvedTabName === "home" || resolvedTabName === "summary") {
      renderSummary();
      ensureAllExpensesLoaded({ silent: true, forceRefresh: shouldRefreshAllExpenses() }).then((loaded) => {
        if (loaded) renderSummary();
      });
    }
    if (resolvedTabName === "search") {
      renderSearchResults();
      ensureAllExpensesLoaded({ silent: true, forceRefresh: true }).then((loaded) => {
        if (loaded) renderSearchResults();
      });
    }
    if (resolvedTabName === "transfer") {
      renderTransferList();
      renderHouseholdIncomeList();
      if (canUseSharedStorage() && !state.sharedStateLoaded && !state.sharedStateLoading) {
        ensureSharedStateLoaded({ silent: true }).then((loaded) => {
          if (loaded) {
            renderTransferList();
            renderHouseholdIncomeList();
            renderChildWalletTotal();
            renderChildTransactionList();
          }
        });
      }
    }
    if (resolvedTabName === "child") {
      renderChildWalletTotal();
      renderChildTransactionList();
      if (canUseSharedStorage() && !state.sharedStateLoaded && !state.sharedStateLoading) {
        ensureSharedStateLoaded({ silent: true }).then((loaded) => {
          if (loaded) {
            renderChildWalletTotal();
            renderChildTransactionList();
            renderTransferList();
          }
        });
      }
    }
    if (resolvedTabName === "settings" && canUseSharedStorage() && !state.expensesLoaded) {
      ensureAllExpensesLoaded({ silent: true }).then((loaded) => {
        if (loaded) {
          renderSettingsTabContent();
        }
      });
    }
    if (resolvedTabName === "settings" && canUseSharedStorage()) {
      warmDriveSession({ updateMessage: false }).catch(() => {});
      refreshPushNotificationStatus({ forceConfig: false }).catch(() => {});
    }
    if (resolvedTabName === "settings") {
      renderSettingsTabContent();
    }
    onSharedTabActivation(resolvedTabName);
  }

  function bindTabButtons(ctx) {
    const { els, switchTab: switchTabFromApp } = ctx;
    els.tabButtons.forEach((button) => button.addEventListener("click", () => switchTabFromApp(button.dataset.tab)));
  }

  global.KakeiboTabsNavigationFeature = {
    bindTabButtons,
    switchTab,
  };
})(window);

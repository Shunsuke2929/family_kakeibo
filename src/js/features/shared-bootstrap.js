(function registerKakeiboSharedBootstrapFeature(global) {
  const SHARED_DATA_TABS = new Set(["summary", "list", "search", "settings"]);
  const AUTH_WARMUP_THROTTLE_MS = 30000;
  const SHARED_RESUME_REFRESH_MS = 5 * 60 * 1000;

  function getBootstrapErrorMessage(stage, fallback = "") {
    switch (stage) {
      case "shared":
        return "共有データの読み込みに失敗しました。";
      case "overview":
        return "家計の見える化の概要取得に失敗しました。";
      case "expenses":
        return "家計の見える化に必要な支出データの読み込みに失敗しました。";
      case "list":
        return "一覧の最新取得に失敗しました。";
      default:
        return fallback || "共有データの再読み込みに失敗しました。";
    }
  }

  async function performSharedBootstrap(ctx, options = {}) {
    const {
      state,
      canUseSharedStorage,
      getActiveTabName,
      setSharedBootstrapInProgress,
      setSharedBootstrapError,
      loadSharedStateFromBackend,
      loadExpenseOverviewFromBackend,
      loadExpenseListFromBackend,
      ensureAllExpensesLoaded,
      renderSummary,
      renderAll,
      hasLegacyPendingReceiptUploads,
      resumePendingReceiptUploads,
      refreshPushNotificationStatus,
      maybeNotifyAppVersionUpdate,
      showSyncToast,
    } = ctx;

    try {
      if (!canUseSharedStorage()) {
        setSharedBootstrapError("");
        if (options.includePeripheral !== false) {
          await refreshPushNotificationStatus({ forceConfig: false }).catch(() => {});
          await maybeNotifyAppVersionUpdate();
        }
        return false;
      }

      setSharedBootstrapInProgress(true, { skipRender: Boolean(options.skipInitialRender) });
      setSharedBootstrapError("");

      // Cookieのブラウザ反映などのセッション確立猶予として300ms待機
      await new Promise((resolve) => setTimeout(resolve, 300));

      const sharedLoaded = await loadSharedStateFromBackend({ silent: options.silent !== false });
      if (!sharedLoaded) {
        setSharedBootstrapError(getBootstrapErrorMessage("shared"));
        return false;
      }

      const [overviewLoaded, listLoaded] = await Promise.all([
        loadExpenseOverviewFromBackend({ silent: true }),
        loadExpenseListFromBackend({ reset: true, silent: true }),
      ]);

      let failedStage = "";
      if (!overviewLoaded) failedStage = "overview";
      if (!listLoaded && !failedStage) failedStage = "list";

      if (["home", "summary"].includes(getActiveTabName())) {
        let loaded = await ensureAllExpensesLoaded({ silent: true, forceRefresh: true });
        if (!loaded) {
          // 1回だけ1秒後に自動リトライ
          await new Promise((resolve) => setTimeout(resolve, 1000));
          loaded = await ensureAllExpensesLoaded({ silent: true, forceRefresh: true });
        }
        if (loaded) {
          renderSummary();
        } else if (!failedStage) {
          failedStage = "expenses";
        }
      }

      if (hasLegacyPendingReceiptUploads()) {
        resumePendingReceiptUploads({ interactive: false, silent: true }).catch(() => {});
      }

      if (options.includePeripheral !== false) {
        await refreshPushNotificationStatus({ forceConfig: Boolean(options.forcePushConfig) }).catch(() => {});
        await maybeNotifyAppVersionUpdate();
      }

      if (failedStage) {
        const message = getBootstrapErrorMessage(failedStage);
        setSharedBootstrapError(message);
        if (options.interactive) {
          showSyncToast(message, "error", { duration: 3200 });
        }
        return false;
      }

      state.sharedBootstrapCompletedAt = new Date().toISOString();
      setSharedBootstrapError("");
      if (options.interactive) {
        showSyncToast("共有データを更新しました。", "success", { duration: 2200 });
      }
      return true;
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "共有データの再読み込みに失敗しました。";
      setSharedBootstrapError(message);
      if (options.interactive) {
        showSyncToast(message, "error", { duration: 3200 });
      }
      return false;
    } finally {
      setSharedBootstrapInProgress(false, { skipRender: true });
      renderAll();
    }
  }

  async function runInitialBackgroundBootstrap(ctx, options = {}) {
    const { state, refreshPushNotificationStatus, maybeNotifyAppVersionUpdate, renderAll } = ctx;
    try {
      if (state.currentUser && !options.skipDataLoad) {
        await performSharedBootstrap(ctx, { silent: true, includePeripheral: false, skipInitialRender: true });
      }
      await refreshPushNotificationStatus({ forceConfig: false }).catch(() => {});
      await maybeNotifyAppVersionUpdate();
    } finally {
      renderAll();
    }
  }

  function handlePageShowBootstrap(ctx) {
    const { canUseSharedStorage, renderAll } = ctx;
    if (canUseSharedStorage()) {
      performSharedBootstrap(ctx, { silent: true, includePeripheral: false, skipInitialRender: true }).catch(() => {});
      return;
    }
    renderAll();
  }

  async function retrySharedBootstrap(ctx, options = {}) {
    const { state, attemptAutoGoogleSignIn, showSyncToast } = ctx;
    if (!state.currentUser) {
      if (state.lastGoogleUser) {
        attemptAutoGoogleSignIn({ force: true });
        showSyncToast("Google接続を再確認しています。", "pending", { duration: 2200 });
      } else {
        showSyncToast("先に Google ログインしてください。", "error", { duration: 2600 });
      }
      return false;
    }
    return performSharedBootstrap(ctx, {
      silent: true,
      includePeripheral: false,
      interactive: Boolean(options.interactive),
    });
  }

  function renderSummaryDataStatus(ctx) {
    const {
      state,
      els,
      canUseSharedStorage,
      isSummaryDataRefreshing,
      hasSummaryDataRefreshError,
      getSummaryLoadingMessage,
    } = ctx;
    if (!els.summaryDataStatus || !els.summaryDataStatusMessage || !els.summaryDataRetryButton) return;

    const showLoading = isSummaryDataRefreshing();
    const hasError = typeof hasSummaryDataRefreshError === "function"
      ? hasSummaryDataRefreshError()
      : Boolean(state.sharedBootstrapError);
    const shouldShow = hasError || showLoading;

    els.summaryDataStatus.classList.toggle("hidden", !shouldShow);
    els.summaryDataStatus.classList.toggle("warning", hasError);
    els.summaryDataStatus.classList.toggle("subtle", !hasError);
    if (!shouldShow) return;

    els.summaryDataStatusMessage.textContent = hasError
      ? `${state.sharedBootstrapError} 下のボタンから再読み込みできます。`
      : getSummaryLoadingMessage();
    els.summaryDataRetryButton.classList.toggle("hidden", !hasError || !canUseSharedStorage());
    els.summaryDataRetryButton.disabled = showLoading;
  }

  function handleVisibilityResume(ctx, source = "") {
    const {
      state,
      requestFreshGoogleCredential,
      warmAuthSession,
      getActiveTabName,
    } = ctx;
    if (!state.googleReady && !state.currentUser && !state.rememberedSession?.sessionId) return false;
    if (state.authCheckInProgress || state.sharedBootstrapInProgress) return false;
    if (!state.currentUser && !state.lastGoogleUser && !state.rememberedSession?.sessionId) return false;
    if (global.navigator?.onLine === false) return false;
    const now = Date.now();
    if (now - Number(state.authWarmupLastAttemptAt || 0) < AUTH_WARMUP_THROTTLE_MS) return false;
    state.authWarmupLastAttemptAt = now;

    const activeTab = String(getActiveTabName?.() || "");
    const lastBootstrapAt = Date.parse(String(state.sharedBootstrapCompletedAt || ""));
    const shouldRefreshShared = SHARED_DATA_TABS.has(activeTab) && (
      !state.sharedStateLoaded
      || !Number.isFinite(lastBootstrapAt)
      || (Date.now() - lastBootstrapAt) > SHARED_RESUME_REFRESH_MS
    );

    if (state.currentUser?.authMode === "cookie_session" || state.rememberedSession?.sessionId) {
      warmAuthSession({
        background: true,
        minAgeMs: source === "online" ? 0 : AUTH_WARMUP_THROTTLE_MS,
      }).then((restored) => {
        if (restored && shouldRefreshShared) {
          performSharedBootstrap(ctx, {
            silent: true,
            includePeripheral: false,
            skipInitialRender: true,
          }).catch(() => {});
        }
      }).catch(() => {});
      return true;
    }

    if (state.currentUser) {
      requestFreshGoogleCredential({
        silent: true,
        background: true,
        timeoutMs: source === "focus" ? 2200 : 2800,
      }).catch(() => {});
      return true;
    }
    return false;
  }

  function handleSharedTabActivation(ctx, tabName = "") {
    if (!SHARED_DATA_TABS.has(String(tabName || ""))) return false;
    return handleVisibilityResume(ctx, "tab");
  }

  global.KakeiboSharedBootstrapFeature = {
    runInitialBackgroundBootstrap,
    handlePageShowBootstrap,
    retrySharedBootstrap,
    renderSummaryDataStatus,
    handleVisibilityResume,
    handleSharedTabActivation,
    runPostLoginBootstrap: (ctx, options = {}) => performSharedBootstrap(ctx, options),
  };
})(window);

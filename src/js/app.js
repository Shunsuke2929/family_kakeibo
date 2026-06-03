
(() => {
  const STORAGE_KEY = "household-ledger-state-v1";
  const DRIVE_FOLDER_KEY = "kakeibo-drive-folder-v1";
  const SESSION_ID_TOKEN_KEY = "kakeibo-google-id-token-v1";
  const DRIVE_ACCESS_TOKEN_KEY = "kakeibo-drive-access-token-v1";
  const SESSION_REMEMBER_KEY = "kakeibo-session-remember-v1";
  const SUMMARY_VIEW_MODE_KEY = "kakeibo-summary-view-mode-v1";
  const PENDING_RECEIPT_UPLOAD_QUEUE_KEY = "kakeibo-pending-receipt-upload-queue-v1";
  const PUSH_CONFIG_CACHE_MS = 5 * 60 * 1000;
  const DRIVE_TOKEN_REQUEST_TIMEOUT_MS = 30000;
  const AUTO_LOGIN_UI_TIMEOUT_MS = 1800;
  const AUTO_LOGIN_SILENT_TIMEOUT_MS = 2600;
  const SESSION_KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;
  const SESSION_REFRESH_THROTTLE_MS = 90 * 1000;
  const LAST_SEEN_APP_VERSION_KEY = "kakeibo-last-seen-app-version-v1";
  const RECEIPT_UPLOAD_DB_NAME = "kakeibo-receipt-upload-v1";
  const RECEIPT_UPLOAD_DB_VERSION = 1;
  const RECEIPT_UPLOAD_STORE_NAME = "pendingUploads";
  const PENDING_RECEIPT_UPLOAD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  let _idTokenRefreshTimer = null;
    let _autoLoginUiTimer = null;
    let _autoLoginRevealTimer = null;
    let _sessionKeepaliveTimer = null;
    let _sessionRestorePromise = null;
    let _driveTokenClientInitTimer = null;
    let _receiptAutoAnalyzeTimer = null;
  let _receiptDrivePreflightTimer = null;
  let _receiptStorageUploadPromise = null;
  let _receiptStorageUploadFile = null;
  let _receiptAutoAnalyzeQueued = false;
  let _receiptPendingUploadResumePromise = null;
  const _receiptUploadProcessingJobs = new Set();
  const config = window.APP_CONFIG || {};
  const SHARED_SYNC_DEBOUNCE_MS = 700;
  const MEMO_MAX_LENGTH = 2000;
  const COLLAPSED_INITIAL_COUNT = 5;
  const COLLAPSED_LOAD_MORE_STEP = 10;
  const EXPENSE_LIST_PAGE_SIZE = 25;

  const {
    DEFAULT_CATEGORIES,
    CATEGORY_SELECT_PRIORITY,
    CATEGORY_CODE_MAP,
    CATEGORY_ALIAS_MAP,
    CATEGORY_SORT_ORDER_MAP,
    CATEGORY_BUDGET_GROUP_KEY_MAP,
    DASHBOARD_MONTHLY_GROUP_DEFINITIONS,
    DASHBOARD_MONTHLY_FOCUS_GROUP_KEYS,
    DASHBOARD_ANNUAL_MONTHLY_FOCUS_GROUP_KEYS,
    DASHBOARD_ANNUAL_GROUP_DEFINITIONS,
    DASHBOARD_EXCLUDED_ANNUAL_GROUP_DEFINITIONS,
    DASHBOARD_GROUP_LABELS,
    DEFAULT_CATEGORY_MASTER_CONFIG,
    DEFAULT_SETTLEMENT_RULES,
    DEFAULT_RECURRING_TEMPLATE_CONFIG,
    DEFAULT_MONTHLY_CLOSE_CONFIG,
    DEFAULT_HOUSEHOLD_POOL_CONFIG,
    RECURRING_TEMPLATE_FREQUENCY_OPTIONS,
    CATEGORY_LABEL_BY_CODE,
    DEFAULT_DASHBOARD_BUDGET_CONFIG,
    DEFAULT_OTHER_PAYMENT_METHODS,
    PAYMENT_METHODS,
    PAYMENT_METHOD_CODEBOOK,
    PAYER_LABELS,
    BILLING_LABELS,
    PERSONAL_EXPENSE_LABELS,
    TRANSFER_TYPE_LABELS,
    TRANSFER_SETTLEMENT_SCOPE_LABELS,
  } = window.KakeiboCore || {};

  const SERIAL_KIND_PREFIX = {
    expenses: "A",
    transfers: "B",
    childTransactions: "R",
    householdIncomes: "I",
  };
  const CHILD_KIND_LABELS = {
    gift: "お祝い金",
    otoshidama: "お年玉",
    deposit: "入金",
    expense: "支出",
    return_gift: "半返し",
  };
  const HOUSEHOLD_INCOME_KIND_LABELS = {
    sale_profit: "売却益",
    refund: "返金",
    subsidy: "補助金",
    other: "その他入金",
  };

  const USER_LABELS = {
    "your-email@example.com": "夫",
    "partner-email@example.com": "妻",
  };

  const state = {
    currentUser: null,
    lastGoogleUser: null,
    expenses: [],
    expensesLoaded: false,
    expensesLastLoadedAt: 0,
    expensesLoading: false,
    expensesLoadingPromise: null,
    expenseListItems: [],
    expenseListLoading: false,
    expenseListHasMore: false,
    expenseListCursor: "",
    expenseOverview: {
      currentMonth: "",
      currentYear: "",
      monthlyTotal: 0,
      yearlyTotal: 0,
      recentMonths: [],
    },
    transfers: [],
    childTransactions: [],
    householdIncomes: [],
    categories: [...DEFAULT_CATEGORIES],
    categoryMasterConfig: null,
    otherPaymentMethods: [...DEFAULT_OTHER_PAYMENT_METHODS],
    serialCounters: {},
    dashboardBudgetConfig: null,
    settlementRules: null,
    householdPoolConfig: null,
    recurringTemplateConfig: null,
    monthlyCloseConfig: null,
    splitMode: false,
    splitModeType: "manual",
    splitEntries: [],
    receiptQueue: [],
    receiptQueueIndex: -1,
    receiptDraft: {
        file: null,
        previewUrl: "",
        aiResult: null,
        aiSource: "",
        storageAssetId: "",
        storageUploadedAt: "",
        storageStatus: "",
        driveFileId: "",
        driveUrl: "",
        uploadedAt: "",
        uploadStatus: "",
        uploaderName: "",
        receiptAssets: [],
        pendingReceiptAssets: [],
        receiptAssetsEdited: false,
        queueStorageSignature: "",
    },
    pendingReceiptUploads: [],
    searchResults: [],
    categoryIntegrityScan: [],
    categoryIntegrityScanSummary: "",
    categoryIntegrityScanStatus: "",
    categoryIntegrityScanStatusTone: "idle",
    aiAnalyzeBusy: false,
    aiAnalyzeMode: "",
    activityLogs: [],
    activityLogsLoaded: false,
    activityLogsLoading: false,
    listMonthFilter: "",
    expenseListVisibleCount: EXPENSE_LIST_PAGE_SIZE,
    searchResultsVisibleCount: COLLAPSED_INITIAL_COUNT,
    summaryViewMode: "monthly",
    categoryMetaPanelExpanded: false,
    monthlyFixedCandidates: [],
    monthlyFixedCandidateMonth: "",
    monthlyFixedCandidateDiagnostics: null,
    monthlyFixedLastSavedAt: "",
    settlementTransferDraft: null,
    childVisibleCount: COLLAPSED_INITIAL_COUNT,
    updateHistoryVisibleCount: COLLAPSED_INITIAL_COUNT,
    activityHistoryVisibleCount: COLLAPSED_INITIAL_COUNT,
      googleReady: false,
      authCheckInProgress: false,
      sessionRestoreSequence: 0,
      driveTokenClient: null,
    driveFolderCache: null,
    driveStatus: {
      google: "idle",
      drive: "unknown",
      folder: "unknown",
      message: "Drive は必要になった時か設定画面で確認します。",
    },
    receiptFlowStatus: {
      analyze: "idle",
      drive: "idle",
      message: "画像やPDFを最大3ファイルまで選び、Gemini AI解析ボタンで解析と一時保存を開始します。",
    },
    pushNotifications: {
      supported: false,
      standalone: false,
      permission: "default",
      subscribed: false,
      serverEnabled: false,
      publicKey: "",
      subject: "",
      configFetchedAt: 0,
      message: "通知はまだ有効化されていません。",
    },
    appVersionNotificationInFlight: "",
    entryReturnTab: null,
    pendingImportData: null,
    editScrollContext: null,
    expenseEditModalOpen: false,
    expenseGroupEditModalOpen: false,
    expenseGroupEditGroupId: "",
    crossBurdenModalOpen: false,
    dashboardBudgetModalOpen: false,
    entryFlowModalOpen: false,
    entryFlowMode: "",
    entryFlowStage: "",
    expenseEntryCardHome: null,
    entryAiCardHome: null,
    storageMode: "local",
    sharedStateLoaded: false,
    sharedStateLoading: false,
    sharedStateLoadingPromise: null,
    sharedBootstrapInProgress: false,
    sharedBootstrapError: "",
    sharedBootstrapCompletedAt: "",
    sharedSyncInFlight: false,
    sharedSyncQueued: false,
    sharedSyncTimer: null,
    sharedSyncPromise: null,
    lastSharedSyncError: null,
    sharedSettingsUpdatedAt: "",
    sharedSettingsUpdatedBy: "",
    toastTimer: null,
    autoLoginAttempted: false,
    authWarmupLastAttemptAt: 0,
    lastSessionRefreshAt: 0,
    googleCredentialRefreshPromise: null,
    googleCredentialWaiters: [],
    authSessionDiagnostics: null,
    rememberedSession: null,
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("pageshow", handlePageShow);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("online", handleWindowOnline);

  function init() {
    cacheElements();
    hydrate();
    state.dashboardBudgetConfig = normalizeDashboardBudgetConfig(state.dashboardBudgetConfig);
    state.householdPoolConfig = normalizeHouseholdPoolConfig(state.householdPoolConfig);
    state.monthlyCloseConfig = normalizeMonthlyCloseConfig(state.monthlyCloseConfig);
    state.pushNotifications.supported = supportsPushNotifications();
    state.pushNotifications.standalone = isStandalonePwa();
    state.pushNotifications.permission = supportsPushNotifications() ? Notification.permission : "unsupported";
    state.authCheckInProgress = !Boolean(state.currentUser);
    resetHistoryFilters();
    ensureSummaryPeriodDefaults();
    applyBranding();
    renderSelectOptions();
    bindEvents();
    resetForm();
    resetTransferForm();
    resetHouseholdIncomeForm();
    resetChildForm();
    initGoogle();
    syncAuthUI();
    renderAll();
    const startupRouteHandled = applyStartupRouteFromUrl();
    if (!startupRouteHandled) switchTab("home");
    void runAppStartupFlow();
  }

  async function runAppStartupFlow() {
    try {
      const restored = await restoreBackendSession({ silent: Boolean(state.currentUser) });
      await runInitialBackgroundBootstrap({ skipDataLoad: restored });
      scheduleSessionKeepalive();
    } catch (error) {
      console.error("runAppStartupFlow failed", error);
    }
  }

  async function runInitialBackgroundBootstrap(options = {}) {
    const delegated = callSharedBootstrapFeature("runInitialBackgroundBootstrap", options);
    if (delegated !== undefined) return delegated;
    try {
      if (state.currentUser && !options.skipDataLoad) {
        setSharedBootstrapInProgress(true, { skipRender: true });
        try {
          await loadSharedStateFromBackend({ silent: true });
          await loadExpenseOverviewFromBackend({ silent: true });
          await loadExpenseListFromBackend({ reset: true, silent: true });
          if (["home", "summary"].includes(getActiveTabName()) && canUseSharedStorage()) {
            const loaded = await ensureAllExpensesLoaded({ silent: true });
            if (loaded) renderSummary();
          }
        } finally {
          setSharedBootstrapInProgress(false, { skipRender: true });
        }
        if (hasLegacyPendingReceiptUploads()) {
          resumePendingReceiptUploads({ interactive: false, silent: true }).catch(() => {});
        }
      }
      await refreshPushNotificationStatus({ forceConfig: false }).catch(() => {});
      await maybeNotifyAppVersionUpdate();
    } finally {
      renderAll();
    }
  }

  function handlePageShow() {
    resetHistoryFilters();
    const delegated = callSharedBootstrapFeature("handlePageShowBootstrap");
    if (delegated !== undefined) return delegated;
    if (canUseSharedStorage()) {
      setSharedBootstrapInProgress(true, { skipRender: true });
      loadSharedStateFromBackend({ silent: true })
        .then(() => Promise.all([
          loadExpenseOverviewFromBackend({ silent: true }),
          loadExpenseListFromBackend({ reset: true, silent: true }),
        ]))
        .then(() => {
          if (["home", "summary"].includes(getActiveTabName())) {
            return ensureAllExpensesLoaded({ silent: true });
          }
          return false;
        })
        .finally(() => {
          setSharedBootstrapInProgress(false, { skipRender: true });
          renderAll();
        });
      return;
    }
    renderAll();
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    callSharedBootstrapFeature("handleVisibilityResume", "visibility");
  }

  function handleWindowFocus() {
    callSharedBootstrapFeature("handleVisibilityResume", "focus");
  }

  function handleWindowOnline() {
    callSharedBootstrapFeature("handleVisibilityResume", "online");
  }

  function cacheElements() {
    const ids = [
      "startupView", "loginView", "appView", "logoutButton", "googleLoginContainer", "loginMessage", "userName", "userMeta", "authInlineStatus",
      "googleAuthStatusLabel", "driveAuthStatusLabel", "driveHealthMessage",
      "pushSupportLabel", "pushPermissionLabel", "pushSubscriptionLabel", "pushStatusMessage", "enablePushButton", "disablePushButton",
      "brandEyebrow", "appTitleLabel", "appVersionLabel",
      "annualPaceTitle",
        "summaryMonth", "summaryYear", "summaryCurrentMonthButton", "summaryCurrentYearButton", "summaryModeMonthlyButton", "summaryModeYearlyButton", "summaryModeSettlementButton", "summaryMonthlyControls", "summaryYearlyControls", "summarySettlementControls", "summaryDataStatus", "summaryDataStatusMessage", "summaryDataRetryButton", "summaryMonthlyPanel", "summaryYearlyPanel", "summarySettlementPanel", "summaryTotal", "summaryYearlyTotal", "summaryYearlyHusband", "summaryYearlyWife", "summaryYearlyFamilyCard", "summaryYearlyTemporaryIncome", "summaryYearlyTotalFormula", "summaryYearlyFormulaBar", "summaryYearlyFormulaHusband", "summaryYearlyFormulaWife", "summaryYearlyFormulaIncome", "summaryYearlyFormulaTotal", "summaryHusband", "summaryWife",
      "summaryFamilyCard", "summaryCrossBurden", "summaryCrossBurdenLabel", "categorySummary", "expenseList", "searchResults", "searchResultInfo", "categoryIntegrityScanButton", "categoryIntegrityScanStatus", "categoryIntegrityScanSummary", "categoryIntegrityScanResults", "categoryMasterList", "categoryMasterMetaToggle", "categoryMasterMetaList",
      "summarySettlementYear", "summarySettlementCurrentYearButton", "summarySettlementSummary", "summarySettlementCards", "summarySettlementReport", "summarySettlementApplyTransferButton", "summarySettlementActionMessage",
      "annualPaceCard", "annualPaceFormula", "annualPaceExpected", "annualPaceActual", "annualPaceDelta", "annualPaceDeltaStatus", "annualPaceBar", "annualPaceMeta", "annualPaceMajorTotal", "annualPaceMajorMeta", "annualPaceMajorBar", "annualPaceMajorStatus",
      "homeMonthlyKpiStatus", "homeMonthlyRemainingAmount", "homeMonthlyKpiBar", "homeMonthlyUsedAmount", "homeMonthlyBudgetAmount", "homeMonthlyPaceMeta", "homeMonthlyForecastMeta", "homeMonthlyMiniProgress",
      "dashboardCoreMonthlyTotal", "dashboardCoreMonthlyMeta", "dashboardCoreMonthlyStatus", "dashboardCoreMonthlyBar",
      "dashboardForecastTotal", "dashboardForecastMeta", "dashboardForecastStatus",
      "dashboardSpecialAnnualTotal", "dashboardSpecialAnnualMeta", "dashboardSpecialAnnualStatus",
      "dashboardOverallLabel", "dashboardOverallMeta", "dashboardOverallCause", "dashboardOverallStatus",
      "dashboardCoreCategoryProgress", "dashboardReferenceCategoryProgress", "dashboardAnnualMonthlyCategoryProgress", "dashboardAnnualMonthlyFocusProgress", "dashboardAnnualMonthlyReferenceProgress", "dashboardAnnualMonthlyTotalProgress", "dashboardUnassignedDetails", "dashboardUnassignedWarning", "dashboardUnassignedTitle", "dashboardUnassignedSummary", "dashboardUnassignedMessage", "dashboardUnassignedList", "dashboardUnassignedActions", "dashboardUnassignedSearchButton", "dashboardUnassignedSettingsButton",
      "dashboardAnnualCategoryProgress", "dashboardExcludedAnnualTitle", "dashboardExcludedAnnualMessage",
      "dashboardBudgetMonthlyGroupList", "dashboardBudgetAnnualGroupList", "dashboardBudgetExcludedList",
      "dashboardBudgetCoreTotal", "dashboardBudgetAnnualTotal", "dashboardBudgetOpenButton", "dashboardBudgetModal", "dashboardBudgetModalClose", "dashboardBudgetModalCancel", "dashboardBudgetSaveButton", "dashboardBudgetMessage",
      "transferForm", "transferId", "transferUpdatedAt", "transferDate", "transferType", "transferSettlementScope", "transferFromPerson", "transferToPerson",
      "transferAmount", "transferMemo", "transferDeleteButton", "transferMessage", "transferYearSummary",
      "transferFilterStartMonth", "transferFilterEndMonth", "transferFilterSummary", "transferList",
      "householdIncomeForm", "householdIncomeId", "householdIncomeUpdatedAt", "householdIncomeDate", "householdIncomeKind",
      "householdIncomeSourceName", "householdIncomeHolder", "householdIncomeAmount", "householdIncomeMemo",
      "householdIncomeDeleteButton", "householdIncomeMessage", "householdIncomeFilterStartMonth",
      "householdIncomeFilterEndMonth", "householdIncomeFilterSummary", "householdIncomeList",
        "childForm", "childTransactionId", "childDate", "childKind", "childSourceOrFrom", "childHolder", "childAmount",
      "childMemo", "childDeleteButton", "childMessage", "childWalletTotal", "childFilterStartMonth", "childFilterEndMonth",
        "childFilterSummary", "childTransactionList", "childWalletHolderSummary",
      "syncToast",
      "paymentMethodMasterList", "otherPaymentMethodMasterList", "addOtherPaymentMethodButton", "driveFolderLabel", "driveFolderPickButton",
      "driveFolderClearButton", "driveFolderMessage", "driveReceiptSyncButton", "driveReceiptSyncSummary", "driveReceiptSyncMessage", "receiptCameraButton", "receiptFileButton", "receiptMoreToggle",
      "receiptMoreActions", "receiptCameraAddButton", "receiptFileAddButton", "receiptCameraFile",
      "receiptFile", "receiptPreview", "receiptPreviewContainer",
      "aiAnalyzeButton", "orderMailText", "orderMailAnalyzeButton", "clearReceiptButton", "receiptMessage", "aiSuggestionBox",
      "geminiModelOption", "geminiModelNotice",
      "receiptAnalyzeOverlay", "textAnalyzeOverlay", "aiErrorModal", "aiErrorMessage", "aiErrorModalClose",
      "receiptWorkflowStatus", "receiptPendingUploadPanel", "receiptPendingUploadSummary", "receiptPendingUploadMessage", "receiptPendingUploadList", "retryPendingReceiptUploadsButton",
      "entryModeImageButton", "entryModeTextButton", "entryModeManualButton",
      "quickEntryImageButton", "quickEntryTextButton", "quickEntryManualButton",
      "backToQuickStartButton",
      "entryAiCard", "entryAiImageSection", "entryAiTextSection",
      "entryFlowModal", "entryFlowModalEyebrow", "entryFlowModalTitle", "entryFlowModalClose", "entryFlowModalContent",
      "expenseForm", "expenseId", "expenseUpdatedAt", "date", "splitModeToggle", "splitAddLineButton", "splitEntrySection",
        "splitReceiptTotal", "splitEntriesTotal", "splitDifferenceTotal", "splitDifferenceMessage", "splitEntryList",
        "aiReceiptSummarySection", "splitSummaryStoreName", "splitSummaryCategory", "splitSummaryPayer",
        "splitSummaryPaymentMethod", "splitSummaryOtherPaymentWrapper", "splitSummaryOtherPaymentMethod",
        "splitFamilyAmount", "splitHusbandAmount", "splitWifeAmount", "splitSummaryMessage", "splitSummaryMemo",
        "singleEntryFields", "storeName", "amount", "category", "payer", "paymentMethod",
      "otherPaymentMethod", "otherPaymentWrapper", "familyCardWarning", "pointCredit", "netAmountLabel", "netAmountPreview",
      "pointCreditPreview", "memo", "receiptUrlLabel", "receiptAttachSection", "editReceiptFileButton", "editReceiptFile", "receiptAssetList", "listRecentMonthsSummary",
      "receiptFileIdLabel", "personalExpense", "formMessage", "expenseSaveButton", "deleteEntryButton", "newEntryButton", "exportYear",
      "expenseTemplateLoadButton", "saveAsTemplateCheckbox", "expenseTemplateModal", "expenseTemplateModalClose", "expenseTemplateList", "expenseTemplateMessage", "expenseTemplateStatusMonth",
      "expenseEntryCard", "expenseEditModal", "expenseEditModalContent", "expenseEditModalClose", "expenseEditModalTitle",
      "expenseGroupEditModal", "expenseGroupEditModalContent", "expenseGroupEditModalClose", "expenseGroupEditModalTitle", "expenseGroupEditSaveButton",
      "crossBurdenModal", "crossBurdenModalClose", "crossBurdenModalTitle", "crossBurdenModalSummary", "crossBurdenDetailList",
      "transferUpdatedAt", "childUpdatedAt",
      "exportSettingsButton", "exportZipButton", "exportMessage", "filterKeyword", "filterStartDate", "filterEndDate", "filterStore", "filterCategory", "filterPayer",
      "filterPaymentMethod", "filterFamilyCard", "addCategoryButton", "importJsonFile", "importJsonButton",
      "importPreviewSummary", "importMessage", "updateHistoryList", "activityHistoryList",
      "reloadLatestDataButton",
      "settlementMonthlyHusband", "settlementMonthlyWife", "settlementBonusHusband06", "settlementBonusHusband12", "settlementBonusWife06", "settlementBonusWife12", "settlementOverrideOverview", "settlementOverrideList", "addSettlementOverrideButton", "householdPoolOpeningBalanceYear", "householdPoolOpeningBalanceList", "addHouseholdPoolOpeningBalanceButton", "settlementFamilyCardOwner", "settlementIncludeTransfers", "settlementNotes", "settlementRulesSaveButton", "settlementRulesMessage",
      "addMonthlyFixedButton", "saveMonthlyFixedButton", "monthlyFixedStatusSummary", "monthlyFixedList", "monthlyFixedMessage", "monthlyFixedCandidateMonth", "monthlyFixedGenerateButton", "monthlyFixedCandidateSummary", "monthlyFixedCandidateList", "monthlyFixedCandidateSaveButton", "monthlyFixedCandidateMessage"
      , "monthlyCloseSection", "monthlyCloseStatusLabel", "monthlyCloseSummary", "monthlyCloseQueueSummary", "monthlyCloseQueueList", "monthlyCloseUnexpectedItems", "monthlyCloseNextMonthActions", "monthlyCloseCarryoverNotes", "monthlyCloseSearchIssuesButton", "monthlyCloseSettlementButton", "monthlyCloseSaveButton", "monthlyCloseReopenButton", "monthlyCloseMessage", "monthlyCloseSnapshotSummary"
    ];

    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });

    els.tabButtons = Array.from(document.querySelectorAll(".tab-button"));
    els.tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
  }

  function applyBranding() {
      const brandName = config.app?.brandName || "うちの家計簿";
    const titleLabel = config.app?.titleLabel || "家計簿Webアプリ";
    const version = config.app?.version || "1.00";
    if (els.brandEyebrow) els.brandEyebrow.textContent = brandName;
    if (els.appTitleLabel) els.appTitleLabel.textContent = titleLabel;
    if (els.appVersionLabel) els.appVersionLabel.textContent = `Ver${version}`;
    document.title = `${brandName} | ${titleLabel} Ver${version}`;
  }

  function getSettingsFeatureContext() {
    return {
      config,
      state,
      els,
      COLLAPSED_LOAD_MORE_STEP,
      MEMO_MAX_LENGTH,
      escapeHtml,
      buildLoadMoreButtonHtml,
      setText,
      currentMonth,
      currentYear,
      collectExportYears,
      collectTimelineYears,
      DEFAULT_CATEGORIES,
      DEFAULT_OTHER_PAYMENT_METHODS,
      PAYMENT_METHODS,
      PAYER_LABELS,
      PERSONAL_EXPENSE_LABELS,
      DASHBOARD_GROUP_LABELS,
      getCategoryMasterEntries,
      getCategoryMetaByCode,
      getSelectableCategoryLabels,
      normalizeCategoryLabel,
      normalizeOtherPaymentMethodLabel,
      normalizePaymentMethodCode,
      normalizePayerCode,
      buildFallbackCategoryMetaFromLabel,
      getMigratedCategoryMasterConfig,
      mergeOtherPaymentMethods,
      renderSelectOptions,
      normalizeSettlementRules,
      normalizeHouseholdPoolConfig,
      persist,
      canUseSharedStorage,
      syncSharedStateToBackend,
      saveSharedSettingsFields,
      renderSummary,
      normalizeRecurringTemplateConfig,
      normalizeRecurringTemplateEntry,
      getPreferredCategoryFallback,
      ensureAllExpensesLoaded,
      formatCurrency,
      formatYearMonthLabel,
      formatDateTimeDisplay,
      getDaysInMonth,
      toYearMonth,
      showSyncToast,
      saveSharedRecord,
      upsertExpenseListRecord,
      loadExpenseOverviewFromBackend,
      renderAll,
      setMessageState,
      shouldShowFamilyCardWarning,
      joinTextPartsWithinLimit,
      normalizeExpense,
      getBillingTargetFromPaymentMethod,
    };
  }

    function getAuthFeatureContext() {
      return {
        config,
        state,
      els,
      userLabels: USER_LABELS,
      sessionIdTokenKey: SESSION_ID_TOKEN_KEY,
      autoLoginUiTimeoutMs: AUTO_LOGIN_UI_TIMEOUT_MS,
      autoLoginSilentTimeoutMs: AUTO_LOGIN_SILENT_TIMEOUT_MS,
        setText,
        persist,
        establishBackendSession,
        applyAuthenticatedUser,
        saveRememberedSessionStorage,
        attemptAutoGoogleSignIn: (options = {}) => callAuthFeature("attemptAutoGoogleSignIn", options),
        invalidateSessionRestore: () => {
          state.sessionRestoreSequence = Number(state.sessionRestoreSequence || 0) + 1;
        },
        scheduleIdTokenRefresh,
      resolveGoogleCredentialWaiters,
      clearIdTokenRefreshTimer,
      setSharedBootstrapInProgress,
      runPostLoginBootstrap: (options = {}) => callSharedBootstrapFeature("runPostLoginBootstrap", options),
      getPassiveDriveFolderId,
      updateConnectionStatusUI,
      updatePushNotificationUI,
      resetForm,
      resetTransferForm,
      resetChildForm,
      renderAll,
      hasLegacyPendingReceiptUploads,
      refreshPushNotificationStatus,
      maybeNotifyAppVersionUpdate,
      clearAutoLoginUiTimer: () => {
        if (_autoLoginUiTimer) {
          clearTimeout(_autoLoginUiTimer);
          _autoLoginUiTimer = null;
        }
      },
      clearAutoLoginRevealTimer: () => {
        if (_autoLoginRevealTimer) {
          clearTimeout(_autoLoginRevealTimer);
          _autoLoginRevealTimer = null;
        }
      },
      setAutoLoginUiTimer: (timerId) => {
        _autoLoginUiTimer = timerId;
      },
      setAutoLoginRevealTimer: (timerId) => {
        _autoLoginRevealTimer = timerId;
      },
      syncAuthUI: () => syncAuthUI(),
      attemptAutoGoogleSignIn: (options = {}) => attemptAutoGoogleSignIn(options),
      handleGoogleCredential: (response) => handleGoogleCredential(response),
      resumePendingReceiptUploads: (options = {}) => resumePendingReceiptUploads(options),
    };
  }

  function callAuthFeature(method, ...args) {
    const feature = window.KakeiboAuthFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getAuthFeatureContext(), ...args);
    }
    return undefined;
  }

  function getSharedBootstrapFeatureContext() {
    return {
      state,
      els,
      setText,
      canUseSharedStorage,
      getActiveTabName,
      setSharedBootstrapInProgress,
      setSharedBootstrapError,
      isSummaryDataRefreshing,
      hasSummaryDataRefreshError,
      getSummaryLoadingMessage,
      loadSharedStateFromBackend,
      loadExpenseOverviewFromBackend,
      loadExpenseListFromBackend,
      ensureAllExpensesLoaded,
      renderAll,
      renderSummary,
      hasLegacyPendingReceiptUploads,
      resumePendingReceiptUploads: (options = {}) => resumePendingReceiptUploads(options),
      refreshPushNotificationStatus,
      maybeNotifyAppVersionUpdate,
      showSyncToast,
      attemptAutoGoogleSignIn: () => attemptAutoGoogleSignIn(),
      requestFreshGoogleCredential,
      warmAuthSession,
    };
  }

  function callSharedBootstrapFeature(method, ...args) {
    const feature = window.KakeiboSharedBootstrapFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getSharedBootstrapFeatureContext(), ...args);
    }
    return undefined;
  }

  function getReceiptFeatureContext() {
    return {
      state,
      els,
      setText,
      escapeHtml,
      truncateText,
      showSyncToast,
      analyzeReceipt,
      ensureReceiptAssetStored,
      ensureReceiptQueueAssetsStored,
      processPendingReceiptUploadJob,
      getPendingReceiptUploadMeta,
      clearReceiptDrivePreflightTimer: () => {
        if (_receiptDrivePreflightTimer) {
          clearTimeout(_receiptDrivePreflightTimer);
          _receiptDrivePreflightTimer = null;
        }
      },
      setReceiptDrivePreflightTimer: (timerId) => {
        _receiptDrivePreflightTimer = timerId;
      },
      clearReceiptAutoAnalyzeTimer: () => {
        if (_receiptAutoAnalyzeTimer) {
          clearTimeout(_receiptAutoAnalyzeTimer);
          _receiptAutoAnalyzeTimer = null;
        }
      },
      setReceiptAutoAnalyzeTimer: (timerId) => {
        _receiptAutoAnalyzeTimer = timerId;
      },
      setReceiptAutoAnalyzeQueued: (value) => {
        _receiptAutoAnalyzeQueued = Boolean(value);
      },
      getReceiptPendingUploadResumePromise: () => _receiptPendingUploadResumePromise,
      setReceiptPendingUploadResumePromise: (value) => {
        _receiptPendingUploadResumePromise = value;
      },
    };
  }

  function callReceiptFeature(method, ...args) {
    const feature = window.KakeiboReceiptFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getReceiptFeatureContext(), ...args);
    }
    return undefined;
  }

  function handleSharedSettingsConflictRefreshed() {
    renderAll();
    if (getActiveTabName() === "settings") {
      renderSettingsTabContent();
    }
  }

  function handleSharedRecordConflictRefreshed(collectionKey, currentRecord) {
    if (!currentRecord?.id) {
      renderAll();
      return;
    }
    if (collectionKey === "expenses" && String(els.expenseId?.value || "").trim() === String(currentRecord.id)) {
      loadExpenseIntoForm(currentRecord);
    } else if (collectionKey === "transfers" && String(els.transferId?.value || "").trim() === String(currentRecord.id)) {
      loadTransferIntoForm(currentRecord.id);
    } else if (collectionKey === "householdIncomes" && String(els.householdIncomeId?.value || "").trim() === String(currentRecord.id)) {
      loadHouseholdIncomeIntoForm(currentRecord.id);
    } else if (collectionKey === "childTransactions" && String(els.childTransactionId?.value || "").trim() === String(currentRecord.id)) {
      loadChildIntoForm(currentRecord.id);
    }
    renderAll();
  }

  function getSharedSyncFeatureContext() {
    return {
      state,
      els,
      setText,
      canUseSharedStorage,
      fetchSharedApi,
      fetchSharedState,
      getSharedSettingsEndpoint,
      getSharedRecordEndpoint,
      getExpenseOverviewEndpoint,
      getExpenseListEndpoint,
      getAllExpensesEndpoint,
      applySharedStateSnapshot,
      upsertStateRecord,
      removeStateRecord,
      prependActivityLog,
      normalizeSerialCounters,
      persist,
      loadSharedRecord,
      hasMissingSharedSerialMetadata,
      hasLegacyCategoryData,
      hasLegacyDashboardBudgetData,
      hasLocallyUsableSharedState,
      onSharedSettingsConflictRefreshed: handleSharedSettingsConflictRefreshed,
      onSharedRecordConflictRefreshed: handleSharedRecordConflictRefreshed,
      syncSharedStateToBackend,
      currentMonth,
      currentYear,
      sumAmounts,
      getRecentMonthKeys,
      isFamilySummaryExpense,
      showSyncToast,
      userLabels: USER_LABELS,
      compareExpensesForDisplay,
      normalizeExpense,
      recoverStoredReceiptUploadJobsFromRecords,
      ensureExpenseListHydratedFromExpenses,
      ensureSharedStateLoaded,
      renderAll,
      expenseListPageSize: EXPENSE_LIST_PAGE_SIZE,
    };
  }

  function callSharedSyncFeature(method, ...args) {
    const feature = window.KakeiboSharedSyncFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getSharedSyncFeatureContext(), ...args);
    }
    return undefined;
  }

  function getExpenseGroupsFeatureContext() {
    return {
      state,
      els,
      paymentMethods: PAYMENT_METHODS,
      payerLabels: PAYER_LABELS,
      personalExpenseLabels: PERSONAL_EXPENSE_LABELS,
      memoMaxLength: MEMO_MAX_LENGTH,
      escapeHtml,
      formatCurrency,
      buildSplitSelectOptions,
      getSelectableCategoryLabels,
      normalizeCategoryLabel,
      getPreferredCategoryFallback,
      normalizePayerCode,
      normalizePaymentMethodCode,
      normalizeOtherPaymentMethodLabel,
      getDefaultOtherPaymentMethod,
      isOtherPaymentMethod,
      shouldShowFamilyCardWarning,
      getPersonalExpenseLabel,
      getBillingTargetFromPaymentMethod,
      normalizeExpense,
      todayISO,
      canUseSharedStorage,
      ensureAllExpensesLoaded,
      showSyncToast,
      getActiveTabName,
      rememberEditScrollContext,
      closeExpenseEditModal,
      saveSharedRecord,
      deleteSharedRecord,
      loadSharedRecord,
      upsertStateRecord,
      upsertExpenseListRecord,
      persist,
      renderAll,
      restoreEditScrollContext,
    };
  }

  function callExpenseGroupsFeature(method, ...args) {
    const feature = window.KakeiboExpenseGroupsFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getExpenseGroupsFeatureContext(), ...args);
    }
    return undefined;
  }

  function getExpenseListFeatureContext() {
    return {
      state,
      els,
      paymentMethods: PAYMENT_METHODS,
      payerLabels: PAYER_LABELS,
      personalExpenseLabels: PERSONAL_EXPENSE_LABELS,
      userLabels: USER_LABELS,
      expenseListPageSize: EXPENSE_LIST_PAGE_SIZE,
      escapeHtml,
      formatCurrency,
      formatYearMonthLabel,
      sumAmounts,
      truncateText,
      normalizeExpense,
      isOtherPaymentMethod,
      isFamilyCardExpense,
      isDriveReceiptUrl,
      getReceiptAssets,
      getExpenseAttentionMeta,
      buildExpenseAttentionState,
      compareExpensesByRegisteredOrder,
      isSharedDataPendingAuthentication,
      canUseSharedStorage,
      buildLoadMoreButtonHtml,
      buildPagedLoadMoreButtonHtml,
      clearListMonthFilter,
      loadExpenseListFromBackend,
      getActiveTabName,
      openExpenseEditModal,
      openExpenseGroupEditModal,
      showSyncToast,
      getReceiptStorageAssetUrl,
      getAuthHeaders,
      markAuthSessionExpired,
    };
  }

  function callExpenseListFeature(method, ...args) {
    const feature = window.KakeiboExpenseListFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getExpenseListFeatureContext(), ...args);
    }
    return undefined;
  }

  function getExpensesFeatureContext() {
    return {
      state,
      els,
      memoMaxLength: MEMO_MAX_LENGTH,
      formatCurrency,
      payerLabels: PAYER_LABELS,
      getActiveTabName,
      rememberEditScrollContext,
      syncSplitModeUI,
      applySingleEntryValues,
      normalizeCategoryLabel,
      getPreferredCategoryFallback,
      paymentMethodLabel,
      getPersonalExpenseLabel,
      isDriveReceiptUrl,
      isGcsReceiptFileId,
      renderReceiptLinkedInfo,
      getReceiptAssets,
      renderSplitEntrySection,
      getExpenseAttentionMeta,
      setMessageState,
      resetForm,
      buildSingleEntryValues,
      calculateNetAmount,
      setText,
      buildReceiptFieldsFromDraft,
      getBillingTargetFromPaymentMethod,
      shouldShowFamilyCardWarning,
      truncateText,
      isAiReceiptSummaryMode,
      buildAiReceiptSummaryExpenses,
      isAiAllocationSplitMode,
      getSplitDifferenceAmount,
      createSplitEntry,
      enableSplitMode,
      disableSplitMode,
      applyAiReceiptSummaryDefaults,
      markAiField,
      getDefaultPaymentMethodForCurrentUser,
      canUseSharedStorage,
      ensureReceiptAssetStored,
      getPendingReceiptUploadJob,
      ensureAllExpensesLoaded,
      confirmPotentialDuplicateExpenses,
      saveSharedRecord,
      loadSharedRecord,
      showSyncToast,
      upsertExpenseListRecord,
      loadExpenseOverviewFromBackend,
      persist,
      renderAll,
      queueDeferredReceiptUpload,
      closeExpenseEditModal,
      closeEntryFlowModal,
      switchTab,
      normalizeExpense,
      buildExpenseUpdateSummary,
      getExpenseSyncFailureMessage,
      updateNetAmountPreview,
      restoreEditScrollContext,
      loadReceiptQueueItem,
      configureEntryFlowContent,
      focusEntryFlowPrimaryField,
      saveExpenseTemplateFromDraft,
    };
  }

  function callExpensesFeature(method, ...args) {
    const feature = window.KakeiboExpensesFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getExpensesFeatureContext(), ...args);
    }
    return undefined;
  }

  function getSearchFeatureContext() {
    return {
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
      collapsedLoadMoreStep: COLLAPSED_LOAD_MORE_STEP,
    };
  }

  function callSearchFeature(method, ...args) {
    const feature = window.KakeiboSearchFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getSearchFeatureContext(), ...args);
    }
    return undefined;
  }

  function getMonthlyCloseFeatureContext() {
    return {
      state,
      els,
      currentMonth,
      currentYear,
      todayISO,
      normalizeMonthlyCloseConfig,
      normalizeMonthlyCloseRecord,
      getDashboardExpenses,
      buildDashboardGroupActuals,
      getDashboardMonthlyFocusGroupKeys,
      getDashboardMonthlyGroupKeys,
      getDashboardAnnualGroupKeys,
      getDashboardBudgetConfig,
      buildProjectedAmount,
      getDaysInMonth,
      getCategoryIntegrityScanItemsFromExpenses,
      getDashboardUnassignedIssueRows,
      buildSettlementReportForRange,
      getSettlementTransferDraft,
      formatYearMonthLabel,
      formatCurrency,
      escapeHtml,
      setText,
      persist,
      canUseSharedStorage,
      saveSharedSettingsFields,
      userLabels: USER_LABELS,
    };
  }

  function callMonthlyCloseFeature(method, ...args) {
    const feature = window.KakeiboMonthlyCloseFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getMonthlyCloseFeatureContext(), ...args);
    }
    return undefined;
  }

  function callSettingsFeature(method, ...args) {
    const feature = window.KakeiboSettingsFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getSettingsFeatureContext(), ...args);
    }
    return undefined;
  }

  function bindSettingsActionButtons() {
    return callSettingsFeature("bindSettingsActionButtons");
  }

  function renderSettingsTabContent() {
    return callSettingsFeature("renderSettingsTabContent");
  }

  function renderExportYearOptions() {
    return callSettingsFeature("renderExportYearOptions");
  }

  function getTabsNavigationFeatureContext() {
    return {
      state,
      els,
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
      switchTab,
      onSharedTabActivation: (tabName) => callSharedBootstrapFeature("handleSharedTabActivation", tabName),
    };
  }

  function callTabsNavigationFeature(method, ...args) {
    const feature = window.KakeiboTabsNavigationFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getTabsNavigationFeatureContext(), ...args);
    }
    return undefined;
  }

  function getHomeDashboardFeatureContext() {
    return {
      state,
      els,
      currentMonth,
      currentYear,
      getDaysInMonth,
      formatCurrency,
      escapeHtml,
      buildStatusPillHtml,
      buildSummaryDetailAttributes,
      getDashboardDeltaText,
      setSummaryViewMode,
      switchTab,
      renderSummary,
      ensureAllExpensesLoaded,
      getSummaryDetailPayloadFromButton,
      openSummaryDetailModal,
      showSyncToast,
      bindExpenseCardEvents,
      getDashboardExpenseAmount,
    };
  }

  function callHomeDashboardFeature(method, ...args) {
    const feature = window.KakeiboHomeDashboardFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getHomeDashboardFeatureContext(), ...args);
    }
    return undefined;
  }

  function getSummaryDetailFeatureContext() {
    return {
      state,
      els,
      currentYear,
      currentMonth,
      setText,
      escapeHtml,
      truncateText,
      formatCurrency,
      sumAmounts,
      renderExpenseCardHtml,
      bindExpenseCardEvents,
      isFamilySummaryExpense,
      isFamilyCardExpense,
      getSettlementFamilyPayer,
      getDashboardExpenses,
      getDashboardExpenseAmount,
      getCategoryBudgetGroupKey,
      payerLabels: PAYER_LABELS,
      householdIncomeKindLabels: HOUSEHOLD_INCOME_KIND_LABELS,
      dashboardGroupLabels: DASHBOARD_GROUP_LABELS,
    };
  }

  function callSummaryDetailFeature(method, ...args) {
    const feature = window.KakeiboSummaryDetailFeature;
    const fn = feature?.[method];
    if (typeof fn === "function") {
      return fn(getSummaryDetailFeatureContext(), ...args);
    }
    return undefined;
  }

  function normalizeActivityLog(item) {
    if (!item || typeof item !== "object") return item;
    return {
      id: String(item.id || crypto.randomUUID()),
      timestamp: String(item.timestamp || item.createdAt || ""),
      actorEmail: String(item.actorEmail || item.createdBy || ""),
      action: String(item.action || ""),
      recordType: String(item.recordType || ""),
      collectionKey: String(item.collectionKey || ""),
      recordId: String(item.recordId || ""),
      serialCode: String(item.serialCode || ""),
      recordDate: String(item.recordDate || ""),
      recordName: String(item.recordName || ""),
      amount: Number(item.amount || 0),
    };
  }

  function prependActivityLog(entry) {
    const normalized = normalizeActivityLog(entry);
    if (!normalized?.id) return;
    state.activityLogs = [
      normalized,
      ...state.activityLogs.filter((item) => String(item?.id || "") !== normalized.id),
    ].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  }

  function formatActivityActionLabel(action) {
    if (action === "create") return "登録";
    if (action === "update") return "更新";
    if (action === "delete") return "削除";
    return action || "操作";
  }

  function formatDateTimeDisplay(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function setCategoryIntegrityScanStatus(message, tone = "idle") {
    state.categoryIntegrityScanStatus = String(message || "");
    state.categoryIntegrityScanStatusTone = tone || "idle";
    if (!els.categoryIntegrityScanStatus) return;
    els.categoryIntegrityScanStatus.textContent = state.categoryIntegrityScanStatus;
    els.categoryIntegrityScanStatus.className = "search-integrity-status muted small";
    if (tone === "running") {
      els.categoryIntegrityScanStatus.classList.add("is-running");
    } else if (tone === "success") {
      els.categoryIntegrityScanStatus.classList.add("is-success");
    } else if (tone === "error") {
      els.categoryIntegrityScanStatus.classList.add("is-error");
    }
  }

  async function rerunCategoryIntegrityScan() {
    const button = els.categoryIntegrityScanButton;
    if (button) {
      button.disabled = true;
      button.textContent = "再スキャン中...";
    }
    setCategoryIntegrityScanStatus("カテゴリ不整合スキャンを実行しています...", "running");
    try {
      if (!state.expensesLoaded) {
        const loaded = await ensureAllExpensesLoaded({ silent: true });
        if (!loaded) {
          throw new Error("支出データの読み込みに失敗したため、再スキャンできませんでした。");
        }
      }
      renderCategoryIntegrityScan();
      const issueCount = Array.isArray(state.categoryIntegrityScan) ? state.categoryIntegrityScan.length : 0;
      setCategoryIntegrityScanStatus(
        `再スキャン完了: ${state.expenses.length}件を確認し、${issueCount}カテゴリを要確認として表示しました。 (${formatDateTimeDisplay(new Date().toISOString())})`,
        "success"
      );
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "カテゴリ不整合スキャンの再実行に失敗しました。";
      setCategoryIntegrityScanStatus(`再スキャンに失敗しました: ${message}`, "error");
      console.error("Failed to rerun category integrity scan", error);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "再スキャン";
      }
    }
  }

  function renderActivityHistory() {
    if (!els.activityHistoryList) return;
    if (canUseSharedStorage() && state.activityLogsLoading) {
      els.activityHistoryList.innerHTML = '<p class="muted small">履歴を読み込み中です...</p>';
      return;
    }
    if (canUseSharedStorage() && !state.activityLogsLoaded) {
      els.activityHistoryList.innerHTML = '<p class="muted small">共有履歴を確認しています...</p>';
      return;
    }
    const logs = Array.isArray(state.activityLogs) ? state.activityLogs : [];
    if (!logs.length) {
      els.activityHistoryList.innerHTML = '<p class="muted small">まだ変更履歴はありません。</p>';
      return;
    }
    const visibleLogs = logs.slice(0, state.activityHistoryVisibleCount);
    els.activityHistoryList.innerHTML = visibleLogs.map((item) => `
      <article class="update-history-item">
        <div class="update-history-meta">
          <span class="update-history-version">${escapeHtml(formatActivityActionLabel(item.action))} / ${escapeHtml(item.recordType || "履歴")}</span>
          <span class="update-history-date">${escapeHtml(formatDateTimeDisplay(item.timestamp))}</span>
        </div>
        <p class="update-history-summary">
          ${escapeHtml(item.serialCode || "未採番")} / ${escapeHtml(item.recordName || "名称なし")} / ${escapeHtml(item.recordDate || "")}${item.amount ? ` / ${escapeHtml(formatCurrency(item.amount))}` : ""}
        </p>
        <p class="muted small">${escapeHtml(USER_LABELS[item.actorEmail] || item.actorEmail || "不明")} が実行</p>
      </article>
    `).join("") + buildLoadMoreButtonHtml("activityHistoryLoadMoreButton", state.activityHistoryVisibleCount, logs.length);
    els.activityHistoryList.querySelector("#activityHistoryLoadMoreButton")?.addEventListener("click", () => {
      state.activityHistoryVisibleCount += COLLAPSED_LOAD_MORE_STEP;
      renderActivityHistory();
    });
  }

  function hydrate() {
    try {
      clearLegacyTokenStorage();
      const storedSummaryViewMode = localStorage.getItem(SUMMARY_VIEW_MODE_KEY);
      if (storedSummaryViewMode === "monthly" || storedSummaryViewMode === "yearly") {
        state.summaryViewMode = ["monthly", "yearly", "settlement"].includes(storedSummaryViewMode) ? storedSummaryViewMode : "monthly";
      }
      state.pendingReceiptUploads = loadPendingReceiptUploadQueueStorage();
      state.rememberedSession = loadRememberedSessionStorage();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.expenses = Array.isArray(parsed.expenses) ? parsed.expenses.map(normalizeExpense) : [];
        state.expensesLoaded = true;
        state.transfers = Array.isArray(parsed.transfers) ? parsed.transfers.map(normalizeTransfer) : [];
        state.childTransactions = Array.isArray(parsed.childTransactions) ? parsed.childTransactions.map(normalizeChildTransaction) : [];
        state.householdIncomes = Array.isArray(parsed.householdIncomes) ? parsed.householdIncomes.map(normalizeHouseholdIncome) : [];
        state.activityLogs = Array.isArray(parsed.activityLogs) ? parsed.activityLogs.map(normalizeActivityLog) : [];
        state.activityLogsLoaded = false;
        state.activityLogsLoading = false;
        state.categories = mergeCategories(migrateLegacyChildRinCategories(Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES));
        state.categoryMasterConfig = getMigratedCategoryMasterConfig(parsed.categoryMasterConfig, state.categories);
        state.otherPaymentMethods = mergeOtherPaymentMethods(
          Array.isArray(parsed.otherPaymentMethods) && parsed.otherPaymentMethods.length
            ? parsed.otherPaymentMethods
            : DEFAULT_OTHER_PAYMENT_METHODS
        );
        state.dashboardBudgetConfig = normalizeDashboardBudgetConfig(parsed.dashboardBudgetConfig);
        state.settlementRules = normalizeSettlementRules(parsed.settlementRules);
        state.householdPoolConfig = normalizeHouseholdPoolConfig(parsed.householdPoolConfig);
        state.recurringTemplateConfig = normalizeRecurringTemplateConfig(parsed.recurringTemplateConfig);
        state.monthlyCloseConfig = normalizeMonthlyCloseConfig(parsed.monthlyCloseConfig);
        state.serialCounters = normalizeSerialCounters(parsed.serialCounters);
        state.summaryViewMode = ["monthly", "yearly", "settlement"].includes(parsed.summaryViewMode) ? parsed.summaryViewMode : "monthly";
        state.lastGoogleUser = parsed.lastGoogleUser || parsed.currentUser || null;
        const parsedCurrentUser = parsed.currentUser || null;
        const sessionIdToken = sessionStorage.getItem(SESSION_ID_TOKEN_KEY);
        const restoredIdToken = sessionIdToken || "";
        if (parsedCurrentUser?.provider === "google" && restoredIdToken) {
          state.currentUser = {
            ...parsedCurrentUser,
            idToken: restoredIdToken,
            authMode: String(parsedCurrentUser.authMode || "google_token").trim() || "google_token",
          };
        } else {
          state.currentUser = null;
          applyOptimisticRememberedSessionUser(parsedCurrentUser || state.lastGoogleUser);
        }
        state.storageMode = parsed.storageMode || "local";
      } else {
        applyOptimisticRememberedSessionUser(state.lastGoogleUser);
      }
    } catch (error) {
      console.error("hydrate failed", error);
    }
    // Drive フォルダをローカルストレージから読み込む
    const folderData = getDriveFolderStorage();
    if (folderData?.folderId) {
      state.driveFolderCache = folderData.folderId;
    }
    state.driveStatus.folder = state.driveFolderCache || config.drive?.folderId ? "configured" : "missing";
  }

  function clearLegacyTokenStorage() {
    try {
      localStorage.removeItem("kakeibo-google-id-token-persistent-v1");
      localStorage.removeItem(DRIVE_ACCESS_TOKEN_KEY);
    } catch (error) {
      console.warn("Failed to clear legacy token storage:", error);
    }
  }

  function normalizeRememberedSession(value) {
    if (!value || typeof value !== "object") return null;
    const sessionId = String(value.sessionId || "").trim();
    if (!sessionId) return null;
    const expiresAt = String(value.expiresAt || "").trim();
    if (expiresAt) {
      const expiresMs = Date.parse(expiresAt);
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
        return null;
      }
    }
    return {
      sessionId,
      expiresAt,
      email: String(value.email || "").trim().toLowerCase(),
      name: String(value.name || "").trim(),
      authMethod: String(value.authMethod || "cookie_session").trim() || "cookie_session",
      savedAt: String(value.savedAt || new Date().toISOString()).trim(),
    };
  }

  function loadRememberedSessionStorage() {
    try {
      const raw = localStorage.getItem(SESSION_REMEMBER_KEY);
      if (!raw) return null;
      const parsed = normalizeRememberedSession(JSON.parse(raw));
      if (!parsed) {
        localStorage.removeItem(SESSION_REMEMBER_KEY);
      }
      return parsed;
    } catch (error) {
      console.warn("Failed to load remembered session:", error);
      return null;
    }
  }

  function saveRememberedSessionStorage(value) {
    const normalized = normalizeRememberedSession(value);
    state.rememberedSession = normalized;
    try {
      if (!normalized) {
        localStorage.removeItem(SESSION_REMEMBER_KEY);
        scheduleSessionKeepalive();
        return;
      }
      localStorage.setItem(SESSION_REMEMBER_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.warn("Failed to save remembered session:", error);
    }
    scheduleSessionKeepalive();
  }

  function clearRememberedSessionStorage() {
    state.rememberedSession = null;
    try {
      localStorage.removeItem(SESSION_REMEMBER_KEY);
    } catch (error) {
      console.warn("Failed to clear remembered session:", error);
    }
    scheduleSessionKeepalive();
  }

  function clearSessionKeepaliveTimer() {
    if (_sessionKeepaliveTimer) {
      window.clearTimeout(_sessionKeepaliveTimer);
      _sessionKeepaliveTimer = null;
    }
  }

  function shouldKeepSessionAlive() {
    return Boolean(state.currentUser || state.rememberedSession || loadRememberedSessionStorage());
  }

  function scheduleSessionKeepalive(delayMs = SESSION_KEEPALIVE_INTERVAL_MS) {
    clearSessionKeepaliveTimer();
    if (!shouldKeepSessionAlive()) return;
    const normalizedDelay = Math.max(30000, Number(delayMs) || SESSION_KEEPALIVE_INTERVAL_MS);
    _sessionKeepaliveTimer = window.setTimeout(async () => {
      _sessionKeepaliveTimer = null;
      if (document.visibilityState === "visible" && navigator.onLine !== false) {
        await warmAuthSession({ force: true, background: true, source: "timer" }).catch(() => false);
      }
      scheduleSessionKeepalive();
    }, normalizedDelay);
  }

  async function warmAuthSession(options = {}) {
    if (!shouldKeepSessionAlive()) return false;
    if (navigator.onLine === false) return false;
    const minAgeMs = Math.max(0, Number(options.minAgeMs) || SESSION_REFRESH_THROTTLE_MS);
    if (!options.force && Date.now() - Number(state.lastSessionRefreshAt || 0) < minAgeMs) {
      return Boolean(state.currentUser);
    }
    return restoreBackendSession({
      silent: true,
      background: options.background !== false,
      skipBootstrap: true,
    });
  }

  function clearIdTokenRefreshTimer() {
    if (_idTokenRefreshTimer) {
      clearTimeout(_idTokenRefreshTimer);
      _idTokenRefreshTimer = null;
    }
  }

  function buildOptimisticSessionUser(sourceUser = null) {
    const remembered = state.rememberedSession || loadRememberedSessionStorage();
    if (!remembered?.sessionId) return null;
    const fallbackEmail = String(sourceUser?.email || state.lastGoogleUser?.email || "").trim().toLowerCase();
    const email = String(remembered.email || fallbackEmail).trim().toLowerCase();
    if (!email) return null;
    const fallbackName = USER_LABELS[email] || sourceUser?.name || state.lastGoogleUser?.name || email;
    return {
      email,
      name: String(remembered.name || fallbackName).trim() || email,
      provider: "google",
      idToken: "",
      authMode: String(remembered.authMethod || "cookie_session").trim() || "cookie_session",
    };
  }

  function applyOptimisticRememberedSessionUser(sourceUser = null) {
    const optimisticUser = buildOptimisticSessionUser(sourceUser);
    if (!optimisticUser) return false;
    state.currentUser = optimisticUser;
    state.lastGoogleUser = {
      email: optimisticUser.email,
      name: optimisticUser.name,
      provider: "google",
    };
    state.authSessionDiagnostics = state.authSessionDiagnostics || {
      cookiePresent: false,
      sessionFound: true,
      sessionValid: true,
      reason: "remembered_session",
    };
    state.autoLoginAttempted = true;
    return true;
  }

  function applyAuthenticatedUser(user, options = {}) {
    const email = String(user?.email || "").trim().toLowerCase();
    const name = String(user?.name || email).trim() || email;
    if (!email) return false;
    state.currentUser = {
      email,
      name,
      provider: "google",
      idToken: String(options.idToken || "").trim(),
      authMode: String(options.authMode || "cookie_session").trim() || "cookie_session",
    };
    state.lastGoogleUser = {
      email,
      name,
      provider: "google",
    };
    state.authSessionDiagnostics = {
      cookiePresent: true,
      sessionFound: true,
      sessionValid: true,
      reason: "authenticated",
    };
    if (options.sessionId || options.expiresAt || state.rememberedSession?.sessionId) {
      saveRememberedSessionStorage({
        sessionId: String(options.sessionId || state.rememberedSession?.sessionId || "").trim(),
        expiresAt: String(options.expiresAt || state.rememberedSession?.expiresAt || "").trim(),
        email,
        name,
        authMethod: String(options.authMode || "cookie_session").trim() || "cookie_session",
        savedAt: new Date().toISOString(),
      });
    }
    state.autoLoginAttempted = true;
    state.lastSessionRefreshAt = Date.now();
    scheduleSessionKeepalive();
    persist({ skipRemote: true });
    return true;
  }

  function markAuthSessionExpired(message = "") {
    clearIdTokenRefreshTimer();
    state.currentUser = null;
    state.authCheckInProgress = false;
    state.authSessionDiagnostics = null;
    resolveGoogleCredentialWaiters(false);
    sessionStorage.removeItem(SESSION_ID_TOKEN_KEY);
    clearSessionKeepaliveTimer();
    persist({ skipRemote: true });
    syncAuthUI();
    if (message) {
      setText(els.loginMessage, message);
    }
  }

  async function fetchBackendSessionStatus() {
    const headers = await getAuthHeaders({ includeContentType: false });
    const response = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        ...headers,
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || `セッション確認に失敗しました (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function establishBackendSession(credential) {
    const headers = await getAuthHeaders();
    const response = await fetch("/api/auth/session/google", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
      },
      body: JSON.stringify({ credential }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || `セッション開始に失敗しました (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function restoreBackendSessionFromRemember(options = {}) {
    const remembered = state.rememberedSession || loadRememberedSessionStorage();
    if (!remembered?.sessionId) return null;
    const response = await fetch("/api/auth/session/restore", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
      },
      body: JSON.stringify({ sessionId: remembered.sessionId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (!options.keepRememberedSessionOnFailure) {
        clearRememberedSessionStorage();
      }
      const error = new Error(payload?.error || `保存済みセッションの復元に失敗しました (${response.status})`);
      error.status = response.status;
      throw error;
    }
    const session = payload?.session && typeof payload.session === "object" ? payload.session : {};
    const user = payload?.user && typeof payload.user === "object" ? payload.user : {};
    saveRememberedSessionStorage({
      sessionId: String(session.sessionId || remembered.sessionId || "").trim(),
      expiresAt: String(session.expiresAt || remembered.expiresAt || "").trim(),
      email: String(user.email || remembered.email || "").trim().toLowerCase(),
      name: String(user.name || remembered.name || "").trim(),
      authMethod: String(session.authMethod || remembered.authMethod || "cookie_session").trim() || "cookie_session",
      savedAt: new Date().toISOString(),
    });
    return payload;
  }

  function applyAuthenticatedSessionPayload(payload) {
    if (!payload?.authenticated || !payload?.user?.email) return false;
    applyAuthenticatedUser(payload.user, {
      authMode: payload?.session?.authMethod || "cookie_session",
      sessionId: payload?.session?.sessionId || "",
      expiresAt: payload?.session?.expiresAt || "",
    });
    sessionStorage.removeItem(SESSION_ID_TOKEN_KEY);
    clearIdTokenRefreshTimer();
    state.authCheckInProgress = false;
    syncAuthUI();
    return true;
  }

  async function clearBackendSession() {
    const headers = await getAuthHeaders({ includeContentType: false });
    const response = await fetch("/api/auth/session", {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
      headers: {
        ...headers,
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
      },
    });
    return response.ok;
  }

  async function restoreBackendSession(options = {}) {
      if (_sessionRestorePromise && !options.forceNew) {
        return _sessionRestorePromise;
      }
      const restorePromise = (async () => {
      const restoreSequence = Number(state.sessionRestoreSequence || 0) + 1;
      state.sessionRestoreSequence = restoreSequence;
      const shouldShowAuthProgress = !state.currentUser && !options.background;
      if (shouldShowAuthProgress) {
        state.authCheckInProgress = true;
        syncAuthUI();
      }
      try {
        let payload = null;
        let fetchSessionError = null;
        try {
          payload = await fetchBackendSessionStatus();
        } catch (sessionError) {
          fetchSessionError = sessionError;
        }
        if ((!payload || !payload.authenticated) && state.rememberedSession?.sessionId) {
          try {
            payload = await restoreBackendSessionFromRemember({ keepRememberedSessionOnFailure: false });
          } catch (rememberError) {
            console.warn("restoreBackendSessionFromRemember failed", rememberError);
          }
        }
        if (!payload && fetchSessionError) {
          throw fetchSessionError;
        }
        if (restoreSequence !== state.sessionRestoreSequence) {
          return false;
        }
        state.authSessionDiagnostics = payload?.diagnostics && typeof payload.diagnostics === "object"
          ? payload.diagnostics
          : null;
        if (applyAuthenticatedSessionPayload(payload)) {
          state.lastSessionRefreshAt = Date.now();
          if (!options.skipBootstrap) {
            await callSharedBootstrapFeature("runPostLoginBootstrap", {
              silent: true,
              includePeripheral: false,
              skipInitialRender: true,
            });
          }
          return true;
        } else {
          state.currentUser = null;
          state.lastSessionRefreshAt = Date.now();
          persist({ skipRemote: true });
          return false;
        }
      } catch (error) {
        console.warn("restoreBackendSession failed", error);
        if (restoreSequence !== state.sessionRestoreSequence) {
          return false;
        }
        state.currentUser = null;
        persist({ skipRemote: true });
        state.lastSessionRefreshAt = Date.now();
        if (!options.silent) {
          setText(els.loginMessage, "Google セッションの確認に失敗しました。必要なら下の Google ボタンを押して再接続してください。");
        }
        return false;
      } finally {
        if (restoreSequence === state.sessionRestoreSequence) {
          state.authCheckInProgress = false;
          syncAuthUI();
          scheduleSessionKeepalive();
          renderAll();
        }
      }
    })().finally(() => {
      if (_sessionRestorePromise === restorePromise) {
        _sessionRestorePromise = null;
      }
    });
      _sessionRestorePromise = restorePromise;
      return restorePromise;
    }

  function persist(options = {}) {
    ensureSerialCodes();
    try {
      localStorage.setItem(SUMMARY_VIEW_MODE_KEY, ["monthly", "yearly", "settlement"].includes(state.summaryViewMode) ? state.summaryViewMode : "monthly");
    } catch (error) {
      console.warn("Failed to persist summary view mode:", error);
    }
    const currentUser = state.currentUser
      ? {
          email: state.currentUser.email,
          name: state.currentUser.name,
          provider: state.currentUser.provider,
        }
      : null;
    const lastGoogleUser = state.lastGoogleUser
      ? {
          email: state.lastGoogleUser.email,
          name: state.lastGoogleUser.name,
          provider: state.lastGoogleUser.provider,
        }
      : currentUser;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      expenses: state.expenses,
      transfers: state.transfers,
      childTransactions: state.childTransactions,
      activityLogs: state.activityLogs,
      categories: state.categories,
      categoryMasterConfig: state.categoryMasterConfig,
      otherPaymentMethods: state.otherPaymentMethods,
      serialCounters: state.serialCounters,
      dashboardBudgetConfig: state.dashboardBudgetConfig,
      settlementRules: state.settlementRules,
      recurringTemplateConfig: state.recurringTemplateConfig,
      monthlyCloseConfig: state.monthlyCloseConfig,
      summaryViewMode: state.summaryViewMode,
      currentUser,
      lastGoogleUser,
      storageMode: state.storageMode,
    }));
    if (!options.skipRemote && options.syncRemoteSnapshot === true) {
      scheduleSharedStateSync(options.reason || "save");
    }
  }

  function normalizePendingReceiptUploadMeta(item) {
    if (!item || typeof item !== "object") return null;
    const jobId = String(item.jobId || "").trim();
    if (!jobId) return null;
    const recordIds = Array.isArray(item.recordIds)
      ? item.recordIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (!recordIds.length) return null;
    return {
      jobId,
      recordIds,
      storageAssetId: String(item.storageAssetId || "").trim(),
      storageUploadedAt: String(item.storageUploadedAt || "").trim(),
      fileName: String(item.fileName || "レシート画像").trim() || "レシート画像",
      fileType: String(item.fileType || "").trim(),
      fileSize: Number(item.fileSize) || 0,
      fileContext: {
        date: String(item.fileContext?.date || "").trim(),
        storeName: String(item.fileContext?.storeName || "").trim(),
        category: String(item.fileContext?.category || "").trim(),
        memo: String(item.fileContext?.memo || "").trim(),
      },
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      attempts: Math.max(Number(item.attempts) || 0, 0),
      status: ["queued", "uploading", "needs_auth", "retryable_error", "failed"].includes(String(item.status || ""))
        ? String(item.status)
        : "queued",
      lastError: String(item.lastError || "").trim(),
    };
  }

  function getPendingReceiptUploadTimestamp(item) {
    const candidates = [
      item?.createdAt,
      item?.updatedAt,
      item?.storageUploadedAt,
    ];
    for (const value of candidates) {
      const timestamp = Date.parse(String(value || ""));
      if (Number.isFinite(timestamp)) return timestamp;
    }
    return 0;
  }

  function isExpiredPendingReceiptUpload(item) {
    const timestamp = getPendingReceiptUploadTimestamp(item);
    return timestamp > 0 && Date.now() - timestamp > PENDING_RECEIPT_UPLOAD_RETENTION_MS;
  }

  function cleanupExpiredPendingReceiptUploadBlobs(jobIds = []) {
    const uniqueJobIds = [...new Set((jobIds || []).map((jobId) => String(jobId || "").trim()).filter(Boolean))];
    if (!uniqueJobIds.length) return;
    window.setTimeout(() => {
      uniqueJobIds.forEach((jobId) => {
        deletePendingReceiptUploadBlob(jobId).catch((error) => {
          console.warn("Failed to cleanup expired pending receipt blob:", error);
        });
      });
    }, 0);
  }

  function loadPendingReceiptUploadQueueStorage() {
    try {
      const raw = localStorage.getItem(PENDING_RECEIPT_UPLOAD_QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const normalized = Array.isArray(parsed)
        ? parsed.map(normalizePendingReceiptUploadMeta).filter(Boolean)
        : [];
      const expiredJobIds = normalized
        .filter(isExpiredPendingReceiptUpload)
        .map((item) => item.jobId);
      const retained = normalized.filter((item) => !isExpiredPendingReceiptUpload(item));
      if (expiredJobIds.length || retained.length !== normalized.length) {
        localStorage.setItem(PENDING_RECEIPT_UPLOAD_QUEUE_KEY, JSON.stringify(retained));
        cleanupExpiredPendingReceiptUploadBlobs(expiredJobIds);
      }
      return retained;
    } catch (error) {
      console.warn("Failed to load pending receipt uploads:", error);
      return [];
    }
  }

  function savePendingReceiptUploadQueueStorage() {
    try {
      localStorage.setItem(
        PENDING_RECEIPT_UPLOAD_QUEUE_KEY,
        JSON.stringify((state.pendingReceiptUploads || []).map(normalizePendingReceiptUploadMeta).filter(Boolean))
      );
    } catch (error) {
      console.warn("Failed to save pending receipt uploads:", error);
    }
  }

  function openReceiptUploadDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("このブラウザはレシート再送キューの一時保存に対応していません。"));
        return;
      }
      const request = window.indexedDB.open(RECEIPT_UPLOAD_DB_NAME, RECEIPT_UPLOAD_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECEIPT_UPLOAD_STORE_NAME)) {
          db.createObjectStore(RECEIPT_UPLOAD_STORE_NAME, { keyPath: "jobId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("レシート再送キューDBを開けませんでした。"));
    });
  }

  async function putPendingReceiptUploadBlob(jobId, file) {
    const db = await openReceiptUploadDb();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(RECEIPT_UPLOAD_STORE_NAME, "readwrite");
        const store = transaction.objectStore(RECEIPT_UPLOAD_STORE_NAME);
        const request = store.put({ jobId, file });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error || new Error("レシート画像の一時保存に失敗しました。"));
      });
    } finally {
      db.close();
    }
  }

  async function getPendingReceiptUploadBlob(jobId) {
    const db = await openReceiptUploadDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(RECEIPT_UPLOAD_STORE_NAME, "readonly");
        const store = transaction.objectStore(RECEIPT_UPLOAD_STORE_NAME);
        const request = store.get(jobId);
        request.onsuccess = () => resolve(request.result?.file || null);
        request.onerror = () => reject(request.error || new Error("レシート画像の一時データ読込に失敗しました。"));
      });
    } finally {
      db.close();
    }
  }

  async function deletePendingReceiptUploadBlob(jobId) {
    const db = await openReceiptUploadDb();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(RECEIPT_UPLOAD_STORE_NAME, "readwrite");
        const store = transaction.objectStore(RECEIPT_UPLOAD_STORE_NAME);
        const request = store.delete(jobId);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error || new Error("レシート画像の一時データ削除に失敗しました。"));
      });
    } finally {
      db.close();
    }
  }

  function getDriveAccessTokenStorage() {
    try {
      const raw = sessionStorage.getItem(DRIVE_ACCESS_TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveDriveAccessTokenStorage(accessToken, expiresInSeconds) {
    if (!accessToken) return;
    const expiresAt = Date.now() + (Math.max(Number(expiresInSeconds) || 0, 300) * 1000);
    sessionStorage.setItem(DRIVE_ACCESS_TOKEN_KEY, JSON.stringify({
      accessToken,
      expiresAt,
      savedAt: new Date().toISOString(),
      email: state.currentUser?.email || "",
    }));
  }

  function clearDriveAccessTokenStorage() {
    sessionStorage.removeItem(DRIVE_ACCESS_TOKEN_KEY);
    try {
      localStorage.removeItem(DRIVE_ACCESS_TOKEN_KEY);
    } catch (error) {
      console.warn("Failed to clear legacy drive token:", error);
    }
  }

  function getCachedDriveAccessToken() {
    const cached = getDriveAccessTokenStorage();
    if (!cached?.accessToken || !cached?.expiresAt) return "";
    const belongsToCurrentUser = !cached.email || cached.email === (state.currentUser?.email || "");
    if (!belongsToCurrentUser) return "";
    if (Number(cached.expiresAt) <= Date.now() + 60 * 1000) return "";
    return String(cached.accessToken || "");
  }

  function bindEvents() {
    callTabsNavigationFeature("bindTabButtons");
    els.logoutButton?.addEventListener("click", logout);
    els.reloadLatestDataButton?.addEventListener("click", () => {
      reloadLatestSharedData({ interactive: true }).catch((error) => {
        console.error("reloadLatestSharedData failed", error);
        showSyncToast("最新データの再読み込みに失敗しました。", "error", { duration: 3200 });
      });
    });
    els.quickEntryImageButton?.addEventListener("click", () => launchEntryMode("image"));
    els.quickEntryTextButton?.addEventListener("click", () => launchEntryMode("text"));
    els.quickEntryManualButton?.addEventListener("click", () => launchEntryMode("manual"));
    els.backToQuickStartButton?.addEventListener("click", () => {
      document.getElementById("topEntryQuickActions")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    els.entryFlowModalClose?.addEventListener("click", () => closeEntryFlowModal());
    els.entryFlowModal?.addEventListener("click", (event) => {
      if (event.target === els.entryFlowModal) closeEntryFlowModal();
    });

    els.receiptCameraButton?.addEventListener("click", () => openReceiptInput("camera"));
    els.receiptFileButton?.addEventListener("click", () => openReceiptInput("file"));
    els.receiptMoreToggle?.addEventListener("click", toggleReceiptMoreActions);
    els.receiptCameraAddButton?.addEventListener("click", () => openReceiptInput("camera"));
    els.receiptFileAddButton?.addEventListener("click", () => openReceiptInput("file"));
    els.receiptCameraFile?.addEventListener("change", onReceiptFileChange);
    els.receiptFile?.addEventListener("change", onReceiptFileChange);
    els.editReceiptFileButton?.addEventListener("click", () => els.editReceiptFile?.click());
    els.editReceiptFile?.addEventListener("change", onEditReceiptFileChange);
    els.clearReceiptButton?.addEventListener("click", clearReceiptDraft);
    els.aiAnalyzeButton?.addEventListener("click", () => analyzeReceipt({ automatic: false, source: "manual" }));
    els.orderMailAnalyzeButton?.addEventListener("click", analyzeOrderMailText);
    els.geminiModelOption?.addEventListener("change", updateGeminiModelNotice);
    els.retryPendingReceiptUploadsButton?.addEventListener("click", () => {
      retryPendingReceiptUploads({ interactive: true });
    });
    updateGeminiModelNotice();
    els.aiErrorModalClose?.addEventListener("click", hideAiErrorModal);
    els.aiErrorModal?.addEventListener("click", (event) => {
      if (event.target === els.aiErrorModal) hideAiErrorModal();
    });

    els.expenseForm?.addEventListener("submit", onExpenseSubmit);
    els.expenseSaveButton?.addEventListener("click", (event) => {
      event.preventDefault();
      triggerExpenseSave("click");
    });
    els.expenseSaveButton?.addEventListener("touchend", (event) => {
      event.preventDefault();
      triggerExpenseSave("touchend");
    }, { passive: false });
    els.transferForm?.addEventListener("submit", onTransferSubmit);
    els.transferDeleteButton?.addEventListener("click", () => {
      deleteCurrentTransfer();
    });
    els.householdIncomeForm?.addEventListener("submit", onHouseholdIncomeSubmit);
    els.householdIncomeDeleteButton?.addEventListener("click", () => {
      deleteCurrentHouseholdIncome();
    });
    els.childForm?.addEventListener("submit", onChildSubmit);
    els.childDeleteButton?.addEventListener("click", () => {
      deleteCurrentChildTransaction();
    });
      els.splitModeToggle?.addEventListener("click", () => {
        if (state.splitMode) {
          disableSplitMode();
          return;
        }
      enableSplitMode();
      });
      els.splitAddLineButton?.addEventListener("click", addSplitEntry);
      els.splitReceiptTotal?.addEventListener("input", autoFillFamilyAmount);
      [els.splitHusbandAmount, els.splitWifeAmount]
        .filter(Boolean)
        .forEach((input) => input.addEventListener("input", autoFillFamilyAmount));
      [els.splitSummaryPaymentMethod, els.splitSummaryPayer]
        .filter(Boolean)
        .forEach((input) => input.addEventListener("change", syncAiReceiptSummaryPaymentFields));
      els.splitEntryList?.addEventListener("input", onSplitEntryInput);
      els.splitEntryList?.addEventListener("change", onSplitEntryInput);
      els.splitEntryList?.addEventListener("click", onSplitEntryClick);
    els.paymentMethod?.addEventListener("change", onPaymentMethodChange);
    els.payer?.addEventListener("change", updateFamilyCardWarning);
    els.deleteEntryButton?.addEventListener("click", () => {
      deleteCurrentExpense();
    });
    els.newEntryButton?.addEventListener("click", resetForm);
    els.expenseTemplateLoadButton?.addEventListener("click", openExpenseTemplatePicker);
    els.expenseTemplateModalClose?.addEventListener("click", closeExpenseTemplatePicker);
    els.expenseTemplateStatusMonth?.addEventListener("change", renderExpenseTemplatePicker);
    els.expenseTemplateModal?.addEventListener("click", (event) => {
      if (event.target === els.expenseTemplateModal) closeExpenseTemplatePicker();
    });
    els.expenseEditModalClose?.addEventListener("click", () => closeExpenseEditModal());
    els.expenseEditModal?.addEventListener("click", (event) => {
      if (event.target === els.expenseEditModal) closeExpenseEditModal();
    });
    els.expenseGroupEditModalClose?.addEventListener("click", () => closeExpenseGroupEditModal());
    els.expenseGroupEditModal?.addEventListener("click", (event) => {
      if (event.target === els.expenseGroupEditModal) closeExpenseGroupEditModal();
    });
    els.expenseGroupEditSaveButton?.addEventListener("click", () => {
      saveExpenseGroupEdits().catch((error) => {
        console.error("saveExpenseGroupEdits failed", error);
        showSyncToast("分割レシートの保存に失敗しました。", "error", { duration: 3200 });
      });
    });
    els.crossBurdenModalClose?.addEventListener("click", () => closeCrossBurdenModal());
    els.crossBurdenModal?.addEventListener("click", (event) => {
      if (event.target === els.crossBurdenModal) closeCrossBurdenModal();
    });
    els.expenseForm?.addEventListener("input", clearAiHighlightFromEvent);
    els.expenseForm?.addEventListener("change", clearAiHighlightFromEvent);

    els.summaryCurrentMonthButton?.addEventListener("click", () => {
      if (els.summaryYear) els.summaryYear.value = currentYear();
      if (els.summaryMonth) els.summaryMonth.value = currentMonth();
      renderSummary();
    });
    els.summaryCurrentYearButton?.addEventListener("click", () => {
      if (els.summaryYear) els.summaryYear.value = currentYear();
      if (els.summaryMonth) els.summaryMonth.value = currentMonth();
      renderSummary();
    });
    els.summaryDataRetryButton?.addEventListener("click", () => {
      retrySharedBootstrap({ interactive: true }).catch((error) => {
        console.error("retrySharedBootstrap failed", error);
        showSyncToast("共有データの再読み込みに失敗しました。", "error", { duration: 3200 });
      });
    });
    els.summaryMonth?.addEventListener("change", handleSummaryMonthChange);
    els.summaryYear?.addEventListener("change", () => {
      const year = els.summaryYear?.value || currentYear();
      if (els.summarySettlementYear && !els.summarySettlementYear.value) els.summarySettlementYear.value = year;
      renderSummary();
    });
    els.summaryModeMonthlyButton?.addEventListener("click", () => setSummaryViewMode("monthly"));
    els.summaryModeYearlyButton?.addEventListener("click", () => setSummaryViewMode("yearly"));
    els.summaryModeSettlementButton?.addEventListener("click", () => setSummaryViewMode("settlement"));
    document.getElementById("tab-summary")?.addEventListener("click", handleSummaryDetailClick);
    els.dashboardBudgetMonthlyGroupList?.addEventListener("input", renderDashboardBudgetForm);
    els.dashboardBudgetAnnualGroupList?.addEventListener("input", renderDashboardBudgetForm);
    els.dashboardBudgetOpenButton?.addEventListener("click", openDashboardBudgetModal);
    els.dashboardBudgetModalClose?.addEventListener("click", closeDashboardBudgetModal);
    els.dashboardBudgetModalCancel?.addEventListener("click", closeDashboardBudgetModal);
    els.dashboardBudgetModal?.addEventListener("click", (event) => {
      if (event.target === els.dashboardBudgetModal) closeDashboardBudgetModal();
    });
    els.dashboardBudgetSaveButton?.addEventListener("click", saveDashboardBudgetConfig);
    bindSettingsActionButtons();
    [els.summarySettlementYear]
      .filter(Boolean)
      .forEach((input) => input.addEventListener("change", renderSummary));
    els.summarySettlementCurrentYearButton?.addEventListener("click", () => {
      if (els.summarySettlementYear) els.summarySettlementYear.value = currentYear();
      renderSummary();
    });
    els.summarySettlementApplyTransferButton?.addEventListener("click", applySettlementTransferDraftToForm);
    els.monthlyCloseSaveButton?.addEventListener("click", saveMonthlyCloseRecord);
    els.monthlyCloseReopenButton?.addEventListener("click", reopenMonthlyCloseRecord);
    els.monthlyCloseSearchIssuesButton?.addEventListener("click", () => openSearchTabForCategory("", { focusScan: true }));
    els.monthlyCloseSettlementButton?.addEventListener("click", () => openSettlementReportForMonth(els.summaryMonth?.value || currentMonth()));
    els.dashboardUnassignedSearchButton?.addEventListener("click", () => openSearchTabForCategory("", { focusScan: true }));
    els.dashboardUnassignedSettingsButton?.addEventListener("click", openSettingsTabForUpdateHistory);
    [els.filterKeyword, els.filterStartDate, els.filterEndDate, els.filterStore, els.filterCategory, els.filterPayer, els.filterPaymentMethod, els.filterFamilyCard]
      .filter(Boolean)
      .forEach((input) => input.addEventListener("input", handleSearchFilterInput));
    els.categoryIntegrityScanButton?.addEventListener("click", () => {
      rerunCategoryIntegrityScan();
    });
    [els.transferFilterStartMonth, els.transferFilterEndMonth]
      .filter(Boolean)
      .forEach((input) => input.addEventListener("input", renderTransferList));
    [els.householdIncomeFilterStartMonth, els.householdIncomeFilterEndMonth]
      .filter(Boolean)
      .forEach((input) => input.addEventListener("input", renderHouseholdIncomeList));
    [els.childFilterStartMonth, els.childFilterEndMonth]
      .filter(Boolean)
      .forEach((input) => input.addEventListener("input", handleChildFilterInput));

    els.exportSettingsButton?.addEventListener("click", () => {
      exportSelectedYearToXlsx();
    });
    els.exportZipButton?.addEventListener("click", () => {
      exportAllDataToCsvZip();
    });
    els.driveFolderPickButton?.addEventListener("click", onDriveFolderPick);
    els.driveFolderClearButton?.addEventListener("click", onDriveFolderClear);
    els.driveReceiptSyncButton?.addEventListener("click", syncStoredReceiptsToDrive);
    els.enablePushButton?.addEventListener("click", enablePushNotifications);
    els.disablePushButton?.addEventListener("click", disablePushNotifications);
    els.importJsonFile?.addEventListener("change", onImportFileSelected);
    els.importJsonButton?.addEventListener("click", importPendingJsonData);
    els.amount?.addEventListener("input", updateNetAmountPreview);
    els.pointCredit?.addEventListener("input", updateNetAmountPreview);
    els.personalExpense?.addEventListener("input", updateNetAmountPreview);
  }

  function resetHistoryFilters() {
    if (els.transferFilterStartMonth) els.transferFilterStartMonth.value = "";
    if (els.transferFilterEndMonth) els.transferFilterEndMonth.value = "";
    if (els.householdIncomeFilterStartMonth) els.householdIncomeFilterStartMonth.value = "";
    if (els.householdIncomeFilterEndMonth) els.householdIncomeFilterEndMonth.value = "";
    if (els.childFilterStartMonth) els.childFilterStartMonth.value = "";
    if (els.childFilterEndMonth) els.childFilterEndMonth.value = "";
    state.childVisibleCount = COLLAPSED_INITIAL_COUNT;
  }

  function handleSearchFilterInput() {
    state.searchResultsVisibleCount = COLLAPSED_INITIAL_COUNT;
    renderSearchResults();
    if (canUseSharedStorage() && state.expensesLoaded && !state.expensesLoading) {
      if (shouldRefreshAllExpenses()) {
        ensureAllExpensesLoaded({ silent: true, forceRefresh: true }).then((loaded) => {
          if (loaded) renderSearchResults();
        });
      }
    }
  }

  function shouldRefreshAllExpenses(maxAgeMs = 30000) {
    if (!state.expensesLoaded) return false;
    const lastLoadedAt = Number(state.expensesLastLoadedAt || 0);
    return !lastLoadedAt || (Date.now() - lastLoadedAt > maxAgeMs);
  }

  function setSummaryViewMode(mode, options = {}) {
    const nextMode = mode === "yearly" ? "yearly" : mode === "settlement" ? "settlement" : "monthly";
    if (state.summaryViewMode === nextMode && !options.force) return;
    state.summaryViewMode = nextMode;
    renderSummaryViewMode();
    persist({ skipRemote: true });
    if (!options.skipRender) {
      renderSummary();
    }
  }

  function renderSummaryViewMode() {
    const isMonthly = state.summaryViewMode === "monthly";
    const isYearly = state.summaryViewMode === "yearly";
    const isSettlement = state.summaryViewMode === "settlement";
    els.summaryModeMonthlyButton?.classList.toggle("active", isMonthly);
    els.summaryModeYearlyButton?.classList.toggle("active", isYearly);
    els.summaryModeSettlementButton?.classList.toggle("active", isSettlement);
    if (els.summaryModeMonthlyButton) els.summaryModeMonthlyButton.setAttribute("aria-selected", isMonthly ? "true" : "false");
    if (els.summaryModeYearlyButton) els.summaryModeYearlyButton.setAttribute("aria-selected", isYearly ? "true" : "false");
    if (els.summaryModeSettlementButton) els.summaryModeSettlementButton.setAttribute("aria-selected", isSettlement ? "true" : "false");
    els.summaryMonthlyControls?.classList.toggle("hidden", !isMonthly);
    els.summaryYearlyControls?.classList.toggle("hidden", !isYearly);
    els.summarySettlementControls?.classList.toggle("hidden", !isSettlement);
    els.summaryMonthlyPanel?.classList.toggle("hidden", !isMonthly);
    els.summaryYearlyPanel?.classList.toggle("hidden", !isYearly);
    els.summarySettlementPanel?.classList.toggle("hidden", !isSettlement);
  }

  function handleChildFilterInput() {
    state.childVisibleCount = COLLAPSED_INITIAL_COUNT;
    renderChildTransactionList();
  }

  function buildLoadMoreButtonHtml(buttonId, visibleCount, totalCount, step = COLLAPSED_LOAD_MORE_STEP) {
    if (totalCount <= visibleCount) return "";
    const nextCount = Math.min(step, totalCount - visibleCount);
    return `
      <div class="load-more-row">
        <button id="${buttonId}" class="ghost-button load-more-button" type="button">さらに${nextCount}件表示</button>
      </div>
    `;
  }

  function buildPagedLoadMoreButtonHtml(buttonId, hasMore, loading) {
    if (!hasMore && !loading) return "";
    return `
      <div class="load-more-row">
        <button id="${buttonId}" class="ghost-button load-more-button" type="button" ${loading ? "disabled" : ""}>
          ${loading ? "読み込み中..." : `さらに${EXPENSE_LIST_PAGE_SIZE}件読み込む`}
        </button>
      </div>
    `;
  }

  function renderSelectOptions() {
    state.categoryMasterConfig = getMigratedCategoryMasterConfig(state.categoryMasterConfig, state.categories);
    state.categories = getSelectableCategoryLabels(state.categoryMasterConfig, state.categories);
    state.otherPaymentMethods = mergeOtherPaymentMethods(state.otherPaymentMethods);
      fillSelect(els.category, state.categories, true);
      fillSelect(els.splitSummaryCategory, state.categories, true);
      fillSelect(els.filterCategory, state.categories, false, "すべて");
      fillSelect(els.paymentMethod, PAYMENT_METHODS.map((item) => item.value), true, null, PAYMENT_METHODS);
      fillSelect(els.splitSummaryPaymentMethod, PAYMENT_METHODS.map((item) => item.value), true, null, PAYMENT_METHODS);
      fillSelect(els.filterPaymentMethod, PAYMENT_METHODS.map((item) => item.value), false, "すべて", PAYMENT_METHODS);
      fillSelect(els.otherPaymentMethod, state.otherPaymentMethods, false, "選択してください");
      fillSelect(els.splitSummaryOtherPaymentMethod, state.otherPaymentMethods, false, "選択してください");
      renderExportYearOptions();
      if (state.splitMode) renderSplitEntrySection();
    updateDriveFolderLabel();
  }

  function fillSelect(select, values, required, emptyLabel = "選択してください", labeledSource = null) {
    if (!select) return;
    const current = select.value;
    const options = [];
    if (!required) {
      options.push(`<option value="">${emptyLabel}</option>`);
    }

    values.forEach((value) => {
      const normalized = typeof value === "string" ? value : value.value;
      const label = labeledSource
        ? (labeledSource.find((item) => item.value === normalized)?.label || normalized)
        : normalized;
      options.push(`<option value="${escapeHtml(normalized)}">${escapeHtml(label)}</option>`);
    });

    select.innerHTML = options.join("");
    if (current) select.value = current;
    if ((select === els.category || select === els.splitSummaryCategory || select === els.filterCategory)
      && !Array.from(select.options).some((option) => option.value === "日用品")) {
      const option = document.createElement("option");
      option.value = "日用品";
      option.textContent = "日用品";
      const insertBeforeIndex = required ? 2 : 3;
      select.insertBefore(option, select.options[insertBeforeIndex] || null);
      if (current === "日用品") select.value = current;
    }
  }

  function switchTab(tabName) {
    return callTabsNavigationFeature("switchTab", tabName);
  }

  function applyStartupRouteFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const tab = String(params.get("tab") || "").trim();
    const focus = String(params.get("focus") || "").trim();
    const category = String(params.get("category") || "").trim();
    if (!tab) return false;
    if (tab === "search") {
      openSearchTabForCategory(category, { focusScan: focus === "category-scan" || !category });
      return true;
    }
    switchTab(tab);
    if (tab === "settings" && focus === "update-history") {
      window.setTimeout(() => {
        document.getElementById("updateHistoryList")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 220);
    }
    return true;
  }

  function isOtherPaymentMethod(paymentMethod) {
    return paymentMethod === "husband_other" || paymentMethod === "wife_other" || paymentMethod === "other";
  }

  function normalizePayerCode(payer) {
    if (payer === "夫") return "husband";
    if (payer === "妻") return "wife";
    return payer === "wife" ? "wife" : "husband";
  }

  function normalizePaymentMethodCode(paymentMethod, payer = "husband") {
    if (paymentMethod === "夫カード") return "husband_card";
    if (paymentMethod === "妻カード") return "wife_card";
    if (paymentMethod === "夫その他") return "husband_other";
    if (paymentMethod === "妻その他") return "wife_other";
    if (paymentMethod === "family_card") return "husband_card";
    if (paymentMethod === "cash" || paymentMethod === "husband_cash") return "husband_other";
    if (paymentMethod === "wife_cash") return "wife_other";
    if (paymentMethod === "other") return payer === "wife" ? "wife_other" : "husband_other";
    return paymentMethod;
  }

  function normalizeOtherPaymentMethodLabel(value) {
    return String(value || "").trim();
  }

  function normalizeCategoryCode(code, label = "") {
    const normalizedLabel = normalizeCategoryLabel(label || code);
    if (normalizedLabel && CATEGORY_CODE_MAP[normalizedLabel]) return CATEGORY_CODE_MAP[normalizedLabel];
    const rawCode = String(code || "").trim();
    if (rawCode === "child_child_daily" || rawCode === "child_child_expense") return "daily_goods";
    if (rawCode === "medical_birth_special" || rawCode === "birth_medical_special") return "medical";
    if (rawCode === "utility_electricity" || rawCode === "utility_gas") return "utilities_home";
    if (rawCode === "car_maintenance" || rawCode === "car_insurance" || rawCode === "car_tax" || rawCode === "vehicle_maintenance_total") {
      return "vehicle_maintenance_total";
    }
    if (rawCode === "child_child_special") return "child_child_special";
    return rawCode || makeStableCode(normalizedLabel, "custom");
  }

  function getDefaultCategorySortOrder(label) {
    const normalizedLabel = normalizeCategoryLabel(label);
    return Number(CATEGORY_SORT_ORDER_MAP[normalizedLabel] || 0);
  }

  function normalizeDashboardBudgetGroupKey(key) {
    const value = String(key || "").trim();
    if (value === "medical_birth_special" || value === "birth_medical_special") return "medical_regular";
    if (value === "specialAnnualBudget") return "child_child_special";
    if (value === "car_tax_insurance") return "vehicle_maintenance_total";
    return value;
  }

  function normalizeTransferType() {
    return "transfer";
  }

  function normalizeTransferSettlementScope(value) {
    return value === "household_pool" ? "household_pool" : "private_lending";
  }

  function getTransferSettlementScopeLabel(value) {
    const scope = normalizeTransferSettlementScope(value);
    return TRANSFER_SETTLEMENT_SCOPE_LABELS[scope] || scope;
  }

  function normalizeSerialCounters(value) {
    const counters = value && typeof value === "object" ? value : {};
    return Object.entries(counters).reduce((next, [key, item]) => {
      const count = Number(item);
      if (!Number.isFinite(count) || count < 0) return next;
      next[key] = Math.floor(count);
      return next;
    }, {});
  }

  function getDefaultDashboardBudgetConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_BUDGET_CONFIG));
  }

  function normalizeDashboardBudgetConfig(value) {
    const defaults = getDefaultDashboardBudgetConfig();
    const raw = value && typeof value === "object" ? value : {};
    const monthlySource = raw.monthlyBudgetGroups && typeof raw.monthlyBudgetGroups === "object"
      ? raw.monthlyBudgetGroups
      : {};
    const annualSource = raw.annualBudgetGroups && typeof raw.annualBudgetGroups === "object"
      ? raw.annualBudgetGroups
      : {};
    const legacyCoreSource = raw.coreMonthlyBudgets && typeof raw.coreMonthlyBudgets === "object"
      ? raw.coreMonthlyBudgets
      : {};
    const rawVersion = Number(raw.version) || 0;
    const monthlyBudgetGroups = Object.fromEntries(
      Object.keys(defaults.monthlyBudgetGroups).map((key) => {
        if (key === "daily_goods" && rawVersion < defaults.version) {
          const directAmount = Number(monthlySource.daily_goods);
          if (Number.isFinite(directAmount) && Math.round(directAmount) !== 25000) return [key, Math.round(directAmount)];
          const legacyAmount = Number(
            monthlySource.child_child_daily
              ?? monthlySource.child_child_expense
              ?? legacyCoreSource.child_child_daily
              ?? legacyCoreSource.child_child_expense
          );
          if (Number.isFinite(legacyAmount)) return [key, Math.round(legacyAmount)];
          return [key, defaults.monthlyBudgetGroups[key] || 0];
        }
        const directAmount = Number(monthlySource[key]);
        if (Number.isFinite(directAmount)) return [key, Math.round(directAmount)];
        const legacyAmount = Number(legacyCoreSource[key]);
        if (Number.isFinite(legacyAmount)) return [key, Math.round(legacyAmount)];
        return [key, defaults.monthlyBudgetGroups[key] || 0];
      })
    );
    const annualBudgetGroups = Object.fromEntries(
      Object.keys(defaults.annualBudgetGroups).map((key) => {
        if (key === "vehicle_maintenance_total") {
          const directAmount = Number(annualSource.vehicle_maintenance_total);
          if (Number.isFinite(directAmount)) return [key, Math.round(directAmount)];
          const legacyAmount = Number(annualSource.car_tax_insurance);
          if (Number.isFinite(legacyAmount)) return [key, Math.round(legacyAmount)];
          return [key, defaults.annualBudgetGroups[key] || 0];
        }
        const amount = Number(annualSource[key]);
        return [key, Number.isFinite(amount) ? Math.round(amount) : defaults.annualBudgetGroups[key] || 0];
      })
    );
    return {
      version: Math.max(rawVersion, defaults.version),
      monthlyBudgetGroups,
      annualBudgetGroups,
      excludedAnnualGroups: [],
    };
  }

  function getDefaultCategoryMasterConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORY_MASTER_CONFIG));
  }

  function migrateLegacyChildRinCategories(categories = []) {
    const migrated = [];
    (categories || []).forEach((category) => {
      const rawLabel = String(category || "").trim();
      if (!rawLabel) return;
      const normalizedLabel = normalizeCategoryLabel(rawLabel);
      if (!normalizedLabel) return;
      if (!migrated.includes(normalizedLabel)) migrated.push(normalizedLabel);
    });
    return migrated;
  }

  function getDefaultSettlementRules() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTLEMENT_RULES));
  }

  function getDefaultRecurringTemplateConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_RECURRING_TEMPLATE_CONFIG));
  }

  function getDefaultMonthlyCloseConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_MONTHLY_CLOSE_CONFIG));
  }

  function getDefaultHouseholdPoolConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_HOUSEHOLD_POOL_CONFIG));
  }

  function buildFallbackCategoryMetaFromLabel(label, sortOrder = 9990) {
    const normalizedLabel = normalizeCategoryLabel(label);
    const code = normalizeCategoryCode(CATEGORY_CODE_MAP[normalizedLabel] || makeStableCode(normalizedLabel, "custom"), normalizedLabel);
    return {
      code,
      label: normalizedLabel,
      active: true,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : getDefaultCategorySortOrder(normalizedLabel) || 9990,
      bucket: "uncategorized",
      budgetMode: "none",
      settlementScope: "family",
      budgetGroupKey: CATEGORY_BUDGET_GROUP_KEY_MAP[code] || "",
    };
  }

  function normalizeCategoryMasterEntry(entry, index) {
    const base = buildFallbackCategoryMetaFromLabel(entry?.label || entry?.code || `カテゴリ${index + 1}`, (index + 1) * 10);
    const label = normalizeCategoryLabel(entry?.label || entry?.code || base.label) || base.label;
    const code = normalizeCategoryCode(entry?.code || base.code, label);
    const rawLabel = String(entry?.label || "").trim();
    const rawCode = String(entry?.code || "").trim();
    const hasLegacyAlias = rawLabel !== label || normalizeCategoryCode(rawCode, rawLabel || label) !== rawCode;
    return {
      code,
      label,
      active: DEFAULT_CATEGORIES.includes(label) ? true : entry?.active !== false,
      sortOrder: Number.isFinite(Number(entry?.sortOrder)) && !hasLegacyAlias
        ? Number(entry.sortOrder)
        : getDefaultCategorySortOrder(label) || base.sortOrder,
      bucket: String(entry?.bucket || base.bucket).trim() || base.bucket,
      budgetMode: String(entry?.budgetMode || base.budgetMode).trim() || base.budgetMode,
      settlementScope: String(entry?.settlementScope || base.settlementScope).trim() || base.settlementScope,
      budgetGroupKey: String(entry?.budgetGroupKey || CATEGORY_BUDGET_GROUP_KEY_MAP[code] || base.budgetGroupKey || "").trim(),
    };
  }

  function normalizeCategoryMasterConfig(value, legacyCategories = []) {
    const defaults = getDefaultCategoryMasterConfig();
    const raw = value && typeof value === "object" ? value : {};
    const sourceCategories = Array.isArray(raw.categories) ? raw.categories : defaults.categories;
    const merged = new Map();
    sourceCategories.forEach((entry, index) => {
      const normalized = normalizeCategoryMasterEntry(entry, index);
      merged.set(normalized.code, normalized);
    });
    defaults.categories.forEach((entry, index) => {
      const normalized = normalizeCategoryMasterEntry(entry, index);
      if (!merged.has(normalized.code)) merged.set(normalized.code, normalized);
    });
    mergeCategories(legacyCategories).forEach((label, index) => {
      const normalizedLabel = normalizeCategoryLabel(label);
      const code = CATEGORY_CODE_MAP[normalizedLabel] || makeStableCode(normalizedLabel, "custom");
      if (!merged.has(code)) {
        merged.set(code, buildFallbackCategoryMetaFromLabel(normalizedLabel, 5000 + index));
      } else {
        const existing = merged.get(code);
        if (existing && !existing.label) existing.label = normalizedLabel;
      }
    });
    return {
      version: Math.max(Number(raw.version) || 0, defaults.version),
      categories: Array.from(merged.values())
        .map((entry, index) => normalizeCategoryMasterEntry(entry, index))
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.label || "").localeCompare(String(b.label || ""))),
    };
  }

  function getMigratedCategoryMasterConfig(value, legacyCategories = []) {
    const migratedCategories = migrateLegacyChildRinCategories(legacyCategories);
    const normalized = normalizeCategoryMasterConfig(value, migratedCategories);
    return {
      ...normalized,
      categories: normalized.categories,
    };
  }

  function normalizeSettlementRules(value) {
    const defaults = getDefaultSettlementRules();
    const raw = value && typeof value === "object" ? value : {};
    const normalizeMoney = (input, fallback = 0) => {
      const amount = Number(input);
      return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : fallback;
    };
    const normalizeBonusMap = (source, fallbackSource) => {
      const rawMap = source && typeof source === "object" ? source : {};
      const fallbackMap = fallbackSource && typeof fallbackSource === "object" ? fallbackSource : {};
      return {
        "06": normalizeMoney(rawMap["06"], normalizeMoney(fallbackMap["06"], 0)),
        "12": normalizeMoney(rawMap["12"], normalizeMoney(fallbackMap["12"], 0)),
      };
    };
    const monthlyOverrides = {};
    const rawMonthlyOverrides = raw?.monthlyOverrides && typeof raw.monthlyOverrides === "object" ? raw.monthlyOverrides : {};
    Object.entries(rawMonthlyOverrides).forEach(([monthKey, row]) => {
      if (!/^\d{4}-\d{2}$/.test(monthKey || "")) return;
      const rawRow = row && typeof row === "object" ? row : {};
      monthlyOverrides[monthKey] = {
        husband: normalizeMoney(rawRow?.husband, 0),
        wife: normalizeMoney(rawRow?.wife, 0),
      };
    });
    return {
      version: Math.max(Number(raw.version) || 0, defaults.version),
      monthlyContribution: {
        husband: normalizeMoney(raw?.monthlyContribution?.husband, defaults.monthlyContribution.husband),
        wife: normalizeMoney(raw?.monthlyContribution?.wife, defaults.monthlyContribution.wife),
      },
      bonusContribution: {
        husband: normalizeBonusMap(raw?.bonusContribution?.husband, defaults.bonusContribution.husband),
        wife: normalizeBonusMap(raw?.bonusContribution?.wife, defaults.bonusContribution.wife),
      },
      monthlyOverrides,
      familyCardOwner: raw?.familyCardOwner === "wife" ? "wife" : defaults.familyCardOwner,
      includeTransfersInSettlement: raw?.includeTransfersInSettlement !== false,
      notes: String(raw?.notes || "").trim(),
    };
  }

  function normalizeHouseholdPoolConfig(value) {
    const defaults = getDefaultHouseholdPoolConfig();
    const raw = value && typeof value === "object" ? value : {};
    const openingBalances = {};
    const rawOpeningBalances = raw?.openingBalances && typeof raw.openingBalances === "object" ? raw.openingBalances : {};
    Object.entries(rawOpeningBalances).forEach(([yearKey, row]) => {
      const normalizedYear = String(yearKey || "").trim();
      if (!/^\d{4}$/.test(normalizedYear)) return;
      const rawRow = row && typeof row === "object" ? row : {};
      const husband = Number(rawRow?.husband);
      const wife = Number(rawRow?.wife);
      openingBalances[normalizedYear] = {
        husband: Number.isFinite(husband) && husband >= 0 ? Math.round(husband) : 0,
        wife: Number.isFinite(wife) && wife >= 0 ? Math.round(wife) : 0,
      };
    });
    return {
      version: Math.max(Number(raw.version) || 0, defaults.version),
      openingBalances,
    };
  }

  function normalizeRecurringTemplateEntry(template, index) {
    const raw = template && typeof template === "object" ? template : {};
    let fallbackCategory = "その他";
    try {
      fallbackCategory = getPreferredCategoryFallback();
    } catch (error) {
      console.error("Failed to resolve recurring template fallback category", error);
    }
    const payer = raw?.payer === "wife" ? "wife" : "husband";
    const paymentMethod = normalizePaymentMethodCode(raw?.paymentMethod || "husband_card", payer);
    const amount = Number(raw?.amount);
    const dayOfMonth = Number(raw?.dayOfMonth);
    const month = String(raw?.month || "").padStart(2, "0");
    return {
      id: String(raw?.id || `template-${index + 1}-${makeStableCode(String(raw?.label || raw?.storeName || "fixed"), "template")}`).trim(),
      label: String(raw?.label || raw?.storeName || `固定費テンプレ${index + 1}`).trim(),
      storeName: String(raw?.storeName || "").trim(),
      category: normalizeCategoryLabel(raw?.category) || fallbackCategory,
      amount: Number.isFinite(amount) ? Math.round(amount) : 0,
      payer,
      paymentMethod,
      otherPaymentMethod: normalizeOtherPaymentMethodLabel(raw?.otherPaymentMethod || ""),
      personalExpense: ["family", "husband", "wife", "child"].includes(raw?.personalExpense) ? raw.personalExpense : "family",
      frequency: raw?.frequency === "annual" ? "annual" : "monthly",
      month: month && /^\d{2}$/.test(month) ? month : "01",
      dayOfMonth: Number.isFinite(dayOfMonth) ? Math.min(31, Math.max(1, Math.round(dayOfMonth))) : 27,
      active: raw?.active !== false,
      memo: String(raw?.memo || "").trim(),
    };
  }

  function normalizeRecurringTemplateConfig(value) {
    const defaults = getDefaultRecurringTemplateConfig();
    const raw = value && typeof value === "object" ? value : {};
    return {
      version: Math.max(Number(raw.version) || 0, defaults.version),
      templates: Array.isArray(raw.templates)
        ? raw.templates.map((item, index) => {
          try {
            return normalizeRecurringTemplateEntry(item, index);
          } catch (error) {
            console.error("Failed to normalize recurring template entry", error);
            return normalizeRecurringTemplateEntry({}, index);
          }
        })
        : defaults.templates,
    };
  }

  function normalizeMonthlyCloseRecord(monthKey, value) {
    const raw = value && typeof value === "object" ? value : {};
    const notes = raw?.notes && typeof raw.notes === "object" ? raw.notes : {};
    const snapshot = raw?.snapshot && typeof raw.snapshot === "object" ? raw.snapshot : {};
    const queueSummary = raw?.queueSummary && typeof raw.queueSummary === "object" ? raw.queueSummary : {};
    return {
      status: raw?.status === "closed" ? "closed" : "open",
      closedAt: String(raw?.closedAt || "").trim(),
      closedBy: String(raw?.closedBy || "").trim(),
      notes: {
        unexpectedItems: String(notes?.unexpectedItems || "").trim(),
        nextMonthActions: String(notes?.nextMonthActions || "").trim(),
        carryoverNotes: String(notes?.carryoverNotes || "").trim(),
      },
      snapshot: {
        coreVariableActual: Math.max(Number(snapshot?.coreVariableActual) || 0, 0),
        coreVariableForecast: Math.max(Number(snapshot?.coreVariableForecast) || 0, 0),
        annualSpecialSpent: Math.max(Number(snapshot?.annualSpecialSpent) || 0, 0),
        settlementSuggestedDirection: String(snapshot?.settlementSuggestedDirection || "").trim(),
        settlementSuggestedAmount: Math.max(Number(snapshot?.settlementSuggestedAmount) || 0, 0),
      },
      queueSummary: {
        categoryIssues: Math.max(Number(queueSummary?.categoryIssues) || 0, 0),
        unassignedBudgetIssues: Math.max(Number(queueSummary?.unassignedBudgetIssues) || 0, 0),
        settlementOpen: Boolean(queueSummary?.settlementOpen),
      },
      monthKey: /^\d{4}-\d{2}$/.test(monthKey || "") ? monthKey : "",
    };
  }

  function normalizeMonthlyCloseConfig(value) {
    const defaults = getDefaultMonthlyCloseConfig();
    const raw = value && typeof value === "object" ? value : {};
    const records = {};
    const sourceRecords = raw?.records && typeof raw.records === "object" ? raw.records : {};
    Object.entries(sourceRecords).forEach(([monthKey, record]) => {
      if (!/^\d{4}-\d{2}$/.test(monthKey || "")) return;
      records[monthKey] = normalizeMonthlyCloseRecord(monthKey, record);
    });
    return {
      version: Math.max(Number(raw.version) || 0, defaults.version),
      records,
    };
  }

  function getCategoryMasterEntries(configValue = state.categoryMasterConfig) {
    return getMigratedCategoryMasterConfig(configValue, state.categories).categories;
  }

  function pickPreferredCategoryMeta(candidates, normalizedLabel = "", normalizedCode = "") {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    const canonicalCode = CATEGORY_CODE_MAP[normalizedLabel] || normalizedCode;
    return candidates
      .slice()
      .sort((a, b) => {
        const score = (entry) => {
          let total = 0;
          if (entry?.label === normalizedLabel) total += 120;
          if (entry?.code === canonicalCode) total += 90;
          if (entry?.active !== false) total += 40;
          if (DEFAULT_CATEGORIES.includes(entry?.label)) total += 20;
          total -= Number(entry?.sortOrder || 0) / 10000;
          return total;
        };
        return score(b) - score(a);
      })[0] || null;
  }

  function getActiveCategoryLabels(configValue = state.categoryMasterConfig, fallbackCategories = []) {
    const entries = getMigratedCategoryMasterConfig(configValue, fallbackCategories).categories;
    const selectable = mergeCategories([
      ...DEFAULT_CATEGORIES,
      ...entries.filter((entry) => entry.active !== false).map((entry) => entry.label),
    ]);
    const used = new Set();
    const ordered = [];
    CATEGORY_SELECT_PRIORITY.forEach((label) => {
      if (selectable.includes(label) && !used.has(label)) {
        ordered.push(label);
        used.add(label);
      }
    });
    selectable.forEach((label) => {
      if (!used.has(label)) {
        ordered.push(label);
        used.add(label);
      }
    });
    return ordered;
  }

  function getSelectableCategoryLabels(configValue = state.categoryMasterConfig, fallbackCategories = []) {
    const labels = getActiveCategoryLabels(configValue, fallbackCategories);
    if (!labels.includes("日用品")) {
      const next = labels.slice();
      const insertAt = Math.min(2, next.length);
      next.splice(insertAt, 0, "日用品");
      return next;
    }
    return labels;
  }

  function getPreferredCategoryFallback() {
    const selectable = getSelectableCategoryLabels(state.categoryMasterConfig, state.categories);
    if (selectable.includes("日用品")) return "日用品";
    if (selectable.includes("その他")) return "その他";
    return selectable[0] || "その他";
  }

  function getCategoryMetaByCode(code) {
    const value = String(code || "").trim();
    const candidates = getCategoryMasterEntries().filter((entry) => entry.code === value);
    return pickPreferredCategoryMeta(candidates, CATEGORY_LABEL_BY_CODE[value] || "", value);
  }

  function getCategoryMetaByLabel(label) {
    const normalizedLabel = normalizeCategoryLabel(label);
    const normalizedCode = normalizeCategoryCode(label, normalizedLabel);
    const candidates = getCategoryMasterEntries().filter((entry) => (
      entry.label === normalizedLabel
      || entry.code === normalizedCode
      || (normalizedLabel === "日用品" && entry.code === "daily_goods")
    ));
    return pickPreferredCategoryMeta(candidates, normalizedLabel, normalizedCode);
  }

  function getCategoryBucket(category) {
    return getCategoryMetaByLabel(category)?.bucket || "uncategorized";
  }

  function getCategoryBudgetGroupKey(category) {
    return getCategoryMetaByLabel(category)?.budgetGroupKey || "";
  }

  function getSerialYearFromDate(date) {
    const value = String(date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    return value.slice(2, 4);
  }

  function getSerialCounterKey(kind) {
    return `${kind}:global`;
  }

  function formatSerialCode(kind, sequence) {
    const prefix = SERIAL_KIND_PREFIX[kind];
    if (!prefix || !sequence) return "";
    return `S${prefix}-${String(sequence).padStart(4, "0")}`;
  }

  function parseSerialCode(serialCode, kind) {
    const prefix = SERIAL_KIND_PREFIX[kind];
    const match = String(serialCode || "").trim().match(/^S([A-Z])-(\d{4})$/);
    if (!match || match[1] !== prefix) return null;
    return {
      sequence: Number(match[2]) || 0,
    };
  }

  function compareRecordsForSerial(a, b) {
    const dateDiff = String(a?.date || "").localeCompare(String(b?.date || ""));
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""));
    if (createdDiff !== 0) return createdDiff;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  }

  function getExpenseCreatedOrderValue(item) {
    return String(item?.createdAt || item?.updatedAt || item?.id || "");
  }

  function compareExpensesByRegisteredOrder(a, b) {
    const delegated = callExpenseListFeature("compareExpensesByRegisteredOrder", a, b);
    if (delegated !== undefined) return delegated;
    const createdDiff = getExpenseCreatedOrderValue(b).localeCompare(getExpenseCreatedOrderValue(a));
    if (createdDiff !== 0) return createdDiff;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  }

  function compareExpensesForDisplay(a, b) {
    const delegated = callExpenseListFeature("compareExpensesForDisplay", a, b);
    if (delegated !== undefined) return delegated;
    const dateDiff = String(b?.date || "").localeCompare(String(a?.date || ""));
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = getExpenseCreatedOrderValue(b).localeCompare(getExpenseCreatedOrderValue(a));
    if (createdDiff !== 0) return createdDiff;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  }

  function normalizeDuplicateComparableName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/（[^）]*）/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/[・･\s　_\-ー]+/g, "")
      .replace(/[【】\[\]「」『』]/g, "");
  }

  function isPotentialDuplicateExpenseName(left, right) {
    const normalizedLeft = normalizeDuplicateComparableName(left);
    const normalizedRight = normalizeDuplicateComparableName(right);
    if (!normalizedLeft || !normalizedRight) return false;
    if (normalizedLeft === normalizedRight) return true;
    if (normalizedLeft.length >= 3 && normalizedRight.length >= 3) {
      return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
    }
    return false;
  }

  function collectPotentialDuplicateExpenses(date, draftNames = [], excludeIds = []) {
    const uniqueNames = [...new Set((draftNames || []).map((name) => String(name || "").trim()).filter(Boolean))];
    if (!String(date || "").trim() || !uniqueNames.length) return [];
    const excluded = new Set((excludeIds || []).map((id) => String(id || "").trim()).filter(Boolean));
    return state.expenses
      .filter((item) => {
        if (!item || excluded.has(String(item.id || "").trim())) return false;
        if (String(item.date || "") !== String(date || "")) return false;
        return uniqueNames.some((name) => isPotentialDuplicateExpenseName(name, item.storeName));
      })
      .sort(compareExpensesForDisplay);
  }

  function confirmPotentialDuplicateExpenses(date, draftNames = [], excludeIds = []) {
    const duplicates = collectPotentialDuplicateExpenses(date, draftNames, excludeIds);
    if (!duplicates.length) return true;
    const lines = duplicates.slice(0, 5).map((item) => {
      const serial = item.serialCode ? `${item.serialCode} / ` : "";
      return `${serial}${item.storeName} / ${formatCurrency(item.amount)} / ${paymentMethodLabel(item)}`;
    });
    const extraCount = duplicates.length - lines.length;
    const suffix = extraCount > 0 ? `\nほか ${extraCount} 件` : "";
    return window.confirm(
      `${date} に似た名前の支出が既に登録されています。\n\n${lines.join("\n")}${suffix}\n\n重複の可能性があります。このまま登録しますか？`
    );
  }

  function getExpenseDuplicateSignature(item) {
    const date = String(item?.date || "").trim();
    const storeName = normalizeDuplicateComparableName(item?.storeName);
    const amount = Number(item?.amount || 0);
    const category = normalizeCategoryLabel(item?.category) || "";
    const personalExpense = String(item?.personalExpense || "family").trim();
    if (!date || !storeName || !amount) return "";
    return [date, storeName, amount, category, personalExpense].join("|");
  }

  function buildExpenseAttentionState(items = state.expenses) {
    const duplicateCountBySignature = new Map();
    const pendingRecordIds = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const signature = getExpenseDuplicateSignature(item);
      if (!signature) return;
      duplicateCountBySignature.set(signature, (duplicateCountBySignature.get(signature) || 0) + 1);
    });
    (state.pendingReceiptUploads || []).forEach((job) => {
      (job?.recordIds || []).forEach((recordId) => {
        if (recordId) pendingRecordIds.add(String(recordId));
      });
    });
    return {
      duplicateCountBySignature,
      pendingRecordIds,
    };
  }

  function getExpenseAttentionMeta(item, attentionState = null) {
    const nextAttentionState = attentionState || buildExpenseAttentionState();
    const signature = getExpenseDuplicateSignature(item);
    const duplicateCount = signature
      ? Math.max(0, Number(nextAttentionState.duplicateCountBySignature?.get(signature) || 0) - 1)
      : 0;
    const receiptStatus = String(item?.receiptUploadStatus || "").trim();
    const hasStorageAsset = Boolean(String(item?.receiptStorageAssetId || "").trim());
    const driveFileId = String(item?.receiptDriveFileId || "").trim();
    const fileId = String(item?.receiptFileId || "").trim();
    const driveUrl = String(item?.receiptDriveUrl || "").trim();
    const receiptUrl = String(item?.receiptUrl || "").trim();
    const hasDriveReceipt = Boolean(driveFileId || (fileId && !isGcsReceiptFileId(fileId)) || driveUrl || isDriveReceiptUrl(receiptUrl));
    const receiptAssets = getReceiptAssets(item);
    const hasAssetNeedingDriveSync = receiptAssets.some((asset) => asset.storageAssetId && !asset.driveUrl && !asset.driveFileId);
    const hasPendingReceipt = !hasStorageAsset && (
      nextAttentionState.pendingRecordIds?.has(String(item?.id || ""))
      || receiptStatus === "failed"
      || receiptStatus === "pending"
    );
    const needsDriveSync = (hasStorageAsset && !hasDriveReceipt) || hasAssetNeedingDriveSync;
    return {
      duplicateCount,
      hasPendingReceipt,
      needsDriveSync,
      hasAttention: duplicateCount > 0 || hasPendingReceipt,
    };
  }

  function buildExpenseAttentionSummary(items = [], attentionState = null) {
    if (!Array.isArray(items) || !items.length) return "";
    const nextAttentionState = attentionState || buildExpenseAttentionState();
    let attentionCount = 0;
    let duplicateCount = 0;
    let pendingReceiptCount = 0;
    items.forEach((item) => {
      const meta = getExpenseAttentionMeta(item, nextAttentionState);
      if (!meta.hasAttention) return;
      attentionCount += 1;
      if (meta.duplicateCount > 0) duplicateCount += 1;
      if (meta.hasPendingReceipt) pendingReceiptCount += 1;
    });
    const parts = [];
    if (attentionCount) parts.push(`要確認 ${attentionCount}件`);
    if (duplicateCount) parts.push(`重複疑い ${duplicateCount}件`);
    if (pendingReceiptCount) parts.push(`レシート未保存 ${pendingReceiptCount}件`);
    return parts.join(" / ");
  }

  function buildExpenseUpdateSummary(beforeExpense, nextExpense) {
    const delegated = callExpensesFeature("buildExpenseUpdateSummary", beforeExpense, nextExpense);
    if (delegated !== undefined) return delegated;
    if (!beforeExpense || !nextExpense) return "支出を更新しました。";
    const changes = [];
    if (String(beforeExpense.category || "") !== String(nextExpense.category || "")) {
      changes.push(`カテゴリを「${nextExpense.category || "未設定"}」に更新しました`);
    }
    if (Number(beforeExpense.amount || 0) !== Number(nextExpense.amount || 0)) {
      changes.push(`金額を ${formatCurrency(nextExpense.amount)} に更新しました`);
    }
    if (String(beforeExpense.payer || "") !== String(nextExpense.payer || "")) {
      changes.push(`支払者を「${PAYER_LABELS[nextExpense.payer] || nextExpense.payer}」に更新しました`);
    }
    if (String(beforeExpense.paymentMethod || "") !== String(nextExpense.paymentMethod || "")
      || String(beforeExpense.otherPaymentMethod || "") !== String(nextExpense.otherPaymentMethod || "")) {
      changes.push(`支払い手段を「${paymentMethodLabel(nextExpense)}」に更新しました`);
    }
    if (String(beforeExpense.personalExpense || "family") !== String(nextExpense.personalExpense || "family")) {
      changes.push(`負担区分を「${getPersonalExpenseLabel(nextExpense.personalExpense)}」に更新しました`);
    }
    if (String(beforeExpense.storeName || "") !== String(nextExpense.storeName || "")) {
      changes.push(`内容を「${nextExpense.storeName || "未設定"}」に更新しました`);
    }
    return changes.length ? changes.slice(0, 2).join(" / ") : "支出を更新しました。";
  }

  function assignSerialCodesToRecords(records, kind) {
    const counters = normalizeSerialCounters(state.serialCounters);
    const counterKey = getSerialCounterKey(kind);
    let existingMax = 0;
    records.forEach((record) => {
      const parsed = parseSerialCode(record?.serialCode, kind);
      if (!parsed?.sequence) return;
      existingMax = Math.max(existingMax, parsed.sequence);
    });
    records
      .filter((record) => !parseSerialCode(record?.serialCode, kind))
      .sort(compareRecordsForSerial)
      .forEach((record) => {
        const nextSequence = Math.max(counters[counterKey] || 0, existingMax) + 1;
        record.serialCode = formatSerialCode(kind, nextSequence);
        counters[counterKey] = nextSequence;
        existingMax = nextSequence;
      });
    counters[counterKey] = Math.max(counters[counterKey] || 0, existingMax);
    state.serialCounters = counters;
  }

  function ensureSerialCodes() {
    assignSerialCodesToRecords(state.expenses, "expenses");
    assignSerialCodesToRecords(state.transfers, "transfers");
    assignSerialCodesToRecords(state.childTransactions, "childTransactions");
    assignSerialCodesToRecords(state.householdIncomes, "householdIncomes");
  }

  function mergeOtherPaymentMethods(values = []) {
    const merged = [...DEFAULT_OTHER_PAYMENT_METHODS];
    (values || []).forEach((value) => {
      const label = normalizeOtherPaymentMethodLabel(value);
      if (label && !merged.includes(label)) merged.push(label);
    });
    return merged;
  }

  function getDefaultOtherPaymentMethod() {
    return state.otherPaymentMethods[0] || DEFAULT_OTHER_PAYMENT_METHODS[0] || "";
  }

  function getDefaultPaymentMethodForCurrentUser() {
    return state.currentUser?.email === "partner-email@example.com" ? "wife_card" : "husband_card";
  }

  function rememberEditScrollContext(tabName, recordId) {
    state.editScrollContext = {
      tabName,
      recordId: recordId || "",
      scrollY: window.scrollY || window.pageYOffset || 0,
    };
  }

  function scrollToElementTop(element, behavior = "smooth") {
    if (!element) return;
    element.scrollIntoView({ behavior, block: "start" });
  }

  function restoreEditScrollContext() {
    const context = state.editScrollContext;
    state.editScrollContext = null;
    if (!context) return;
    if (context.tabName && getActiveTabName() !== context.tabName) {
      switchTab(context.tabName);
    }
    window.setTimeout(() => {
      window.scrollTo({ top: context.scrollY || 0, behavior: "auto" });
    }, 60);
  }

  function openExpenseEditModal(expense, sourceTab) {
    if (state.crossBurdenModalOpen) {
      closeCrossBurdenModal();
    }
    const delegated = callExpensesFeature("openExpenseEditModal", expense, sourceTab);
    if (delegated !== undefined) return delegated;
  }

  function restoreExpenseEntryCard() {
    const delegated = callExpensesFeature("restoreExpenseEntryCard");
    if (delegated !== undefined) return delegated;
  }

  function closeExpenseEditModal(options = {}) {
    const delegated = callExpensesFeature("closeExpenseEditModal", options);
    if (delegated !== undefined) return delegated;
  }

  function getExpenseGroupItems(receiptGroupId) {
    const delegated = callExpenseGroupsFeature("getExpenseGroupItems", receiptGroupId);
    if (delegated !== undefined) return delegated;
    return [];
  }

  function renderExpenseGroupEditModal(groupId) {
    const delegated = callExpenseGroupsFeature("renderExpenseGroupEditModal", groupId);
    if (delegated !== undefined) return delegated;
  }

  function updateExpenseGroupEditSummary() {
    const delegated = callExpenseGroupsFeature("updateExpenseGroupEditSummary");
    if (delegated !== undefined) return delegated;
  }

  async function openExpenseGroupEditModal(receiptGroupId, sourceTab) {
    const delegated = callExpenseGroupsFeature("openExpenseGroupEditModal", receiptGroupId, sourceTab);
    if (delegated !== undefined) return delegated;
  }

  function closeExpenseGroupEditModal() {
    const delegated = callExpenseGroupsFeature("closeExpenseGroupEditModal");
    if (delegated !== undefined) return delegated;
  }

  function collectExpenseGroupEditDrafts() {
    const delegated = callExpenseGroupsFeature("collectExpenseGroupEditDrafts");
    if (delegated !== undefined) return delegated;
    return { drafts: [], deletedItems: [] };
  }

  async function saveExpenseGroupEdits() {
    const delegated = callExpenseGroupsFeature("saveExpenseGroupEdits");
    if (delegated !== undefined) return delegated;
  }

  function ensureEntryWorkspaceHomes() {
    if (!state.expenseEntryCardHome && els.expenseEntryCard) {
      state.expenseEntryCardHome = {
        parent: els.expenseEntryCard.parentElement,
        nextSibling: els.expenseEntryCard.nextElementSibling,
      };
    }
    if (!state.entryAiCardHome && els.entryAiCard) {
      state.entryAiCardHome = {
        parent: els.entryAiCard.parentElement,
        nextSibling: els.entryAiCard.nextElementSibling,
      };
    }
  }

  function restoreEntryAiCard() {
    if (!els.entryAiCard || !state.entryAiCardHome?.parent) return;
    const { parent, nextSibling } = state.entryAiCardHome;
    els.entryAiCard.classList.add("hidden");
    if (nextSibling?.parentElement === parent) {
      parent.insertBefore(els.entryAiCard, nextSibling);
      return;
    }
    parent.appendChild(els.entryAiCard);
  }

  function setEntryFlowModalVisible(visible) {
    if (!els.entryFlowModal) return;
    els.entryFlowModal.classList.toggle("hidden", !visible);
    els.entryFlowModal.setAttribute("aria-hidden", visible ? "false" : "true");
    document.body.classList.toggle("modal-open", visible || state.expenseEditModalOpen || state.expenseGroupEditModalOpen || state.crossBurdenModalOpen || state.dashboardBudgetModalOpen);
  }

  function openCrossBurdenModal(title, summaryText, items) {
    if (!els.crossBurdenModal || !els.crossBurdenDetailList || !els.crossBurdenModalTitle || !els.crossBurdenModalSummary) return;
    els.crossBurdenModalTitle.textContent = title || "代理負担の明細";
    setText(els.crossBurdenModalSummary, summaryText || "");
    if (!Array.isArray(items) || !items.length) {
      els.crossBurdenDetailList.innerHTML = '<div class="expense-card"><span class="muted">該当する明細はありません。</span></div>';
    } else {
      els.crossBurdenDetailList.innerHTML = items.map(renderExpenseCardHtml).join("");
      bindExpenseCardEvents(els.crossBurdenDetailList, items);
    }
    els.crossBurdenModal.classList.remove("hidden");
    els.crossBurdenModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    state.crossBurdenModalOpen = true;
  }

  function openSummaryDetailModal(title, summaryText, expenseItems = [], incomeItems = []) {
    return callSummaryDetailFeature("openSummaryDetailModal", title, summaryText, expenseItems, incomeItems);
  }

  function getSummaryDetailPayloadFromButton(button) {
    return callSummaryDetailFeature("getSummaryDetailPayloadFromButton", button);
  }

  function auditSummaryDetailCards() {
    return callSummaryDetailFeature("auditSummaryDetailCards");
  }

  window.KakeiboSummaryAudit = {
    auditSummaryDetailCards,
  };

  function handleSummaryDetailClick(event) {
    return callSummaryDetailFeature("handleSummaryDetailClick", event);
  }

  function bindHomeMonthlyMiniProgressCards() {
    return callHomeDashboardFeature("bindHomeMonthlyMiniProgressCards");
  }

  function closeCrossBurdenModal() {
    if (!els.crossBurdenModal) return;
    els.crossBurdenModal.classList.add("hidden");
    els.crossBurdenModal.setAttribute("aria-hidden", "true");
    document.body.classList.toggle("modal-open", state.entryFlowModalOpen || state.expenseEditModalOpen || state.expenseGroupEditModalOpen || state.dashboardBudgetModalOpen);
    state.crossBurdenModalOpen = false;
  }

  function openDashboardBudgetModal() {
    if (!els.dashboardBudgetModal) return;
    renderDashboardBudgetForm();
    els.dashboardBudgetModal.classList.remove("hidden");
    els.dashboardBudgetModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    state.dashboardBudgetModalOpen = true;
  }

  function closeDashboardBudgetModal() {
    if (!els.dashboardBudgetModal) return;
    els.dashboardBudgetModal.classList.add("hidden");
    els.dashboardBudgetModal.setAttribute("aria-hidden", "true");
    state.dashboardBudgetModalOpen = false;
    document.body.classList.toggle(
      "modal-open",
      state.entryFlowModalOpen || state.expenseEditModalOpen || state.expenseGroupEditModalOpen || state.crossBurdenModalOpen
    );
  }

  function configureEntryFlowContent(mode, stage = "ai") {
    if (!els.entryFlowModalContent || !els.entryFlowModalTitle || !els.entryFlowModalEyebrow) return;
    ensureEntryWorkspaceHomes();
    state.entryFlowMode = mode;
    state.entryFlowStage = stage;
    els.entryFlowModalContent.classList.add("entry-flow-modal-content");
    els.entryFlowModalContent.innerHTML = "";

    const showAiCard = mode === "image" || mode === "text";
    const showExpenseCard = mode === "manual" || stage === "form";

    if (showAiCard && els.entryAiCard) {
      els.entryAiCard.classList.remove("hidden");
      els.entryAiImageSection?.classList.toggle("hidden", mode !== "image");
      els.entryAiTextSection?.classList.toggle("hidden", mode !== "text");
      els.entryFlowModalContent.appendChild(els.entryAiCard);
    }
    if (els.expenseEntryCard) {
      els.expenseEntryCard.classList.toggle("hidden", !showExpenseCard);
      if (showExpenseCard) {
        els.entryFlowModalContent.appendChild(els.expenseEntryCard);
      }
    }

    if (mode === "image") {
      els.entryFlowModalEyebrow.textContent = stage === "form" ? "登録内容の確認" : "登録開始";
      els.entryFlowModalTitle.textContent = stage === "form" ? "AI候補を確認して登録" : "画像からAI解析で登録";
    } else if (mode === "text") {
      els.entryFlowModalEyebrow.textContent = stage === "form" ? "登録内容の確認" : "登録開始";
      els.entryFlowModalTitle.textContent = stage === "form" ? "AI候補を確認して登録" : "テキストからAI解析で登録";
    } else {
      els.entryFlowModalEyebrow.textContent = "登録開始";
      els.entryFlowModalTitle.textContent = "手入力で登録";
    }
  }

  function focusEntryFlowPrimaryField(mode, stage) {
    window.setTimeout(() => {
      if (stage === "form" || mode === "manual") {
        els.date?.focus();
        return;
      }
      if (mode === "image") {
        els.receiptCameraButton?.focus();
      } else if (mode === "text") {
        els.orderMailText?.focus();
      }
    }, 20);
  }

  function openEntryFlowModal(mode) {
    if (!mode || !els.entryFlowModalContent || !els.entryFlowModal) return;
    if (state.expenseEditModalOpen) {
      closeExpenseEditModal();
    }
    if (state.expenseGroupEditModalOpen) {
      closeExpenseGroupEditModal();
    }
    resetForm();
    configureEntryFlowContent(mode, mode === "manual" ? "form" : "ai");
    setEntryFlowModalVisible(true);
    state.entryFlowModalOpen = true;
    focusEntryFlowPrimaryField(mode, state.entryFlowStage);
  }

  function advanceEntryFlowToForm() {
    if (!state.entryFlowModalOpen) return;
    configureEntryFlowContent(state.entryFlowMode || "manual", "form");
    focusEntryFlowPrimaryField(state.entryFlowMode || "manual", "form");
  }

  function closeEntryFlowModal(options = {}) {
    if (!state.entryFlowModalOpen && els.entryFlowModal?.classList.contains("hidden")) return;
    if (options.reset !== false) {
      resetForm();
    }
    restoreExpenseEntryCard();
    restoreEntryAiCard();
    setEntryFlowModalVisible(false);
    state.entryFlowModalOpen = false;
    state.entryFlowMode = "";
    state.entryFlowStage = "";
  }

  function getActiveTabName() {
    return els.tabButtons.find((button) => button.classList.contains("active"))?.dataset.tab || "home";
  }

  function getExplicitActiveTabName() {
    return els.tabButtons.find((button) => button.classList.contains("active"))?.dataset.tab || "";
  }

    function canUseSharedStorage() {
      return Boolean(state.currentUser && state.currentUser.provider === "google");
    }

    function isSharedDataPendingAuthentication() {
      return Boolean(
        !state.currentUser
        && (state.authCheckInProgress || !state.googleReady)
      );
    }

  function setSharedBootstrapInProgress(active, options = {}) {
    state.sharedBootstrapInProgress = Boolean(active);
    if (active) state.sharedBootstrapError = "";
    if (!options.skipRender) renderAll();
  }

  function setSharedBootstrapError(message = "") {
    state.sharedBootstrapError = String(message || "").trim();
  }

  function isSummaryDataRefreshing() {
    return Boolean(
      state.authCheckInProgress
      || state.sharedBootstrapInProgress
      || state.sharedStateLoading
      || state.expensesLoading
      || (canUseSharedStorage() && state.currentUser && !state.expensesLoaded)
    );
  }

  function getSummaryLoadingMessage() {
    if (state.authCheckInProgress) return "Google接続の確認後に家計の見える化を更新します。";
    if (state.sharedStateLoading || state.sharedBootstrapInProgress) return "共有データを読み込み中です。家計の見える化を更新しています。";
    if (state.expensesLoading || (canUseSharedStorage() && state.currentUser && !state.expensesLoaded)) {
      return "家計の見える化に必要な支出データを読み込み中です。";
    }
    return "家計の見える化を更新しています。";
  }

  function hasSummaryDataRefreshError() {
    return Boolean(state.sharedBootstrapError && !state.expensesLoaded);
  }

  async function guardAiAnalyzeEntry() {
    if (!canUseSharedStorage()) {
      showSyncToast("先にGoogleログインしてください。", "error", { duration: 2500 });
      return false;
    }
    try {
      await getAuthHeaders();
      return true;
    } catch (error) {
      console.error("guardAiAnalyzeEntry failed", error);
      showSyncToast("先にGoogleログインしてください。", "error", { duration: 2500 });
      return false;
    }
  }

  async function launchEntryMode(mode) {
    openEntryFlowModal(mode);
  }

  function getSharedStateEndpoint(options = {}) {
    const base = getSharedApiBase();
    const endpoint = `${base}/api/state`;
    if (!options.cacheBust) return endpoint;
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}_ts=${Date.now()}`;
  }

  function getSharedSettingsEndpoint() {
    return `${getSharedApiBase()}/api/settings/main`;
  }

  function getExpenseOverviewEndpoint() {
    return `${getSharedApiBase()}/api/expense-overview`;
  }

  function getExpenseListEndpoint(options = {}) {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit || EXPENSE_LIST_PAGE_SIZE));
    if (options.cursor) params.set("cursor", String(options.cursor));
    if (options.month) params.set("month", String(options.month));
    return `${getSharedApiBase()}/api/expenses-browse?${params.toString()}`;
  }

  function getAllExpensesEndpoint() {
    return `${getSharedApiBase()}/api/expenses-all`;
  }

  function getSharedApiBase() {
    return (config.ai?.apiBaseUrl || config.app?.frontendOrigin || "").replace(/\/$/, "");
  }

  function getSharedCollectionPath(collectionKey) {
    const mapping = {
      expenses: "expenses",
      transfers: "transfers",
      childTransactions: "child-transactions",
      householdIncomes: "household-incomes",
    };
    return mapping[collectionKey] || "";
  }

  function getSharedRecordEndpoint(collectionKey, recordId = "") {
    const collectionPath = getSharedCollectionPath(collectionKey);
    if (!collectionPath) return "";
    const base = `${getSharedApiBase()}/api/${collectionPath}`;
    if (!recordId) return base;
    return `${base}/${encodeURIComponent(recordId)}`;
  }

  function getCollectionNormalizer(collectionKey) {
    if (collectionKey === "expenses") return normalizeExpense;
    if (collectionKey === "transfers") return normalizeTransfer;
    if (collectionKey === "childTransactions") return normalizeChildTransaction;
    if (collectionKey === "householdIncomes") return normalizeHouseholdIncome;
    return (value) => value;
  }

  function sortRecordsByDateDesc(items = []) {
    return [...items].sort((left, right) => {
      const leftDate = String(left?.date || "");
      const rightDate = String(right?.date || "");
      if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
      const leftUpdated = String(left?.updatedAt || left?.createdAt || "");
      const rightUpdated = String(right?.updatedAt || right?.createdAt || "");
      return rightUpdated.localeCompare(leftUpdated);
    });
  }

  function upsertStateRecord(collectionKey, record) {
    const normalizer = getCollectionNormalizer(collectionKey);
    const normalized = normalizer(record);
    const rows = Array.isArray(state[collectionKey]) ? [...state[collectionKey]] : [];
    const existingIndex = rows.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      rows[existingIndex] = normalized;
    } else {
      rows.unshift(normalized);
    }
    state[collectionKey] = sortRecordsByDateDesc(rows);
    return normalized;
  }

  function shouldIncludeExpenseInCurrentList(record) {
    if (!record?.id) return false;
    if (state.listMonthFilter) {
      return String(record?.date || "").startsWith(state.listMonthFilter);
    }
    return true;
  }

  function upsertExpenseListRecord(record) {
    const delegated = callExpenseListFeature("upsertExpenseListRecord", record);
    if (delegated !== undefined) return delegated;
    const normalized = normalizeExpense(record);
    if (!shouldIncludeExpenseInCurrentList(normalized)) return;
    const rows = [...state.expenseListItems];
    const existingIndex = rows.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      rows[existingIndex] = normalized;
    } else {
      rows.unshift(normalized);
    }
    state.expenseListItems = rows.sort(compareExpensesForDisplay);
  }

  function ensureExpenseListHydratedFromExpenses(options = {}) {
    const delegated = callExpenseListFeature("ensureExpenseListHydratedFromExpenses", options);
    if (delegated !== undefined) return delegated;
    if (state.listMonthFilter) return false;
    if (!options.force && Array.isArray(state.expenseListItems) && state.expenseListItems.length) return false;
    if (!state.expensesLoaded || !Array.isArray(state.expenses) || !state.expenses.length) return false;
    state.expenseListItems = [...state.expenses].sort(compareExpensesForDisplay);
    state.expenseListCursor = "";
    state.expenseListHasMore = false;
    return true;
  }

  function isExpenseWaitingForStoredReceiptUpload(record) {
    if (!record?.id) return false;
    const assetId = String(record.receiptStorageAssetId || "").trim();
    const driveFileId = String(record.receiptDriveFileId || record.receiptFileId || "").trim();
    const uploadStatus = String(record.receiptUploadStatus || "").trim();
    const storageStatus = String(record.receiptStorageStatus || "").trim();
    if (!assetId || driveFileId) return false;
    if (uploadStatus === "success") return false;
    return storageStatus === "stored" || uploadStatus === "pending" || uploadStatus === "failed";
  }

  function collectStoredReceiptUploadRecoveryRecords(records) {
    const source = Array.isArray(records)
      ? records
      : [
        ...(Array.isArray(state.expenseListItems) ? state.expenseListItems : []),
        ...(Array.isArray(state.expenses) ? state.expenses : []),
      ];
    const byId = new Map();
    source.forEach((record) => {
      const normalized = normalizeExpense(record);
      if (isExpenseWaitingForStoredReceiptUpload(normalized)) {
        byId.set(normalized.id, normalized);
      }
    });
    return [...byId.values()];
  }

  function recoverStoredReceiptUploadJobsFromRecords(options = {}) {
    // Cloud Storage 保管済みレシートは、設定画面の「Google Driveへ一括同期」から
    // ユーザーOAuthで明示反映する。起動/一覧読込時の自動Drive反映は行わない。
    void options;
    return 0;
  }

  function recoverStoredReceiptUploadJobsFromRecordsLegacy(options = {}) {
    if (!state.currentUser) return 0;
    const records = collectStoredReceiptUploadRecoveryRecords(options.records);
    if (!records.length) return 0;
    const groupedByAssetId = new Map();
    records.forEach((record) => {
      const assetId = String(record.receiptStorageAssetId || "").trim();
      if (!assetId) return;
      const group = groupedByAssetId.get(assetId) || [];
      group.push(record);
      groupedByAssetId.set(assetId, group);
    });
    let recoveredCount = 0;
    groupedByAssetId.forEach((group, assetId) => {
      const first = group[0] || {};
      const existing = (state.pendingReceiptUploads || []).find((job) => job.storageAssetId === assetId);
      const recordIds = [...new Set([
        ...(existing?.recordIds || []),
        ...group.map((record) => record.id).filter(Boolean),
      ])];
      if (!recordIds.length) return;
      upsertPendingReceiptUploadMeta({
        jobId: existing?.jobId || `receipt-storage-${assetId}`,
        recordIds,
        storageAssetId: assetId,
        storageUploadedAt: first.receiptStorageUploadedAt || existing?.storageUploadedAt || "",
        fileName: existing?.fileName || `${first.date || todayISO()}_${first.storeName || "レシート画像"}`,
        fileType: existing?.fileType || "",
        fileSize: existing?.fileSize || 0,
        fileContext: existing?.fileContext || {
          date: String(first.date || todayISO()).trim(),
          storeName: String(first.storeName || "").trim(),
          category: String(first.category || "").trim(),
          memo: String(first.memo || "").trim(),
        },
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts: existing?.attempts || 0,
        status: existing?.status === "uploading" ? "queued" : (existing?.status || "queued"),
        lastError: existing?.lastError || "",
      });
      recoveredCount += 1;
    });
    if (recoveredCount && options.autoStart !== false) {
      resumePendingReceiptUploads({
        interactive: options.interactive === true,
        silent: options.silent !== false,
      }).catch((error) => {
        console.warn("Failed to resume recovered receipt uploads:", error);
      });
    }
    return recoveredCount;
  }

  function removeExpenseListRecord(recordId) {
    const delegated = callExpenseListFeature("removeExpenseListRecord", recordId);
    if (delegated !== undefined) return delegated;
    state.expenseListItems = state.expenseListItems.filter((item) => item.id !== recordId);
  }

  function removeStateRecord(collectionKey, recordId) {
    state[collectionKey] = (Array.isArray(state[collectionKey]) ? state[collectionKey] : []).filter((item) => item.id !== recordId);
  }

  async function fetchSharedApi(endpoint, method, body, options = {}) {
    const isGet = String(method || "GET").toUpperCase() === "GET";
    const headers = await getAuthHeaders();
    const response = await fetch(endpoint + (isGet && options.cacheBust ? `${endpoint.includes("?") ? "&" : "?"}_ts=${Date.now()}` : ""), {
      method,
      credentials: "include",
      headers: {
        ...headers,
        "Cache-Control": "no-cache, no-store, max-age=0",
        Pragma: "no-cache",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && options.allowAuthRetry !== false) {
        const restored = await restoreBackendSession({ silent: true });
        if (restored && state.currentUser) {
          return fetchSharedApi(endpoint, method, body, { ...options, allowAuthRetry: false });
        }
        markAuthSessionExpired("Google セッションの期限が切れました。共有データを使う時は、下の Google ボタンから再接続してください。");
      }
      const error = new Error(payload.error || `共有データ通信に失敗しました (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function getRecordConflictMessage(collectionKey, action) {
    const delegated = callSharedSyncFeature("getRecordConflictMessage", collectionKey, action);
    if (delegated !== undefined) return delegated;
    const label = collectionKey === "expenses" ? "支出" : collectionKey === "transfers" ? "送金" : "子供入出金";
    const actionLabel = action === "delete" ? "削除" : "上書き保存";
    return `他の端末でこの${label}が更新されています。最新状態を確認せずに${actionLabel}しますか？`;
  }

  function getSharedSettingsConflictMessage() {
    const delegated = callSharedSyncFeature("getSharedSettingsConflictMessage");
    if (delegated !== undefined) return delegated;
    return "他の端末で設定が更新されています。最新状態を確認せずに今回の設定を上書きしますか？";
  }

  async function saveSharedSettingsFields(fields, options = {}) {
    const delegated = callSharedSyncFeature("saveSharedSettingsFields", fields, options);
    if (delegated !== undefined) return delegated;
    return { ok: false, error: new Error("shared sync feature unavailable") };
  }

  async function saveSharedRecord(collectionKey, record, options = {}) {
    const delegated = callSharedSyncFeature("saveSharedRecord", collectionKey, record, options);
    if (delegated !== undefined) return delegated;
    return { ok: false, error: new Error("shared sync feature unavailable") };
  }

  async function deleteSharedRecord(collectionKey, recordId, options = {}) {
    const delegated = callSharedSyncFeature("deleteSharedRecord", collectionKey, recordId, options);
    if (delegated !== undefined) return delegated;
    return { ok: false, error: new Error("shared sync feature unavailable") };
  }

  function resolveGoogleCredentialWaiters(success) {
    const waiters = Array.isArray(state.googleCredentialWaiters) ? [...state.googleCredentialWaiters] : [];
    state.googleCredentialWaiters = [];
    waiters.forEach((resolve) => {
      try {
        resolve(Boolean(success));
      } catch (error) {
        console.error("resolveGoogleCredentialWaiters failed", error);
      }
    });
  }

  function scheduleIdTokenRefresh(expUnixSeconds) {
    if (_idTokenRefreshTimer) {
      clearTimeout(_idTokenRefreshTimer);
      _idTokenRefreshTimer = null;
    }
    const delayMs = Number(expUnixSeconds) * 1000 - Date.now() - 5 * 60 * 1000;
    if (delayMs <= 0) return;
    _idTokenRefreshTimer = setTimeout(() => {
      _idTokenRefreshTimer = null;
      requestFreshGoogleCredential({ silent: true });
    }, Math.min(delayMs, 2147483647));
  }

  async function requestFreshGoogleCredential(options = {}) {
    if (!window.google?.accounts?.id?.prompt) return false;
    if (state.googleCredentialRefreshPromise) {
      return state.googleCredentialRefreshPromise;
    }
    const label = USER_LABELS[state.currentUser?.email] || USER_LABELS[state.lastGoogleUser?.email]
      || state.currentUser?.name || state.lastGoogleUser?.name || "Google";
    const timeoutMs = Number(options.timeoutMs) || 7000;
    const background = Boolean(options.background);
    state.googleCredentialRefreshPromise = new Promise((resolve) => {
      let settled = false;
      let finish = (result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        state.googleCredentialWaiters = state.googleCredentialWaiters.filter((item) => item !== finish);
        if (!background) {
          state.authCheckInProgress = false;
          syncAuthUI();
        }
        resolve(Boolean(result));
      };
      const timeoutId = window.setTimeout(() => finish(false), timeoutMs);
      state.googleCredentialWaiters.push(finish);
      if (!background) {
        state.authCheckInProgress = true;
        syncAuthUI();
      }
      if (!options.silent && !background) {
        setText(els.loginMessage, options.message || `${label} の Google 認証を確認しています...`);
      }
      try {
        google.accounts.id.prompt((notification) => {
          if (!notification) return;
          const notDisplayed = typeof notification.isNotDisplayed === "function" && notification.isNotDisplayed();
          const skipped = typeof notification.isSkippedMoment === "function" && notification.isSkippedMoment();
          const dismissed = typeof notification.isDismissedMoment === "function" && notification.isDismissedMoment();
          if (notDisplayed || skipped || dismissed) {
            finish(false);
          }
        });
      } catch (error) {
        console.error("requestFreshGoogleCredential failed", error);
        finish(false);
      }
    }).finally(() => {
      state.googleCredentialRefreshPromise = null;
    });
    return state.googleCredentialRefreshPromise;
  }

  async function getAuthBearerToken() {
    const token = state.currentUser?.idToken || "";
    if (!token) {
      const refreshed = await requestFreshGoogleCredential({
        message: "共有データへアクセスするため Google 認証を更新しています...",
      });
      if (!refreshed || !state.currentUser?.idToken) {
        const error = new Error("共有データへアクセスするには Google で再ログインしてください。");
        error.code = "missing_id_token";
        throw error;
      }
    }
    return state.currentUser?.idToken || token;
  }

  async function getAuthHeaders(options = {}) {
    const headers = {};
    const token = String(state.currentUser?.idToken || "").trim();
    const sessionId = String(
      state.rememberedSession?.sessionId
      || loadRememberedSessionStorage()?.sessionId
      || ""
    ).trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (sessionId) {
      headers["X-Kakeibo-Session"] = sessionId;
    }
    if (options.includeContentType !== false) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  function buildStateSnapshot() {
    ensureSerialCodes();
    return {
      expenses: state.expenses,
      transfers: state.transfers,
      childTransactions: state.childTransactions,
      householdIncomes: state.householdIncomes,
      categories: state.categories,
      categoryMasterConfig: state.categoryMasterConfig,
      otherPaymentMethods: state.otherPaymentMethods,
      serialCounters: state.serialCounters,
      dashboardBudgetConfig: state.dashboardBudgetConfig,
      settlementRules: state.settlementRules,
      householdPoolConfig: state.householdPoolConfig,
      recurringTemplateConfig: state.recurringTemplateConfig,
      monthlyCloseConfig: state.monthlyCloseConfig,
    };
  }

  function applySharedStateSnapshot(snapshot, options = {}) {
    const hasExpenses = Array.isArray(snapshot?.expenses);
    const nextExpenses = hasExpenses
      ? snapshot.expenses.map(normalizeExpense)
      : (Array.isArray(state.expenses) ? state.expenses : []);
    const nextTransfers = Array.isArray(snapshot?.transfers) ? snapshot.transfers.map(normalizeTransfer) : [];
    const nextChildTransactions = Array.isArray(snapshot?.childTransactions) ? snapshot.childTransactions.map(normalizeChildTransaction) : [];
    const nextHouseholdIncomes = Array.isArray(snapshot?.householdIncomes) ? snapshot.householdIncomes.map(normalizeHouseholdIncome) : [];
    const hasActivityLogs = Array.isArray(snapshot?.activityLogs);
    const nextActivityLogs = hasActivityLogs
      ? snapshot.activityLogs.map(normalizeActivityLog)
      : (Array.isArray(state.activityLogs) ? state.activityLogs : []);
    const nextCategories = mergeCategories(
      migrateLegacyChildRinCategories(
        Array.isArray(snapshot?.categories) && snapshot.categories.length
          ? snapshot.categories
          : DEFAULT_CATEGORIES
      )
    );
    const nextCategoryMasterConfig = getMigratedCategoryMasterConfig(snapshot?.categoryMasterConfig, nextCategories);
    const nextOtherPaymentMethods = mergeOtherPaymentMethods(
      Array.isArray(snapshot?.otherPaymentMethods) && snapshot.otherPaymentMethods.length
        ? snapshot.otherPaymentMethods
        : DEFAULT_OTHER_PAYMENT_METHODS
    );
    const nextSerialCounters = normalizeSerialCounters(snapshot?.serialCounters);
    const nextDashboardBudgetConfig = normalizeDashboardBudgetConfig(snapshot?.dashboardBudgetConfig);
    const nextSettlementRules = normalizeSettlementRules(snapshot?.settlementRules);
    const nextHouseholdPoolConfig = normalizeHouseholdPoolConfig(snapshot?.householdPoolConfig);
    const nextRecurringTemplateConfig = normalizeRecurringTemplateConfig(snapshot?.recurringTemplateConfig);
    const nextMonthlyCloseConfig = normalizeMonthlyCloseConfig(snapshot?.monthlyCloseConfig);
    const nextSharedSettingsMeta = snapshot?.sharedSettingsMeta && typeof snapshot.sharedSettingsMeta === "object"
      ? snapshot.sharedSettingsMeta
      : {};

    state.expenses = nextExpenses;
    state.expensesLoaded = hasExpenses ? true : Boolean(state.expensesLoaded);
    state.expensesLoading = false;
    state.transfers = nextTransfers;
    state.childTransactions = nextChildTransactions;
    state.householdIncomes = sortRecordsByDateDesc(nextHouseholdIncomes);
    state.activityLogs = nextActivityLogs.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
    state.activityLogsLoaded = hasActivityLogs;
    state.activityLogsLoading = false;
    state.categoryMasterConfig = nextCategoryMasterConfig;
    state.categories = getSelectableCategoryLabels(nextCategoryMasterConfig, nextCategories);
    state.otherPaymentMethods = nextOtherPaymentMethods;
    state.serialCounters = nextSerialCounters;
    state.dashboardBudgetConfig = nextDashboardBudgetConfig;
    state.settlementRules = nextSettlementRules;
    state.householdPoolConfig = nextHouseholdPoolConfig;
    state.recurringTemplateConfig = nextRecurringTemplateConfig;
    state.monthlyCloseConfig = nextMonthlyCloseConfig;
    state.sharedSettingsUpdatedAt = String(nextSharedSettingsMeta.updatedAt || state.sharedSettingsUpdatedAt || "").trim();
    state.sharedSettingsUpdatedBy = String(nextSharedSettingsMeta.updatedBy || state.sharedSettingsUpdatedBy || "").trim();
    state.storageMode = options.storageMode || "firestore";
    if (options.markLoaded !== false) {
      state.sharedStateLoaded = true;
    }
    ensureExpenseListHydratedFromExpenses();
    persist({ skipRemote: true });
    renderSelectOptions();
    renderAll();
    if (!options.preserveForms) {
      resetForm(false);
      resetTransferForm(false);
      resetChildForm(false);
    }
  }

  function hasMissingSharedSerialMetadata(snapshot) {
    const collections = [
      snapshot?.expenses,
      snapshot?.transfers,
      snapshot?.childTransactions,
      snapshot?.householdIncomes,
    ];
    const hasMissingRecordSerial = collections.some((rows) =>
      Array.isArray(rows) && rows.some((item) => !String(item?.serialCode || "").trim())
    );
    const counters = normalizeSerialCounters(snapshot?.serialCounters);
    return hasMissingRecordSerial || !Object.keys(counters).length;
  }

  function hasLegacyCategoryData(snapshot) {
    const categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
    const hasLegacyCategoryList = categories.some((category) => normalizeCategoryLabel(category) !== String(category || "").trim());
    const categoryMasterVersion = Number(snapshot?.categoryMasterConfig?.version) || 0;
    const masterCategories = Array.isArray(snapshot?.categoryMasterConfig?.categories) ? snapshot.categoryMasterConfig.categories : [];
    const hasLegacyMasterCategoryList = masterCategories.some((entry) => {
      const rawCode = String(entry?.code || "").trim();
      const rawLabel = String(entry?.label || "").trim();
      const normalizedLabel = normalizeCategoryLabel(rawLabel || rawCode);
      if (!rawLabel && !rawCode) return false;
      if (normalizedLabel !== rawLabel) return true;
      return normalizeCategoryCode(rawCode, rawLabel) !== rawCode;
    });
    const hasLegacyExpenseCategory = (Array.isArray(snapshot?.expenses) ? snapshot.expenses : []).some((item) => {
      const rawCategory = String(item?.category || "").trim();
      if (!rawCategory) return false;
      const normalizedCategory = normalizeCategoryLabel(rawCategory);
      const overrideLabel = getLegacyCategoryOverrideLabel(item);
      if (normalizedCategory !== rawCategory) return true;
      return Boolean(overrideLabel) && normalizedCategory !== overrideLabel;
    });
    return categoryMasterVersion < DEFAULT_CATEGORY_MASTER_CONFIG.version
      || hasLegacyCategoryList
      || hasLegacyMasterCategoryList
      || hasLegacyExpenseCategory;
  }

  function hasLegacyDashboardBudgetData(snapshot) {
    const config = snapshot?.dashboardBudgetConfig || {};
    if (Math.max(Number(config.version) || 0, 0) < DEFAULT_DASHBOARD_BUDGET_CONFIG.version) return true;
    const monthlyGroups = config.monthlyBudgetGroups && typeof config.monthlyBudgetGroups === "object"
      ? config.monthlyBudgetGroups
      : {};
    const annualGroups = config.annualBudgetGroups && typeof config.annualBudgetGroups === "object"
      ? config.annualBudgetGroups
      : {};
    if (Object.prototype.hasOwnProperty.call(config, "coreMonthlyBudgets")) return true;
    if (Object.prototype.hasOwnProperty.call(monthlyGroups, "child_child_daily")) return true;
    if (Object.prototype.hasOwnProperty.call(monthlyGroups, "child_child_expense")) return true;
    if (Object.prototype.hasOwnProperty.call(monthlyGroups, "specialAnnualBudget")) return true;
    if (Object.prototype.hasOwnProperty.call(annualGroups, "medical_birth_special")) return true;
    if (Object.prototype.hasOwnProperty.call(annualGroups, "birth_medical_special")) return true;
    if (Array.isArray(config.excludedAnnualGroups) && config.excludedAnnualGroups.length) return true;
    return false;
  }

  async function fetchSharedState(method, body, options = {}) {
    return fetchSharedApi(getSharedStateEndpoint({ cacheBust: String(method || "GET").toUpperCase() === "GET" }), method, body, options);
  }

  function hasLocallyUsableSharedState() {
    return Boolean(
      (Array.isArray(state.transfers) && state.transfers.length)
      || (Array.isArray(state.childTransactions) && state.childTransactions.length)
      || (Array.isArray(state.householdIncomes) && state.householdIncomes.length)
      || (Array.isArray(state.categories) && state.categories.length)
      || (Array.isArray(state.otherPaymentMethods) && state.otherPaymentMethods.length)
    );
  }

  async function ensureSharedStateLoaded(options = {}) {
    if (!canUseSharedStorage()) return false;
    if (state.sharedStateLoaded) return true;
    if (state.sharedStateLoadingPromise) return state.sharedStateLoadingPromise;
    state.sharedStateLoadingPromise = loadSharedStateFromBackend(options).finally(() => {
      state.sharedStateLoadingPromise = null;
    });
    return state.sharedStateLoadingPromise;
  }

  async function loadExpenseOverviewFromBackend(options = {}) {
    const delegated = callSharedSyncFeature("loadExpenseOverviewFromBackend", options);
    if (delegated !== undefined) return delegated;
    return false;
  }

  async function loadExpenseListFromBackend(options = {}) {
    const delegated = callSharedSyncFeature("loadExpenseListFromBackend", options);
    if (delegated !== undefined) return delegated;
    return false;
  }

  async function ensureAllExpensesLoaded(options = {}) {
    const delegated = callSharedSyncFeature("ensureAllExpensesLoaded", options);
    if (delegated !== undefined) return delegated;
    return false;
  }

  async function loadSharedStateFromBackend(options = {}) {
    const delegated = callSharedSyncFeature("loadSharedStateFromBackend", options);
    if (delegated !== undefined) return delegated;
    return false;
  }

  function normalizeSharedRecordForCollection(collectionKey, record) {
    if (!record || typeof record !== "object") return null;
    if (collectionKey === "expenses") return normalizeExpense(record);
    if (collectionKey === "transfers") return normalizeTransfer(record);
    if (collectionKey === "childTransactions") return normalizeChildTransaction(record);
    if (collectionKey === "householdIncomes") return normalizeHouseholdIncome(record);
    return record;
  }

  async function loadSharedRecord(collectionKey, recordId) {
    if (!canUseSharedStorage() || !collectionKey || !recordId) return null;
    try {
      const payload = await fetchSharedApi(getSharedRecordEndpoint(collectionKey, recordId), "GET");
        const record = normalizeSharedRecordForCollection(collectionKey, payload?.record);
        if (record?.id) {
          upsertStateRecord(collectionKey, record);
          if (collectionKey === "expenses") {
            upsertExpenseListRecord(record);
            recoverStoredReceiptUploadJobsFromRecords({ records: [record], autoStart: false });
            loadExpenseOverviewFromBackend({ silent: true }).catch(() => {});
          }
          persist({ skipRemote: true });
        }
      return record;
    } catch (error) {
      console.warn(`loadSharedRecord failed (${collectionKey}/${recordId})`, error);
      return null;
    }
  }

  async function loadActivityLogsFromBackend(options = {}) {
    if (!canUseSharedStorage()) {
      state.activityLogsLoaded = false;
      state.activityLogsLoading = false;
      return false;
    }
    if (state.activityLogsLoading) return false;
    state.activityLogsLoading = true;
    try {
      const payload = await fetchSharedApi("/api/activity-logs", "GET");
      const nextActivityLogs = Array.isArray(payload?.activityLogs)
        ? payload.activityLogs.map(normalizeActivityLog)
        : [];
      state.activityLogs = nextActivityLogs.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
      state.activityLogsLoaded = true;
      persist({ skipRemote: true });
      renderActivityHistory();
      return true;
    } catch (error) {
      console.error("loadActivityLogsFromBackend failed", error);
      if (!options.silent) {
        showSyncToast("変更履歴の取得に失敗しました。", "error", { duration: 3000 });
      }
      return false;
    } finally {
      state.activityLogsLoading = false;
    }
  }

  function scheduleSharedStateSync(reason = "save") {
    if (!canUseSharedStorage() || !state.sharedStateLoaded || state.sharedStateLoading) return;
    if (state.sharedSyncTimer) {
      window.clearTimeout(state.sharedSyncTimer);
    }
    state.sharedSyncTimer = window.setTimeout(() => {
      state.sharedSyncTimer = null;
      syncSharedStateToBackend(reason);
    }, SHARED_SYNC_DEBOUNCE_MS);
  }

  function clearPendingSharedSync() {
    if (!state.sharedSyncTimer) return;
    window.clearTimeout(state.sharedSyncTimer);
    state.sharedSyncTimer = null;
  }

  async function syncSharedStateToBackend(reason = "save", options = {}) {
    if (!canUseSharedStorage()) return false;
    if (!state.sharedStateLoaded && !options.force) return false;
    if (state.sharedSyncInFlight) {
      state.sharedSyncQueued = true;
      return state.sharedSyncPromise || false;
    }
    state.sharedSyncInFlight = true;
    const syncTask = (async () => {
      if (!state.expensesLoaded) {
        await ensureAllExpensesLoaded({ silent: true });
      }
      const payload = await fetchSharedState("PUT", { state: buildStateSnapshot(), reason });
      applySharedStateSnapshot(payload.state || {}, { storageMode: "firestore", preserveForms: true });
      return true;
    })();
    state.sharedSyncPromise = syncTask;
    try {
      const synced = await syncTask;
      state.lastSharedSyncError = null;
      return synced;
    } catch (error) {
      console.error("syncSharedStateToBackend failed", error);
      state.lastSharedSyncError = error;
      return false;
    } finally {
      state.sharedSyncPromise = null;
      state.sharedSyncInFlight = false;
      if (state.sharedSyncQueued) {
        state.sharedSyncQueued = false;
        scheduleSharedStateSync("queued");
      }
    }
  }

  async function waitForSharedSyncIdle() {
    if (!state.sharedSyncPromise) return;
    try {
      await state.sharedSyncPromise;
    } catch (error) {
      console.error("waitForSharedSyncIdle failed", error);
    }
  }

  function hideSyncToast() {
    if (!els.syncToast) return;
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    els.syncToast.classList.add("hidden");
    els.syncToast.classList.remove("is-pending", "is-success", "is-error");
    els.syncToast.textContent = "";
  }

  function showSyncToast(message, kind = "success", options = {}) {
    if (!els.syncToast) return;
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    els.syncToast.textContent = message;
    els.syncToast.classList.remove("hidden", "is-pending", "is-success", "is-error");
    els.syncToast.classList.add(`is-${kind}`);
    if (options.sticky) return;
    state.toastTimer = window.setTimeout(() => {
      hideSyncToast();
    }, options.duration || 2200);
  }

  function setAiAnalyzeBusy(mode = "", busy = false, message = "") {
    state.aiAnalyzeBusy = busy;
    state.aiAnalyzeMode = busy ? mode : "";
    [
      { mode: "image", element: els.receiptAnalyzeOverlay },
      { mode: "text", element: els.textAnalyzeOverlay },
    ].forEach(({ mode: targetMode, element }) => {
      if (!element) return;
      const active = busy && mode === targetMode;
      element.classList.toggle("hidden", !active);
      element.setAttribute("aria-hidden", active ? "false" : "true");
      const label = element.querySelector("[data-ai-loading-message]");
      if (label && message) label.textContent = message;
    });
    [els.aiAnalyzeButton, els.orderMailAnalyzeButton, els.receiptCameraButton, els.receiptFileButton, els.geminiModelOption].forEach((button) => {
      if (button) button.disabled = busy;
    });
  }

  function showAiErrorModal(message) {
    if (!els.aiErrorModal || !els.aiErrorMessage) {
      window.alert(message);
      return;
    }
    els.aiErrorMessage.textContent = message;
    els.aiErrorModal.classList.remove("hidden");
    els.aiErrorModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function getBackendErrorMessage(errorBody) {
    if (!errorBody || typeof errorBody !== "object") return "";
    const candidates = [
      errorBody?.error?.details?.error?.message,
      errorBody?.error?.details?.message,
      errorBody?.error?.message,
      errorBody?.message,
      errorBody?.error,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
    return "";
  }

  function hideAiErrorModal() {
    if (!els.aiErrorModal) return;
    els.aiErrorModal.classList.add("hidden");
    els.aiErrorModal.setAttribute("aria-hidden", "true");
    if (!state.expenseEditModalOpen && !state.entryFlowModalOpen && !state.crossBurdenModalOpen) {
      document.body.classList.remove("modal-open");
    }
  }

  async function persistAndSyncNow(reason, messages = {}) {
    persist({ skipRemote: true });
    if (!canUseSharedStorage()) {
      state.lastSharedSyncError = null;
      showSyncToast(messages.success || "保存しました。", "success");
      return true;
    }
    clearPendingSharedSync();
    showSyncToast(messages.pending || "共有データへ反映中です...", "pending", { sticky: true });
    await waitForSharedSyncIdle();
    const synced = await syncSharedStateToBackend(reason, { force: true });
    if (synced) {
      showSyncToast(messages.success || "共有データへ反映しました。", "success");
      return true;
    }
    showSyncToast(messages.error || "共有データへの反映に失敗しました。少し待って再度確認してください。", "error", { duration: 3200 });
    return false;
  }

  function getExpenseSyncFailureMessage(wasEditing) {
    const delegated = callExpensesFeature("getExpenseSyncFailureMessage", wasEditing);
    if (delegated !== undefined) return delegated;
    const fallback = wasEditing
      ? "支出更新の共有反映に失敗しました。入力内容は保持しているので、そのまま再保存できます。"
      : "支出登録の共有反映に失敗しました。入力内容は保持しているので、そのまま再保存できます。";
    const error = state.lastSharedSyncError;
    if (!error) return fallback;
    if (error.status === 401 || error.code === "missing_id_token") {
      return "Google 認証の期限切れで共有反映に失敗しました。入力内容は保持しているので、少し待って再保存するか Google で再ログインしてください。";
    }
    return fallback;
  }

  async function verifySharedRecordState(collectionKey, recordIds, shouldExist) {
    if (!canUseSharedStorage() || !recordIds || !collectionKey) return false;
    const reloaded = await loadSharedStateFromBackend({ silent: true });
    if (!reloaded) return false;
    const rows = Array.isArray(state[collectionKey]) ? state[collectionKey] : [];
    const ids = (Array.isArray(recordIds) ? recordIds : [recordIds]).filter(Boolean);
    if (!ids.length) return false;
    return ids.every((recordId) => {
      const exists = rows.some((item) => item.id === recordId);
      return shouldExist ? exists : !exists;
    });
  }

  function setStatusBadge(element, text, statusClass = "status-idle") {
    if (!element) return;
    element.textContent = text || "";
    element.classList.remove("status-idle", "status-checking", "status-ready", "status-warning", "status-error");
    element.classList.add(statusClass);
  }

  function updateConnectionStatusUI() {
      const isLoggedIn = Boolean(state.currentUser);
      const currentUserName = isLoggedIn
        ? (USER_LABELS[state.currentUser.email] || state.currentUser.name || state.currentUser.email)
        : "";
      const lastUserName = state.lastGoogleUser
        ? (USER_LABELS[state.lastGoogleUser.email] || state.lastGoogleUser.name || state.lastGoogleUser.email)
        : "";
      if (els.userName) {
        els.userName.textContent = isLoggedIn
          ? `${currentUserName}で利用中`
          : state.authCheckInProgress && lastUserName
            ? `${lastUserName}を確認中`
            : lastUserName
              ? `${lastUserName}は再接続待ち`
              : "Google未接続";
      }
      if (els.userMeta) {
        els.userMeta.textContent = "Google";
      }
      const googleLabel = isLoggedIn
        ? `${currentUserName} で接続済み`
        : state.authCheckInProgress
            ? "Google セッションを確認中"
          : state.lastGoogleUser
            ? `${lastUserName} を前回利用しました。今は再接続待ちです`
          : "Google ログインが必要";
      const googleStatusClass = isLoggedIn
        ? "status-ready"
        : state.authCheckInProgress
          ? "status-checking"
          : state.lastGoogleUser
            ? "status-warning"
            : "status-warning";
      setStatusBadge(
        els.authInlineStatus,
        isLoggedIn ? "Google接続済み" : state.authCheckInProgress ? "接続確認中" : state.lastGoogleUser ? "再接続待ち" : "要ログイン",
        googleStatusClass,
      );
      setText(els.googleAuthStatusLabel, googleLabel);

    const driveTextMap = {
      unknown: "Drive 状態は未確認です",
      checking: "Drive 利用状態を確認中です",
      ready: "Drive をこのセッションで利用できます",
      needs_auth: "Drive の再認証が必要です",
      error: state.driveStatus.message || "Drive の接続確認に失敗しました",
    };
    const folderTextMap = {
      unknown: "保存先フォルダは未確認です",
      configured: "固定フォルダまたは再設定済みフォルダを使用します",
      ready: "保存先フォルダへアクセスできます",
      missing: "保存先フォルダが未設定です",
      error: state.driveStatus.message || "保存先フォルダにアクセスできません",
    };
    setText(els.driveAuthStatusLabel, driveTextMap[state.driveStatus.drive] || "Drive 状態は未確認です");
    if (els.driveFolderLabel) {
      const configuredLabel = getDriveFolderStatusLabel();
      els.driveFolderLabel.textContent = configuredLabel || folderTextMap[state.driveStatus.folder] || "保存先フォルダは未確認です";
    }
    setText(els.driveHealthMessage, state.driveStatus.message || folderTextMap[state.driveStatus.folder] || "Drive は必要になった時か設定画面で確認します。");
  }

  function isAppleMobileDevice() {
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua);
  }

  function isStandalonePwa() {
    const matchStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
    return Boolean(matchStandalone || window.navigator.standalone === true);
  }

  function supportsPushNotifications() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  }

  function updatePushNotificationUI() {
    const pushState = state.pushNotifications;
    const supportLabel = !pushState.supported
      ? "この端末/ブラウザでは未対応"
      : pushState.standalone
        ? "通知を利用できます"
        : isAppleMobileDevice()
          ? "ホーム画面追加後に有効化できます"
          : "通知を利用できます";
    const permissionLabel = !pushState.supported
      ? "未対応"
      : pushState.permission === "granted"
        ? "許可済み"
        : pushState.permission === "denied"
          ? "ブロック中"
          : "未確認";
    const subscriptionLabel = !pushState.supported
      ? "未対応"
      : !canUseSharedStorage()
        ? "ログイン後に設定できます"
        : !pushState.serverEnabled
          ? "サーバー未設定"
          : pushState.subscribed
            ? "登録済み"
            : "未登録";
    setText(els.pushSupportLabel, supportLabel);
    setText(els.pushPermissionLabel, permissionLabel);
    setText(els.pushSubscriptionLabel, subscriptionLabel);
    setText(els.pushStatusMessage, pushState.message || "通知はまだ有効化されていません。");
    const canEnable = canUseSharedStorage()
      && pushState.supported
      && pushState.serverEnabled
      && (!isAppleMobileDevice() || pushState.standalone)
      && pushState.permission !== "denied";
    if (els.enablePushButton) {
      els.enablePushButton.disabled = !canEnable || pushState.subscribed;
    }
    if (els.disablePushButton) {
      els.disablePushButton.disabled = !pushState.supported || !pushState.subscribed;
    }
  }

  async function loadPushConfig(options = {}) {
    if (!canUseSharedStorage()) return false;
    const now = Date.now();
    if (!options.force && state.pushNotifications.configFetchedAt && now - state.pushNotifications.configFetchedAt < PUSH_CONFIG_CACHE_MS) {
      return state.pushNotifications.serverEnabled;
    }
    try {
      const payload = await fetchSharedApi("/api/push-config", "GET", null, { cacheBust: true });
      state.pushNotifications.serverEnabled = Boolean(payload?.enabled);
      state.pushNotifications.publicKey = String(payload?.vapidPublicKey || "").trim();
      state.pushNotifications.subject = String(payload?.subject || "").trim();
      state.pushNotifications.configFetchedAt = now;
      if (!state.pushNotifications.serverEnabled) {
        state.pushNotifications.message = "サーバー側の通知設定がまだ完了していません。";
      }
      updatePushNotificationUI();
      return state.pushNotifications.serverEnabled;
    } catch (error) {
      console.error("loadPushConfig failed", error);
      state.pushNotifications.message = "通知設定の確認に失敗しました。時間を置いて再度お試しください。";
      updatePushNotificationUI();
      return false;
    }
  }

  async function getBrowserPushSubscription() {
    if (!supportsPushNotifications()) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  async function refreshPushNotificationStatus(options = {}) {
    state.pushNotifications.supported = supportsPushNotifications();
    state.pushNotifications.standalone = isStandalonePwa();
    state.pushNotifications.permission = supportsPushNotifications() ? Notification.permission : "unsupported";
    if (!state.pushNotifications.supported) {
      state.pushNotifications.subscribed = false;
      state.pushNotifications.message = "この端末またはブラウザでは PWA 通知を利用できません。";
      updatePushNotificationUI();
      return false;
    }
    if (!canUseSharedStorage()) {
      state.pushNotifications.subscribed = false;
      state.pushNotifications.message = "Google ログイン後に、この端末の通知を有効化できます。";
      updatePushNotificationUI();
      return false;
    }
    if (options.forceConfig || !state.pushNotifications.configFetchedAt) {
      await loadPushConfig({ force: options.forceConfig });
    }
    try {
      const subscription = await getBrowserPushSubscription();
      state.pushNotifications.subscribed = Boolean(subscription);
    } catch (error) {
      console.error("refreshPushNotificationStatus failed", error);
      state.pushNotifications.subscribed = false;
      state.pushNotifications.message = "通知状態の確認に失敗しました。";
    }
    if (!state.pushNotifications.standalone && isAppleMobileDevice()) {
      state.pushNotifications.message = "iPhone では Safari の共有メニューから『ホーム画面に追加』した後、このアプリをホーム画面から開いてください。";
    } else if (state.pushNotifications.permission === "denied") {
      state.pushNotifications.message = "通知がブロックされています。iPhone またはブラウザ設定から通知を許可してください。";
    } else if (state.pushNotifications.subscribed) {
      state.pushNotifications.message = "この端末では PWA 通知を受け取れます。";
    } else if (state.pushNotifications.serverEnabled) {
      state.pushNotifications.message = "通知はまだ有効化されていません。必要ならこの端末で有効化してください。";
    }
    updatePushNotificationUI();
    return state.pushNotifications.subscribed;
  }

  async function enablePushNotifications() {
    if (!supportsPushNotifications()) {
      showSyncToast("この端末またはブラウザでは通知を有効化できません。", "error", { duration: 2800 });
      return;
    }
    if (!canUseSharedStorage()) {
      showSyncToast("先に Google ログインしてください。", "error", { duration: 2500 });
      return;
    }
    if (isAppleMobileDevice() && !isStandalonePwa()) {
      state.pushNotifications.message = "iPhone では Safari の共有メニューから『ホーム画面に追加』したアプリを開いてから有効化してください。";
      updatePushNotificationUI();
      showSyncToast("iPhone はホーム画面に追加したアプリから通知を有効化してください。", "error", { duration: 3200 });
      return;
    }
    const enabled = await loadPushConfig({ force: true });
    if (!enabled || !state.pushNotifications.publicKey) {
      showSyncToast("サーバー側の通知設定がまだ完了していません。", "error", { duration: 3200 });
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      state.pushNotifications.permission = permission;
      if (permission !== "granted") {
        state.pushNotifications.message = "通知が許可されなかったため、有効化できませんでした。";
        updatePushNotificationUI();
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(state.pushNotifications.publicKey),
        });
      }
      await fetchSharedApi("/api/push-subscriptions", "POST", {
        subscription: subscription.toJSON(),
      });
      state.pushNotifications.subscribed = true;
      state.pushNotifications.message = "この端末で PWA 通知を有効化しました。";
      updatePushNotificationUI();
      showSyncToast("PWA通知を有効化しました。", "success");
      await maybeNotifyAppVersionUpdate();
    } catch (error) {
      console.error("enablePushNotifications failed", error);
      state.pushNotifications.message = "通知の有効化に失敗しました。時間を置いて再度お試しください。";
      updatePushNotificationUI();
      showSyncToast("PWA通知の有効化に失敗しました。", "error", { duration: 3200 });
    }
  }

  async function disablePushNotifications() {
    if (!supportsPushNotifications()) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const payload = subscription ? subscription.toJSON() : null;
      if (subscription) {
        await subscription.unsubscribe();
      }
      if (payload?.endpoint && canUseSharedStorage()) {
        await fetchSharedApi("/api/push-subscriptions", "DELETE", {
          endpoint: payload.endpoint,
        });
      }
      state.pushNotifications.subscribed = false;
      state.pushNotifications.message = "この端末の PWA 通知を解除しました。";
      updatePushNotificationUI();
      showSyncToast("PWA通知を解除しました。", "success");
    } catch (error) {
      console.error("disablePushNotifications failed", error);
      state.pushNotifications.message = "通知解除に失敗しました。";
      updatePushNotificationUI();
      showSyncToast("PWA通知の解除に失敗しました。", "error", { duration: 3200 });
    }
  }

  function syncAuthUI() {
    return callAuthFeature("syncAuthUI");
  }

  async function logout() {
    await clearBackendSession().catch(() => false);
    clearSessionKeepaliveTimer();
    if (_idTokenRefreshTimer) {
      clearTimeout(_idTokenRefreshTimer);
      _idTokenRefreshTimer = null;
    }
    if (_autoLoginUiTimer) {
      clearTimeout(_autoLoginUiTimer);
      _autoLoginUiTimer = null;
    }
    if (_autoLoginRevealTimer) {
      clearTimeout(_autoLoginRevealTimer);
      _autoLoginRevealTimer = null;
    }
    if (state.sharedSyncTimer) {
      window.clearTimeout(state.sharedSyncTimer);
      state.sharedSyncTimer = null;
    }
    hideSyncToast();
    state.currentUser = null;
    state.lastGoogleUser = null;
    state.autoLoginAttempted = false;
    state.authCheckInProgress = false;
    resolveGoogleCredentialWaiters(false);
    sessionStorage.removeItem(SESSION_ID_TOKEN_KEY);
    clearDriveAccessTokenStorage();
    clearRememberedSessionStorage();
    google.accounts.id.disableAutoSelect?.();
    state.sharedStateLoaded = false;
    state.activityLogsLoaded = false;
    state.activityLogsLoading = false;
    state.storageMode = "local";
    state.driveStatus = {
      google: "idle",
      drive: "unknown",
      folder: state.driveFolderCache || config.drive?.folderId ? "configured" : "missing",
      message: "Drive は必要になった時か設定画面で確認します。",
    };
    state.pushNotifications = {
      supported: supportsPushNotifications(),
      standalone: isStandalonePwa(),
      permission: supportsPushNotifications() ? Notification.permission : "unsupported",
      subscribed: false,
      serverEnabled: false,
      publicKey: "",
      subject: "",
      configFetchedAt: 0,
      message: "Google ログイン後に、この端末の通知を有効化できます。",
    };
    persist({ skipRemote: true });
    syncAuthUI();
    switchTab("home");
  }

  function initGoogle() {
    const waitForGoogle = () => {
      if (!window.google?.accounts?.id) {
        window.setTimeout(waitForGoogle, 250);
        return;
      }

      state.googleReady = true;
      setupGoogleLogin();
      initDriveTokenClient();
      ensureDriveTokenClientReady({ timeoutMs: 4000, silent: true }).catch(() => {});
    };

    waitForGoogle();
  }

  function initDriveTokenClient() {
    const clientId = config.auth?.googleClientId;
    if (state.driveTokenClient) return state.driveTokenClient;
    if (!clientId || !window.google?.accounts?.oauth2?.initTokenClient) return null;
    const scope = (config.drive?.scopes || ["https://www.googleapis.com/auth/drive.file"]).join(" ");
    try {
      state.driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope,
        callback: () => {},
      });
      if (_driveTokenClientInitTimer) {
        window.clearTimeout(_driveTokenClientInitTimer);
        _driveTokenClientInitTimer = null;
      }
    } catch (error) {
      console.warn("initDriveTokenClient failed", error);
      state.driveTokenClient = null;
    }
    return state.driveTokenClient;
  }

  function ensureDriveTokenClientReady(options = {}) {
    if (state.driveTokenClient) return Promise.resolve(state.driveTokenClient);
    const timeoutMs = Number(options.timeoutMs) || 3000;
    const startAt = Date.now();
    return new Promise((resolve, reject) => {
      const tryInit = () => {
        const client = initDriveTokenClient();
        if (client) {
          resolve(client);
          return;
        }
        if (Date.now() - startAt >= timeoutMs) {
          const error = new Error("Drive token client が初期化されていません");
          error.code = "drive_client_unavailable";
          reject(error);
          return;
        }
        _driveTokenClientInitTimer = window.setTimeout(tryInit, 200);
      };
      tryInit();
    });
  }

  async function requestDriveAccessToken(promptValue = "") {
    await ensureDriveTokenClientReady({ timeoutMs: 4000 });
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutHandle = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error("Google Drive の認証がタイムアウトしました。もう一度お試しください。");
        error.code = "drive_auth_timeout";
        reject(error);
      }, DRIVE_TOKEN_REQUEST_TIMEOUT_MS);
      state.driveTokenClient.callback = (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutHandle);
        if (response.error) {
          const error = new Error(response.error_description || response.error);
          error.code = response.error;
          reject(error);
        } else {
          saveDriveAccessTokenStorage(response.access_token, response.expires_in);
          resolve(response.access_token);
        }
      };
      const hint = state.currentUser?.email || "";
      state.driveTokenClient.requestAccessToken({ prompt: promptValue, login_hint: hint });
    });
  }

  async function getDriveAccessToken(options = {}) {
    const cachedToken = getCachedDriveAccessToken();
    if (cachedToken) {
      state.driveStatus.drive = "ready";
      updateConnectionStatusUI();
      return cachedToken;
    }
    try {
      const accessToken = await requestDriveAccessToken("");
      state.driveStatus.drive = "ready";
      updateConnectionStatusUI();
      return accessToken;
    } catch (error) {
      if (options.allowInteractiveFallback === false) throw error;
      if (["popup_closed_by_user", "access_denied", "user_cancelled", "drive_auth_timeout"].includes(String(error?.code || ""))) {
        throw error;
      }
      const accessToken = await requestDriveAccessToken("consent");
      state.driveStatus.drive = "ready";
      updateConnectionStatusUI();
      return accessToken;
    }
  }

  function classifyDriveError(error) {
    const code = String(error?.code || "").trim().toLowerCase();
    const message = String(error?.message || error || "").trim();
    if (code === "drive_auth_timeout") {
      return "Google Drive の認証がタイムアウトしました。もう一度許可すると保存を再開できます。";
    }
    if (code === "popup_closed_by_user" || code === "access_denied" || code === "user_cancelled") {
      return "認証画面が閉じられたため、レシート画像はまだ保存されていません。もう一度お試しください。";
    }
    if (message.includes("フォルダが選択されませんでした") || message.includes("保存先フォルダ")) {
      return "保存先フォルダにアクセスできません。設定タブで共有フォルダを確認してください。";
    }
    if (message.includes("Failed to fetch") || message.includes("NetworkError") || code === "network_error") {
      return "ネットワークの問題で Google Drive へ接続できませんでした。通信状態を確認してから再度お試しください。";
    }
    if (message.includes("Drive upload 401") || message.includes("invalid_grant") || message.includes("token has been expired") || code === "invalid_grant") {
      clearDriveAccessTokenStorage();
      return "Google Drive の認証が期限切れです。もう一度許可すると保存を再開できます。";
    }
    return `Google Drive の認証または保存に失敗しました: ${message || "不明なエラー"}`;
  }

  // --- Drive フォルダ管理（Google Picker で共通共有フォルダを選択・固定） ---

  function getDriveFolderStorage() {
    try {
      const raw = localStorage.getItem(DRIVE_FOLDER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveDriveFolderStorage(folderId, folderName) {
    const data = { folderId, folderName: folderName || "", savedAt: new Date().toISOString() };
    localStorage.setItem(DRIVE_FOLDER_KEY, JSON.stringify(data));
    state.driveFolderCache = folderId;
    updateDriveFolderLabel();
  }

  function clearDriveFolderStorage() {
    localStorage.removeItem(DRIVE_FOLDER_KEY);
    state.driveFolderCache = null;
    state.driveStatus.folder = config.drive?.folderId ? "configured" : "missing";
    updateDriveFolderLabel();
  }

  function getDriveFolderStatusLabel() {
    const data = getDriveFolderStorage();
    if (data?.folderId) {
      return `再設定済み: ${data.folderName || ""} (ID: ${data.folderId})`;
    }
    const configFolderId = String(config.drive?.folderId || "").trim();
    if (configFolderId) {
      return `固定フォルダを使用中 (ID: ${configFolderId})`;
    }
    return "未設定（必要時のみ「保存先を再設定」を押してください）";
  }

  function updateDriveFolderLabel() {
    if (els.driveFolderLabel) {
      els.driveFolderLabel.textContent = getDriveFolderStatusLabel();
    }
    updateConnectionStatusUI();
  }

  function getPassiveDriveFolderId() {
    if (state.driveFolderCache) return state.driveFolderCache;
    const stored = getDriveFolderStorage();
    if (stored?.folderId) return stored.folderId;
    return String(config.drive?.folderId || "").trim();
  }

  async function verifyDriveFolderAccess(accessToken) {
    const folderId = getPassiveDriveFolderId();
    if (!folderId) {
      return {
        folder: "missing",
        message: "保存先フォルダが未設定です。必要なときだけ設定画面から再設定してください。",
      };
    }
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name&supportsAllDrives=true`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        return {
          folder: "ready",
          message: payload?.name
            ? `Drive と保存先フォルダを確認済みです（${payload.name}）。`
            : "Drive と保存先フォルダを確認済みです。",
        };
      }
      if (response.status === 401) {
        clearDriveAccessTokenStorage();
        return {
          folder: "configured",
          drive: "needs_auth",
          message: "Drive の再認証が必要です。保存時に自動で再確認します。",
        };
      }
      if (response.status === 403 || response.status === 404) {
        return {
          folder: "error",
          message: "保存先フォルダにアクセスできません。設定タブの「保存先を再設定」から復旧してください。",
        };
      }
      return {
        folder: "error",
        message: "保存先フォルダの確認に失敗しました。必要なら設定画面で再設定してください。",
      };
    } catch (error) {
      return {
        folder: "error",
        message: "ネットワークの問題で保存先フォルダを確認できませんでした。",
      };
    }
  }

  async function warmDriveSession(options = {}) {
    if (!state.currentUser) return false;
    try {
      await ensureDriveTokenClientReady({ timeoutMs: 3000, silent: true });
    } catch (_error) {
      state.driveStatus = {
        ...state.driveStatus,
        google: "ready",
        drive: "unknown",
        folder: getPassiveDriveFolderId() ? "configured" : "missing",
        message: "Drive は必要になった時か設定画面で確認します。",
      };
      updateConnectionStatusUI();
      return false;
    }
    state.driveStatus = {
      ...state.driveStatus,
      google: "ready",
      drive: "checking",
      message: options.updateMessage === false
        ? state.driveStatus.message
        : "Drive の利用状態を確認しています...",
    };
    updateConnectionStatusUI();
    try {
      const accessToken = await getDriveAccessToken({ allowInteractiveFallback: false });
      const folderState = await verifyDriveFolderAccess(accessToken);
      state.driveStatus = {
        ...state.driveStatus,
        google: "ready",
        drive: folderState.drive || "ready",
        folder: folderState.folder || "configured",
        message: folderState.message || "Drive と保存先フォルダを確認済みです。",
      };
      updateConnectionStatusUI();
      if ((folderState.drive || "ready") === "ready" && hasLegacyPendingReceiptUploads()) {
        resumePendingReceiptUploads({ interactive: false, silent: true }).catch(() => {});
      }
      return true;
    } catch (error) {
      state.driveStatus = {
        ...state.driveStatus,
        google: state.currentUser ? "ready" : "idle",
        drive: "needs_auth",
        folder: getPassiveDriveFolderId() ? "configured" : "missing",
        message: classifyDriveError(error),
      };
      updateConnectionStatusUI();
      return false;
    }
  }

  function setReceiptFlowStatus(partial = {}) {
    return callReceiptFeature("setReceiptFlowStatus", partial);
  }

  function renderReceiptFlowStatus() {
    return callReceiptFeature("renderReceiptFlowStatus");
  }

  function renderPendingReceiptUploadQueue() {
    const delegated = callReceiptFeature("renderPendingReceiptUploadQueue");
    if (delegated !== undefined) return delegated;
  }

  function upsertPendingReceiptUploadMeta(meta) {
    const normalized = normalizePendingReceiptUploadMeta(meta);
    if (!normalized) return null;
    const next = Array.isArray(state.pendingReceiptUploads) ? [...state.pendingReceiptUploads] : [];
    const index = next.findIndex((item) => item.jobId === normalized.jobId);
    if (index >= 0) {
      next[index] = normalized;
    } else {
      next.unshift(normalized);
    }
    state.pendingReceiptUploads = next;
    savePendingReceiptUploadQueueStorage();
    renderPendingReceiptUploadQueue();
    renderReceiptFlowStatus();
    return normalized;
  }

  async function removePendingReceiptUploadJob(jobId) {
    state.pendingReceiptUploads = (state.pendingReceiptUploads || []).filter((item) => item.jobId !== jobId);
    savePendingReceiptUploadQueueStorage();
    try {
      await deletePendingReceiptUploadBlob(jobId);
    } catch (error) {
      console.warn("Failed to remove pending receipt blob:", error);
    }
    renderPendingReceiptUploadQueue();
    renderReceiptFlowStatus();
  }

  function getReceiptPendingStatusFromError(error) {
    const code = String(error?.code || "").trim().toLowerCase();
    const message = String(error?.message || error || "").trim().toLowerCase();
    if (
      ["drive_auth_timeout", "popup_closed_by_user", "access_denied", "user_cancelled", "invalid_grant", "drive_folder_access_denied"].includes(code) ||
      message.includes("認証") ||
      message.includes("共有してください") ||
      message.includes("invalid_grant") ||
      message.includes("token has been expired")
    ) {
      return "needs_auth";
    }
    if (message.includes("ネットワーク") || message.includes("failed to fetch") || code === "network_error") {
      return "retryable_error";
    }
    return "failed";
  }

  // Google Picker を開き、ユーザーに共有フォルダを選択させる
  // scope: drive.file + drive.readonly で共有フォルダも表示可能
  function openFolderPickerWithToken(accessToken) {
    return new Promise((resolve, reject) => {
      if (!window.gapi) {
        reject(new Error("Google API が読み込まれていません。ページをリロードしてお試しください。"));
        return;
      }
      function buildPicker() {
        const folderView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
          .setSelectFolderEnabled(true)
          .setIncludeFolders(true);

        const picker = new google.picker.PickerBuilder()
          .setTitle("レシート保存先の共有フォルダを選択してください")
          .addView(folderView)
          .setOAuthToken(accessToken)
          .setCallback((data) => {
            const action = data[google.picker.Response.ACTION];
            if (action === google.picker.Action.PICKED) {
              const doc = data[google.picker.Response.DOCUMENTS][0];
              resolve({
                folderId: doc[google.picker.Document.ID],
                folderName: doc[google.picker.Document.NAME],
              });
            } else if (action === google.picker.Action.CANCEL) {
              reject(new Error("フォルダ選択がキャンセルされました"));
            }
          })
          .build();
        picker.setVisible(true);
      }
      gapi.load("picker", { callback: buildPicker });
    });
  }

  async function onDriveFolderPick() {
    setMessageState(els.driveFolderMessage, "保存先を再設定しています...", "pending");
    try {
      const accessToken = await getDriveAccessToken();
      const { folderId, folderName } = await openFolderPickerWithToken(accessToken);
      saveDriveFolderStorage(folderId, folderName);
      updateDriveFolderLabel();
      state.driveStatus.folder = "configured";
      setMessageState(els.driveFolderMessage, `保存先を再設定しました: 「${folderName}」`, "success");
      warmDriveSession({ updateMessage: false }).catch(() => {});
    } catch (err) {
      console.error("Folder pick error:", err);
      setMessageState(els.driveFolderMessage, classifyDriveError(err), "error");
      state.driveStatus.message = classifyDriveError(err);
      updateConnectionStatusUI();
    }
  }

  function onDriveFolderClear() {
    clearDriveFolderStorage();
    updateDriveFolderLabel();
    state.driveStatus.message = "保存先設定をクリアしました。固定フォルダがあれば次回から自動利用します。";
    updateConnectionStatusUI();
    setMessageState(els.driveFolderMessage, "保存先設定をクリアしました。固定フォルダが使える場合は次回から自動保存されます。", "warning");
  }

  async function getDriveFolderId(options = {}) {
    if (state.driveFolderCache) return state.driveFolderCache;
    const stored = getDriveFolderStorage();
    if (stored?.folderId) {
      state.driveFolderCache = stored.folderId;
      return state.driveFolderCache;
    }
    // config.js のデフォルトフォルダIDがあればそれを使用
    const configFolderId = config.drive?.folderId;
    if (configFolderId) {
      state.driveFolderCache = configFolderId;
      return state.driveFolderCache;
    }
    // 初回: Google Picker でフォルダ選択
    if (options.allowInteractiveAuth === false) {
      const error = new Error("保存先フォルダが未設定です。設定タブの『保存先を再設定』から選択してください。");
      error.code = "drive_folder_missing";
      throw error;
    }
    try {
      const accessToken = await getDriveAccessToken({
        allowInteractiveFallback: options.allowInteractiveAuth !== false,
      });
      const { folderId, folderName } = await openFolderPickerWithToken(accessToken);
      saveDriveFolderStorage(folderId, folderName);
      updateDriveFolderLabel();
      return folderId;
    } catch (err) {
      throw new Error("保存先フォルダを確認できませんでした。設定タブの「保存先を再設定」から復旧してください。");
    }
  }

  function setupGoogleLogin() {
    return callAuthFeature("setupGoogleLogin");
  }

  function attemptAutoGoogleSignIn() {
    return callAuthFeature("attemptAutoGoogleSignIn");
  }

  async function handleGoogleCredential(response) {
    return callAuthFeature("handleGoogleCredential", response);
  }

  function openReceiptInput(source) {
    return callReceiptFeature("openReceiptInput", source);
  }

  function toggleReceiptMoreActions() {
    return callReceiptFeature("toggleReceiptMoreActions");
  }

  const RECEIPT_QUEUE_MAX = 3;

  function startReceiptImageAutomation(options = {}) {
    return callReceiptFeature("startReceiptImageAutomation", options);
  }

  function scheduleReceiptDrivePreflight() {
    return callReceiptFeature("scheduleReceiptDrivePreflight");
  }

  function scheduleAutoReceiptAnalyze() {
    return callReceiptFeature("scheduleAutoReceiptAnalyze");
  }

  function onReceiptFileChange(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    const hasQueue = state.receiptQueue.length > 0 && state.receiptQueueIndex >= 0;
    if (hasQueue) {
      const remaining = RECEIPT_QUEUE_MAX - state.receiptQueue.length;
      if (remaining <= 0) {
        setText(els.receiptMessage, `レシート画像/PDFは最大${RECEIPT_QUEUE_MAX}ファイルまで選択できます。`);
        showSyncToast(`画像は最大${RECEIPT_QUEUE_MAX}枚まで選べます。現在${state.receiptQueue.length}枚選択中です。`, "warning", { duration: 3500 });
        if (els.receiptCameraFile) els.receiptCameraFile.value = "";
        if (els.receiptFile) els.receiptFile.value = "";
        return;
      }
      const toAdd = files.slice(0, remaining);
      if (files.length > remaining) {
        showSyncToast(`画像は最大${RECEIPT_QUEUE_MAX}枚まで選べます。${files.length - remaining}枚は追加されませんでした。`, "warning", { duration: 3500 });
      }
      state.receiptQueue = [...state.receiptQueue, ...toAdd];
      if (state.receiptQueueIndex < 0) state.receiptQueueIndex = 0;
      loadReceiptQueueItem(state.receiptQueueIndex, { autoAnalyze: false });
      renderReceiptQueue();
      if (els.receiptMoreToggle) els.receiptMoreToggle.classList.add("hidden");
      if (els.receiptMoreActions) els.receiptMoreActions.classList.add("hidden");
      setReceiptFlowStatus({
        analyze: "idle",
        drive: "idle",
        message: `${toAdd.length}ファイルを追加しました（計${state.receiptQueue.length}ファイル）。Gemini AI解析で内容を読み取ります。`,
      });
    } else {
      const selected = files.slice(0, RECEIPT_QUEUE_MAX);
      if (files.length > RECEIPT_QUEUE_MAX) {
        showSyncToast(`画像は最大${RECEIPT_QUEUE_MAX}枚まで選べます。${files.length - RECEIPT_QUEUE_MAX}枚は選択されませんでした。`, "warning", { duration: 3500 });
      }
      state.receiptQueue = selected;
      state.receiptQueueIndex = 0;
      state.receiptDraft.receiptAssets = [];
      state.receiptDraft.pendingReceiptAssets = [];
      state.receiptDraft.receiptAssetsEdited = false;
      state.receiptDraft.queueStorageSignature = "";
      loadReceiptQueueItem(0, { autoAnalyze: false });
      if (els.receiptMoreToggle) {
        els.receiptMoreToggle.classList.toggle("hidden", state.receiptQueue.length >= RECEIPT_QUEUE_MAX);
        els.receiptMoreToggle.textContent = "ファイルを追加する";
      }
      if (els.receiptMoreActions) els.receiptMoreActions.classList.add("hidden");
      setReceiptFlowStatus({
        analyze: "idle",
        drive: "idle",
        message: `${selected.length}ファイルを選択しました。Gemini AI解析で内容を読み取ります。`,
      });
    }
    if (els.receiptCameraFile) els.receiptCameraFile.value = "";
    if (els.receiptFile) els.receiptFile.value = "";
  }


  function clearReceiptDraft() {
    if (_receiptAutoAnalyzeTimer) {
      clearTimeout(_receiptAutoAnalyzeTimer);
      _receiptAutoAnalyzeTimer = null;
    }
    if (_receiptDrivePreflightTimer) {
      clearTimeout(_receiptDrivePreflightTimer);
      _receiptDrivePreflightTimer = null;
    }
    _receiptAutoAnalyzeQueued = false;
    _receiptStorageUploadFile = null;
    _receiptStorageUploadPromise = null;
    state.receiptQueue = [];
    state.receiptQueueIndex = -1;
    state.receiptDraft = {
      file: null,
      previewUrl: "",
      aiResult: null,
      aiSource: "",
      storageAssetId: "",
      storageUploadedAt: "",
      storageStatus: "",
      driveFileId: "",
      driveUrl: "",
      uploadedAt: "",
      uploadStatus: "",
      uploaderName: "",
      receiptAssets: [],
      pendingReceiptAssets: [],
      receiptAssetsEdited: false,
      queueStorageSignature: "",
    };
    state.receiptFlowStatus = {
      analyze: "idle",
      drive: "idle",
      message: "画像やPDFを最大3ファイルまで選び、Gemini AI解析ボタンで解析と一時保存を開始します。",
    };
    if (els.receiptCameraFile) els.receiptCameraFile.value = "";
    els.receiptFile.value = "";
    if (els.orderMailText) els.orderMailText.value = "";
    els.receiptPreview.src = "";
    els.receiptPreview.classList.add("hidden");
    els.receiptPreviewContainer.classList.add("empty");
    els.aiSuggestionBox.classList.add("hidden");
    if (els.receiptAttachSection) els.receiptAttachSection.classList.add("hidden");
    if (els.editReceiptFile) els.editReceiptFile.value = "";
    renderReceiptAssetList();
    if (els.receiptMoreToggle) {
      els.receiptMoreToggle.classList.add("hidden");
      els.receiptMoreToggle.textContent = "ファイルを追加する";
    }
    if (els.receiptMoreActions) els.receiptMoreActions.classList.add("hidden");
    renderReceiptQueue();
    setText(els.receiptMessage, "画像やPDFをクリアしました。");
    renderReceiptLinkedInfo();
  }

  async function onEditReceiptFileChange(event) {
    const files = Array.from(event.target?.files || []).filter(Boolean);
    if (!files.length) return;
    if (!els.expenseId?.value) {
      setText(els.formMessage, "既存支出を開いてからレシートを追加してください。");
      return;
    }
    setText(els.formMessage, `${files.length}件のレシートをCloud Storageへ保存しています...`);
    try {
      const uploadedAssets = [];
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const asset = await intakeReceiptToTemporaryStorage(file);
        const storageAssetId = String(asset.assetId || "").trim();
        if (!storageAssetId) throw new Error("Cloud Storage の保存IDが取得できませんでした。");
        uploadedAssets.push(normalizeReceiptAsset({
          id: storageAssetId,
          storageAssetId,
          storageUrl: getReceiptStorageAssetUrl(storageAssetId),
          fileName: file.name || "レシート画像",
          mimeType: file.type || "",
          source: "manual_attach",
          status: "storage_saved",
          uploadedAt: String(asset.uploadedAt || new Date().toISOString()),
          uploadedBy: state.currentUser?.email || "",
        }));
      }
      state.receiptDraft.pendingReceiptAssets = mergeReceiptAssets(
        state.receiptDraft.pendingReceiptAssets || [],
        uploadedAssets
      );
      state.receiptDraft.receiptAssetsEdited = true;
      const primary = getPrimaryReceiptAsset({ receiptAssets: mergeReceiptAssets(state.receiptDraft.receiptAssets || [], state.receiptDraft.pendingReceiptAssets || []) });
      if (primary && !state.receiptDraft.storageAssetId && !state.receiptDraft.driveUrl) {
        state.receiptDraft.storageAssetId = primary.storageAssetId || "";
        state.receiptDraft.storageUploadedAt = primary.uploadedAt || "";
        state.receiptDraft.storageStatus = primary.storageAssetId ? "stored" : "";
        state.receiptDraft.uploadStatus = primary.storageAssetId ? "storage_saved" : "";
      }
      renderReceiptLinkedInfo();
      renderReceiptAssetList();
      setText(els.formMessage, `${uploadedAssets.length}件のファイルを保存しました。保存ボタンを押すと、この支出に反映します。`);
    } catch (error) {
      console.error("onEditReceiptFileChange failed", error);
      setText(els.formMessage, error?.message || "レシート画像の追加に失敗しました。");
    } finally {
      if (els.editReceiptFile) els.editReceiptFile.value = "";
    }
  }

  async function analyzeReceipt(options = {}) {
    const automatic = options.automatic === true;
    const allFiles = state.receiptQueue.length > 0 ? state.receiptQueue : (state.receiptDraft.file ? [state.receiptDraft.file] : []);
    if (!allFiles.length) {
      setText(els.receiptMessage, "先にレシート画像またはPDFを選択してください。");
      return;
    }

    const fileLabel = allFiles.length > 1 ? `${allFiles.length}ファイルのレシート` : "レシート";
    setText(els.receiptMessage, `${fileLabel}のAI候補を抽出中です...`);
    setReceiptFlowStatus({
      analyze: "running",
      drive: canUseSharedStorage() ? "checking" : state.receiptFlowStatus.drive,
      message: `${fileLabel}のAI解析を開始しました。`,
    });
    hideAiErrorModal();
    setAiAnalyzeBusy("image", true, `${fileLabel}を解析中です...`);

    try {
      const storagePromise = canUseSharedStorage()
        ? ensureReceiptQueueAssetsStored({ required: false })
        : Promise.resolve(false);
      let result;
      let usedFallback = false;

      if (config.ai?.apiBaseUrl) {
        try {
          result = await analyzeWithBackend({ files: allFiles });
        } catch (error) {
          throw error;
        }
      } else {
        result = analyzeReceiptFallback(allFiles[0].name);
        usedFallback = true;
      }

        state.receiptDraft.aiResult = result;
        state.receiptDraft.aiSource = "image";
        applyAiResultToForm(result);
      renderAiSuggestions(result);
      if (state.entryFlowModalOpen) {
        advanceEntryFlowToForm();
      }
      await storagePromise;
      if (usedFallback) {
        setText(els.receiptMessage, "Gemini API が利用できなかったため、簡易候補を生成しました。内容を確認して修正してください。");
        setReceiptFlowStatus({ analyze: "fallback", message: "簡易候補を反映しました。必要なら手動で修正してください。" });
      } else {
        const successMessage = getAiFallbackNotice(result, "AI候補を反映しました。内容を確認して保存してください。");
        setText(els.receiptMessage, successMessage);
        setReceiptFlowStatus({ analyze: "done", message: successMessage });
      }
    } catch (error) {
      console.error(error);
      const message = getAiAnalyzeErrorMessage(error, "画像AI解析");
      setText(els.receiptMessage, message);
      setReceiptFlowStatus({ analyze: "error", message });
      if (!automatic) {
        showAiErrorModal(message);
      }
    } finally {
      setAiAnalyzeBusy("image", false);
      _receiptAutoAnalyzeQueued = false;
    }
  }

  async function analyzeOrderMailText() {
    const sourceText = String(els.orderMailText?.value || "").trim();
    if (!sourceText) {
      setText(els.receiptMessage, "注文メール本文を貼り付けてください。");
      return;
    }

    setText(els.receiptMessage, "貼り付けテキストをAI解析中です...");
    hideAiErrorModal();
    setAiAnalyzeBusy("text", true, "貼り付けテキストを解析中です...");

    try {
      let result;
      let usedFallback = false;

      if (config.ai?.apiBaseUrl) {
        try {
          result = await analyzeWithBackend({ sourceText });
        } catch (error) {
          throw error;
        }
      } else {
        result = analyzeOrderMailFallback(sourceText);
        usedFallback = true;
      }

        state.receiptDraft.aiResult = result;
        state.receiptDraft.aiSource = "text";
        applyAiResultToForm(result);
      renderAiSuggestions(result);
      if (state.entryFlowModalOpen) {
        advanceEntryFlowToForm();
      }
      if (usedFallback) {
        setText(els.receiptMessage, "Gemini API が利用できなかったため、貼り付け本文から簡易候補を生成しました。内容を確認して修正してください。");
      } else {
        setText(els.receiptMessage, getAiFallbackNotice(result, "貼り付けテキストからAI候補を反映しました。内容を確認して保存してください。"));
      }
    } catch (error) {
      console.error(error);
      const message = getAiAnalyzeErrorMessage(error, "テキストAI解析");
      setText(els.receiptMessage, message);
      showAiErrorModal(message);
    } finally {
      setAiAnalyzeBusy("text", false);
    }
  }

  async function analyzeWithBackend({ file = null, files = null, sourceText = "", allowAuthRetry = true } = {}) {
    const endpoint = `${config.ai.apiBaseUrl.replace(/\/$/, "")}/api/receipt/analyze`;
    const selectedModelOption = getSelectedGeminiModelOption();
    if (!confirmPaidGeminiModelOption(selectedModelOption)) {
      const error = new Error("有料APIの使用をキャンセルしました。");
      error.code = "paid_model_cancelled";
      throw error;
    }
    const basePayload = {
      categories: state.categories,
    };

    const fileList = files && files.length > 0 ? files : (file ? [file] : []);
    if (fileList.length > 0) {
      const imageDataList = await Promise.all(fileList.map(async (f) => ({
        base64: await fileToBase64(f),
        mimeType: f.type || "image/jpeg",
      })));
      basePayload.images = imageDataList;
    }
    if (sourceText) {
      basePayload.sourceText = sourceText;
    }

    const headers = await getAuthHeaders();
    const requestAnalyze = async (modelOption) => {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({
          ...basePayload,
          modelOption,
        }),
      });

      if (!response.ok) {
        let details = "";
        let message = "";
        let backendCode = "";
        try {
          const errorBody = await response.json();
          message = getBackendErrorMessage(errorBody);
          backendCode = String(errorBody?.code || errorBody?.error?.code || "").trim();
          details = message ? `: ${message}` : "";
        } catch (parseError) {
          details = "";
        }
        if (response.status === 401 && allowAuthRetry !== false && state.currentUser?.idToken) {
          state.currentUser = {
            ...state.currentUser,
            idToken: "",
          };
          sessionStorage.removeItem(SESSION_ID_TOKEN_KEY);
          persist({ skipRemote: true });
          const refreshed = await requestFreshGoogleCredential({
            message: "AI解析のため Google 認証を更新しています...",
            timeoutMs: 10000,
          });
          if (refreshed && state.currentUser?.idToken) {
            return analyzeWithBackend({ file, files, sourceText, allowAuthRetry: false });
          }
        }
        if (response.status === 401) {
          markAuthSessionExpired("Google セッションの期限が切れました。AI解析を使う時は、下の Google ボタンから再接続してください。");
        }
        const error = new Error(`Gemini error ${response.status}${details}`);
        error.status = response.status;
        error.apiMessage = message;
        error.code = backendCode;
        error.modelOption = modelOption;
        throw error;
      }

      const data = await response.json();
      return normalizeAiResult(data.result || data);
    };

    try {
      return await requestAnalyze(selectedModelOption);
    } catch (error) {
      if (shouldFallbackFromFreeGemini35To25(selectedModelOption, error)) {
        try {
          const fallbackResult = await requestAnalyze("free_gemini25");
          Object.defineProperty(fallbackResult, "aiFallbackNotice", {
            value: "Gemini 3.5 Freeが混み合っていたため、Gemini 2.5 Freeで解析しました。内容を確認してから保存してください。",
            enumerable: false,
            configurable: true,
          });
          return fallbackResult;
        } catch (fallbackError) {
          fallbackError.freeGeminiFallbackAttempted = true;
          fallbackError.initialModelOption = selectedModelOption;
          fallbackError.fallbackModelOption = "free_gemini25";
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  function shouldFallbackFromFreeGemini35To25(modelOption, error) {
    return modelOption === "free_gemini35" && isGeminiTemporaryCapacityError(error);
  }

  function isGeminiTemporaryCapacityError(error) {
    const status = Number(error?.status || 0);
    const code = String(error?.code || "").trim();
    if (
      status === 429 ||
      status === 400 ||
      status === 401 ||
      status === 403 ||
      [
        "GEMINI_RATE_LIMIT",
        "GEMINI_AUTH_ERROR",
        "GEMINI_MODEL_NOT_ALLOWED",
        "GEMINI_MODEL_OPTION_NOT_ALLOWED",
        "GEMINI_SAFETY_BLOCK",
        "GEMINI_INVALID_JSON",
        "GEMINI_MAX_TOKENS",
        "GEMINI_EMPTY_RESPONSE",
        "PAID_KEY_NOT_CONFIGURED",
      ].includes(code)
    ) {
      return false;
    }
    const text = [
      error?.message,
      error?.apiMessage,
      error?.code,
    ].filter(Boolean).join(" ").toLowerCase();
    return status === 503
      || text.includes("high demand")
      || text.includes("overloaded")
      || text.includes("unavailable")
      || text.includes("try again later")
      || (code === "GEMINI_TEMPORARY_ERROR" && status === 503);
  }

  function isGeminiResponseFormatError(error) {
    return ["GEMINI_INVALID_JSON", "GEMINI_MAX_TOKENS", "GEMINI_EMPTY_RESPONSE"].includes(String(error?.code || ""));
  }

  function isNetworkOrTimeoutError(error) {
    const text = [
      error?.message,
      error?.apiMessage,
      error?.code,
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes("failed to fetch")
      || text.includes("networkerror")
      || text.includes("network error")
      || text.includes("timeout")
      || text.includes("econnreset")
      || text.includes("etimedout");
  }

  function getAiFallbackNotice(result, defaultMessage) {
    return typeof result?.aiFallbackNotice === "string" && result.aiFallbackNotice
      ? result.aiFallbackNotice
      : defaultMessage;
  }

  function getSelectedGeminiModelOption() {
    const value = String(els.geminiModelOption?.value || config.ai?.modelOption || "free_gemini35").trim();
    const allowed = new Set(["free_gemini35", "free_gemini25", "paid_gemini35", "paid_gemini25"]);
    return allowed.has(value) ? value : "free_gemini35";
  }

  function isPaidGeminiModelOption(value) {
    return String(value || "").startsWith("paid_");
  }

  function confirmPaidGeminiModelOption(value) {
    if (!isPaidGeminiModelOption(value)) return true;
    return window.confirm("有料APIを使用します。Gemini APIの利用料金が発生する可能性があります。続行しますか？");
  }

  function updateGeminiModelNotice() {
    if (!els.geminiModelNotice) return;
    const selected = getSelectedGeminiModelOption();
    if (isPaidGeminiModelOption(selected)) {
      els.geminiModelNotice.textContent = "有料APIを手動選択中です。課金が発生する可能性があります。Free APIから有料APIへの自動fallbackは行いません。";
    } else {
      els.geminiModelNotice.textContent = "通常はFree APIを使います。有料APIは必要な時だけ手動選択できます。Free APIから有料APIへの自動fallbackは行いません。";
    }
  }

  async function intakeReceiptToTemporaryStorage(file) {
    if (!file) {
      const error = new Error("先にレシート画像またはPDFを選択してください。");
      error.code = "receipt_file_missing";
      throw error;
    }
    const endpoint = `${config.ai.apiBaseUrl.replace(/\/$/, "")}/api/receipt/intake`;
    const headers = await getAuthHeaders({ includeContentType: false });
    const form = new FormData();
    form.append("file", file, file.name || "receipt-image");
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: form,
    });
    if (!response.ok) {
      let message = "";
      let code = "";
      try {
        const errorBody = await response.json();
        message = String(errorBody?.error || "").trim();
        code = String(errorBody?.code || "").trim();
      } catch (error) {
        message = "";
      }
      if (response.status === 401) {
        markAuthSessionExpired("Google セッションの期限が切れました。レシート保存を続ける時は、下の Google ボタンから再接続してください。");
      }
      const nextError = new Error(message || `Temporary receipt upload failed: ${response.status}`);
      nextError.code = code || `receipt_intake_${response.status}`;
      nextError.status = response.status;
      throw nextError;
    }
    const data = await response.json();
    return data.asset || {};
  }

  async function ensureReceiptAssetStored(options = {}) {
    if (!state.currentUser || !state.receiptDraft.file) return false;
    if (state.receiptDraft.storageAssetId && state.receiptDraft.storageStatus === "stored") {
      return true;
    }
    const currentFile = state.receiptDraft.file;
    if (_receiptStorageUploadPromise && _receiptStorageUploadFile === currentFile) {
      return _receiptStorageUploadPromise;
    }
    state.receiptDraft.storageStatus = "uploading";
    renderReceiptLinkedInfo();
    const promise = (async () => {
      try {
        const asset = await intakeReceiptToTemporaryStorage(currentFile);
        if (state.receiptDraft.file !== currentFile) return false;
        state.receiptDraft.storageAssetId = String(asset.assetId || "").trim();
        state.receiptDraft.storageUploadedAt = String(asset.uploadedAt || "").trim();
        state.receiptDraft.storageStatus = state.receiptDraft.storageAssetId ? "stored" : "";
        if (!state.receiptDraft.uploadStatus) {
          state.receiptDraft.uploadStatus = state.receiptDraft.storageAssetId ? "storage_saved" : state.receiptDraft.uploadStatus;
        }
        setReceiptFlowStatus({
          drive: state.receiptDraft.storageAssetId ? "ready" : "idle",
          message: state.receiptDraft.storageAssetId
            ? "画像を保存しました。Driveへ保存する時は設定画面から同期できます。"
            : state.receiptFlowStatus.message,
        });
        renderReceiptLinkedInfo();
        return Boolean(state.receiptDraft.storageAssetId);
      } catch (error) {
        console.error("ensureReceiptAssetStored failed", error);
        if (state.receiptDraft.file === currentFile) {
          state.receiptDraft.storageStatus = "failed";
          setReceiptFlowStatus({
            drive: "needs_auth",
            message: "画像の保存に失敗しました。内容は残りますが、画像を確実に残すには再度お試しください。",
          });
          renderReceiptLinkedInfo();
        }
        if (options.required) {
          const nextError = new Error(`画像の保存に失敗したため、登録を中止しました: ${error?.message || error}`);
          nextError.code = error?.code || "receipt_storage_failed";
          throw nextError;
        }
        return false;
      }
    })();
    _receiptStorageUploadFile = currentFile;
    _receiptStorageUploadPromise = promise.finally(() => {
      if (_receiptStorageUploadFile === currentFile) {
        _receiptStorageUploadFile = null;
        _receiptStorageUploadPromise = null;
      }
    });
    return _receiptStorageUploadPromise;
  }

  function getAiAnalyzeErrorMessage(error, label) {
    if (error?.code === "missing_id_token" || error?.status === 401 || error?.status === 403) {
      return `${label}を使うには、Googleログインが必要です。画面下部のGoogleログインから再接続してください。`;
    }
    if (error?.code === "PAID_KEY_NOT_CONFIGURED") {
      return `${label}に失敗しました: 有料APIキーが未設定です。Free APIモデルを選ぶか、管理者に有料APIキー設定を依頼してください。`;
    }
    if (error?.code === "paid_model_cancelled") {
      return `${label}を中止しました。有料APIを使わない場合はFree APIモデルを選んでください。`;
    }
    if (error?.freeGeminiFallbackAttempted && isGeminiTemporaryCapacityError(error)) {
      return `${label}に失敗しました: Gemini 3.5 Freeと2.5 Freeの両方が一時的に混み合っています。数分後に再試行するか、手入力で登録してください。`;
    }
    if (error?.status === 429 || error?.code === "GEMINI_RATE_LIMIT") {
      return `${label}に失敗しました: 無料枠の利用上限に達した可能性があります。時間を置いて再試行するか、急ぎの場合は手入力で登録してください。有料APIへの自動切替は行いません。`;
    }
    if (isGeminiTemporaryCapacityError(error)) {
      return `${label}に失敗しました: Geminiが一時的に混み合っています。数分後にもう一度試すか、急ぎの場合は手入力で登録してください。`;
    }
    if (isGeminiResponseFormatError(error)) {
      return `${label}に失敗しました: AIの応答を家計簿形式に整えられませんでした。画像を撮り直すか、別のFreeモデルを選ぶか、手入力で登録してください。`;
    }
    if (error?.code === "GEMINI_SAFETY_BLOCK") {
      return `${label}に失敗しました: AIの安全フィルタにより解析できませんでした。画像の内容を確認し、撮り直すか、手入力で登録してください。`;
    }
    if (isNetworkOrTimeoutError(error)) {
      return `${label}に失敗しました: 通信が不安定、またはサーバー応答が途切れました。通信環境を確認して再試行してください。急ぎの場合は手入力で登録できます。`;
    }
    return `${label}に失敗しました: 一時的なエラーが発生しました。再試行するか、急ぎの場合は手入力で登録してください。`;
  }

  function analyzeReceiptFallback(fileName) {
    const base = fileName.replace(/\.[^.]+$/, "");
    const amountMatch = base.match(/(\d{2,6})/);
    const storeSeed = base.replace(/[_-]/g, " ").replace(/\d+/g, "").trim();
    return normalizeAiResult({
      storeName: storeSeed || "レシートから候補を抽出",
      amount: amountMatch ? Number(amountMatch[1]) : "",
      category: getPreferredCategoryFallback(),
      date: todayISO(),
      memo: "AI API未接続のため簡易推定です",
    });
  }

  function analyzeOrderMailFallback(sourceText) {
    const text = String(sourceText || "");
    const amountMatch =
      text.match(/支払い金額\s*([0-9,]+)[（(]?円/) ||
      text.match(/合計\s*[￥¥]?\s*([0-9,]+)/) ||
      text.match(/([0-9,]+)円 x 1個 = ([0-9,]+)円/);
    const pointMatch =
      text.match(/([0-9,]+)\s*ポイント獲得予定/) ||
      text.match(/([0-9,]+)\s*pt/i) ||
      text.match(/([0-9,]+)\s*ポイント/);
    const dateMatch =
      text.match(/注文日時\s*(\d{4}-\d{2}-\d{2})/) ||
      text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    const storeMatch =
      text.match(/Amazon\.co\.jp/) ||
      text.match(/楽天市場内のショップ「([^」]+)」/) ||
      text.match(/1 個のアイテム:\s*([^\r\n]+)/);
    const grossAmount = amountMatch ? Number(String(amountMatch[amountMatch.length - 1]).replace(/,/g, "")) : 0;
    const pointCredit = pointMatch ? Number(String(pointMatch[1]).replace(/,/g, "")) : 0;
    let date = todayISO();
    if (dateMatch) {
      if (dateMatch[1] && String(dateMatch[1]).includes("-")) {
        date = dateMatch[1];
      } else if (dateMatch[1] && dateMatch[2] && dateMatch[3]) {
        date = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`;
      }
    }
    const storeName = storeMatch
      ? (storeMatch[1] && !/Amazon\.co\.jp/.test(storeMatch[1]) ? storeMatch[1] : "Amazon.co.jp")
      : "注文メールから候補を抽出";
    return normalizeAiResult({
      storeName,
      grossAmount,
      pointCredit,
      amount: calculateNetAmount(grossAmount, pointCredit),
      category: state.categories.includes("その他") ? "その他" : getPreferredCategoryFallback(),
      date,
      memo: "注文確認メールからの簡易推定です",
    });
  }

  function normalizeAiResult(result) {
    const parentStoreName = typeof result?.storeName === "string" ? result.storeName : "";
    const grossAmount = Number(result.grossAmount ?? result.amount) > 0 ? Number(result.grossAmount ?? result.amount) : "";
    const pointCredit = Number(result.pointCredit) > 0 ? Number(result.pointCredit) : 0;
    const normalizedResultCategory = normalizeCategoryLabel(result?.category || "");
    const normalizedItems = Array.isArray(result.items)
      ? result.items
          .map((item) => ({
            name: String(item?.name || item?.storeName || item?.memo || "").trim(),
            storeName: normalizeAiItemStoreName(item, parentStoreName),
            amount: normalizeAiItemAmount(item),
            rawAmount: normalizeAiNullableNumber(item?.rawAmount ?? item?.amount),
            amountType: ["tax_included", "tax_excluded", "unknown"].includes(String(item?.amountType || "")) ? String(item.amountType) : "",
            category: normalizeCategoryLabel(item?.category) || (state.categories.includes("その他") ? "その他" : getPreferredCategoryFallback()),
            memo: typeof item?.memo === "string" ? item.memo : "",
            taxRate: Number.isFinite(Number(item?.taxRate)) ? Number(item.taxRate) : "",
            taxIncludedAmount: normalizeAiNullableNumber(item?.taxIncludedAmount),
            taxIncludedAmountBasis: ["receipt_explicit", "calculated", "unknown"].includes(String(item?.taxIncludedAmountBasis || "")) ? String(item.taxIncludedAmountBasis) : "",
            confidence: ["high", "medium", "low"].includes(String(item?.confidence || "").toLowerCase()) ? String(item.confidence).toLowerCase() : "",
            note: String(item?.note || "").trim(),
          }))
          .filter((item) => item.storeName || item.amount || item.memo)
          .filter((item) => !isSyntheticAiAdjustmentItem(item))
      : [];
    const normalizedTaxSummary = Array.isArray(result.taxSummary)
      ? result.taxSummary
          .map((item) => ({
            taxRate: normalizeAiNullableNumber(item?.taxRate),
            taxIncludedTotal: normalizeAiNullableNumber(item?.taxIncludedTotal),
            taxableSubtotal: normalizeAiNullableNumber(item?.taxableSubtotal),
            taxAmount: normalizeAiNullableNumber(item?.taxAmount),
            basis: ["receipt_explicit", "calculated", "unknown"].includes(String(item?.basis || "")) ? String(item.basis) : "",
          }))
          .filter((item) => item.taxIncludedTotal !== "")
      : [];
    const memoWarnings = Array.isArray(result.memoWarnings)
      ? result.memoWarnings.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    return {
      storeName: typeof result.storeName === "string" ? result.storeName : "",
      amount: Number(result.amount) > 0 ? Number(result.amount) : (grossAmount ? calculateNetAmount(grossAmount, pointCredit) : ""),
      grossAmount,
      pointCredit,
      category: normalizedResultCategory || (state.categories.includes("その他") ? "その他" : getPreferredCategoryFallback()),
      date: /^\d{4}-\d{2}-\d{2}$/.test(result.date || "") ? result.date : todayISO(),
      memo: typeof result.memo === "string" ? result.memo : "",
      paymentMethod: typeof result.paymentMethod === "string" ? result.paymentMethod : "",
      invoiceNumber: typeof result.invoiceNumber === "string" ? result.invoiceNumber : "",
      items: normalizedItems,
      taxSummary: normalizedTaxSummary,
      memoWarnings,
    };
  }

  function normalizeAiNullableNumber(value) {
    if (value === null || value === undefined || value === "") return "";
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : "";
  }

  function normalizeAiItemStoreName(item, parentStoreName = "") {
    const rawStoreName = String(item?.storeName || "").trim();
    const rawMemo = String(item?.memo || "").trim();
    const normalizedParent = String(parentStoreName || "").trim();
    if (rawStoreName && rawStoreName !== normalizedParent && rawStoreName !== "無印良品") {
      return rawStoreName;
    }
    if (rawMemo && rawMemo !== normalizedParent) {
      return rawMemo;
    }
    return rawStoreName || rawMemo || normalizedParent;
  }

  function normalizeAiItemAmount(item) {
    const taxIncludedAmount = Number(item?.taxIncludedAmount);
    if (Number.isFinite(taxIncludedAmount) && taxIncludedAmount !== 0) {
      return Math.round(taxIncludedAmount);
    }
    const taxExcludedAmount = Number(item?.taxExcludedAmount);
    const rawAmount = Number(item?.amount);
    const taxRate = Number(item?.taxRate);
    const quantity = Number(item?.quantity);
    if (
      Number.isFinite(taxExcludedAmount) &&
      taxExcludedAmount !== 0 &&
      Number.isFinite(taxRate) &&
      taxRate >= 0
    ) {
      const taxed = taxExcludedAmount * (100 + taxRate) / 100;
      return Math.round(Number.isFinite(quantity) && quantity > 1 ? taxed * quantity : taxed);
    }
    if (Number.isFinite(rawAmount) && rawAmount !== 0) {
      return Math.round(rawAmount);
    }
    return "";
  }

  function isSyntheticAiAdjustmentItem(item) {
    const label = `${String(item?.storeName || "").trim()} ${String(item?.memo || "").trim()}`.trim();
    if (!label) return false;
    return /(差額調整|差額合わせ|合計調整|帳尻合わせ|端数調整|レシート合計との差額|つじつま合わせ|小計|会計合計|お買上点数|消費税等|消費税|内税|外税|お預り|お釣り)/.test(label);
  }

  function applyAiResultToForm(result) {
    clearAiHighlights();
    const normalizedCategory = normalizeCategoryLabel(result.category || "");
    if (Array.isArray(result.items) && result.items.length > 1) {
      const aiSource = state.receiptDraft.aiSource || "image";
      if (aiSource === "image") {
        if (state.splitMode) {
          disableSplitMode(true);
        }
        if (result.storeName) {
          els.storeName.value = result.storeName || els.storeName.value;
          markAiField(els.storeName);
        }
        if (result.grossAmount || result.amount) {
          els.amount.value = result.grossAmount || result.amount;
          markAiField(els.amount);
        }
        if (els.pointCredit && (result.pointCredit || result.pointCredit === 0)) {
          els.pointCredit.value = result.pointCredit || "";
          markAiField(els.pointCredit);
        }
        if (normalizedCategory) {
          els.category.value = normalizedCategory;
          markAiField(els.category);
        }
        const generatedMemo = buildStructuredReceiptMemo(result) || String(result.memo || "").trim();
        if (generatedMemo && !els.memo.value) {
          els.memo.value = generatedMemo;
          markAiField(els.memo);
        }
        setText(
          els.formMessage,
          `AIが複数商品を検出しました。通常登録のまま保存できます。商品ごとに分けたい時だけ「${els.splitModeToggle?.textContent || "このレシートを分割する"}」を使ってください。`
        );
      } else {
      const baseEntry = buildSingleEntryValues();
      const splitEntries = result.items.map((item) =>
        createSplitEntry({
          storeName: item.storeName,
          amount: item.amount ? String(item.amount) : "",
          category: normalizeCategoryLabel(item.category) || (state.categories.includes("その他") ? "その他" : getPreferredCategoryFallback()),
          memo: item.memo || "",
          paymentMethod: baseEntry.paymentMethod,
          otherPaymentMethod: baseEntry.otherPaymentMethod,
          payer: baseEntry.payer,
          personalExpense: "family",
          allocationSource: "ai",
          })
        );
      enableSplitMode({
        mode: "ai-allocation",
        entries: splitEntries,
        receiptTotal: result.grossAmount || result.amount || "",
        message: "AIが複数商品を検出しました。商品ごとに負担先を選んで保存してください。",
      });
      if (result.grossAmount || result.amount) {
        markAiField(els.splitReceiptTotal);
      }
      }
      }
      if (state.splitMode) {
        if (result.grossAmount || result.amount) {
          els.splitReceiptTotal.value = result.grossAmount || result.amount;
          markAiField(els.splitReceiptTotal);
        }
        if (isAiReceiptSummaryMode()) {
          renderSplitEntrySection();
        } else if (state.splitEntries.length === 1) {
          const first = state.splitEntries[0];
          first.storeName = result.storeName || first.storeName;
          if (result.amount) first.amount = String(result.amount);
        if (normalizedCategory) first.category = normalizedCategory;
        if (result.memo && !first.memo) first.memo = result.memo;
        renderSplitEntrySection();
      }
    } else {
      if (result.storeName) {
        els.storeName.value = result.storeName || els.storeName.value;
        markAiField(els.storeName);
      }
      if (result.grossAmount || result.amount) {
        els.amount.value = result.grossAmount || result.amount;
        markAiField(els.amount);
      }
      if (els.pointCredit && (result.pointCredit || result.pointCredit === 0)) {
        els.pointCredit.value = result.pointCredit || "";
        markAiField(els.pointCredit);
      }
      if (normalizedCategory) {
        els.category.value = normalizedCategory;
        markAiField(els.category);
      }
      const generatedMemo = buildStructuredReceiptMemo(result) || String(result.memo || "").trim();
      if (generatedMemo && !els.memo.value) {
        els.memo.value = generatedMemo;
        markAiField(els.memo);
      }
    }
    if (result.date) {
      els.date.value = result.date;
      markAiField(els.date);
    }
    updateNetAmountPreview();
  }

  function renderAiSuggestions(result) {
    const extraBadges = [];
    const categoryLabel = normalizeCategoryLabel(result.category || "") || result.category || "未取得";
    if (Number(result.pointCredit || 0) > 0) {
      extraBadges.push(`<span class="badge">ポイント還元: ${formatCurrency(result.pointCredit)}</span>`);
    }
    if (Array.isArray(result.items) && result.items.length > 1) {
      extraBadges.push(`<span class="badge">分割候補: ${result.items.length}件</span>`);
    }
    if (result.paymentMethod) {
      extraBadges.push(`<span class="badge">支払い方法候補: ${escapeHtml(result.paymentMethod)}</span>`);
    }
    els.aiSuggestionBox.innerHTML = `
      <strong>AI候補</strong>
      <div class="badge-row" style="margin-top:10px;">
        <span class="badge">購入店: ${escapeHtml(result.storeName || "未取得")}</span>
        <span class="badge">金額: ${result.amount ? formatCurrency(result.amount) : "未取得"}</span>
        <span class="badge">カテゴリ: ${escapeHtml(categoryLabel)}</span>
        <span class="badge">利用日: ${escapeHtml(result.date || "未取得")}</span>
        ${extraBadges.join("")}
      </div>
    `;
    els.aiSuggestionBox.classList.remove("hidden");
  }

  function sanitizeFilenameSegment(str) {
    return String(str || "").replace(/[/\\:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
  }

  function normalizeReceiptDriveStoreName(value) {
    const normalized = sanitizeFilenameSegment(value);
    if (!normalized) return "レシート画像";
    const trimmed = normalized.replace(/\s+[^\s]+(?:店|支店|本店|営業所|センター)$/u, "").trim();
    return trimmed || normalized || "レシート画像";
  }

  function getReceiptDriveFileExtension(sourceName = "", mimeType = "") {
    const matched = String(sourceName || "").match(/\.[^.]+$/);
    if (matched?.[0]) return matched[0];
    return getReceiptBlobExtension(mimeType);
  }

  function buildReceiptDriveTotalAmount(value) {
    const amount = Math.round(Number(value) || 0);
    return Math.max(amount, 0);
  }

  function buildReceiptDriveFilenameFromContext(fileContext = {}, options = {}) {
    const datePart = String(fileContext.date || todayISO()).trim() || todayISO();
    const serialCode = sanitizeFilenameSegment(fileContext.serialCode || "NO-SERIAL") || "NO-SERIAL";
    const storeName = normalizeReceiptDriveStoreName(fileContext.storeName || "");
    const totalAmount = buildReceiptDriveTotalAmount(fileContext.totalAmount);
    const ext = getReceiptDriveFileExtension(options.sourceName || "", options.mimeType || "");
    const attachmentIndex = Number(fileContext.attachmentIndex || options.attachmentIndex || 0);
    const suffix = attachmentIndex > 1 ? `_${attachmentIndex}` : "";
    return `${datePart}_${serialCode}_${storeName}_${totalAmount}JPY${suffix}${ext}`;
  }

  async function ensureReceiptQueueAssetsStored(options = {}) {
    const files = state.receiptQueue.length > 0 ? state.receiptQueue : (state.receiptDraft.file ? [state.receiptDraft.file] : []);
    if (!state.currentUser || !files.length) return false;
    if (files.length === 1) return ensureReceiptAssetStored(options);
    const signature = files.map((file) => `${file.name || ""}:${file.size || 0}:${file.lastModified || 0}`).join("|");
    const existingAssets = mergeReceiptAssets(state.receiptDraft.receiptAssets || [], state.receiptDraft.pendingReceiptAssets || []);
    if (
      state.receiptDraft.queueStorageSignature === signature &&
      existingAssets.filter((asset) => asset.storageAssetId).length >= files.length
    ) {
      return true;
    }
    state.receiptDraft.storageStatus = "uploading";
    setReceiptFlowStatus({
      drive: "checking",
      message: `${files.length}個のファイルを保存しています...`,
    });
    renderReceiptLinkedInfo();
    try {
      const uploadedAssets = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        // eslint-disable-next-line no-await-in-loop
        const asset = await intakeReceiptToTemporaryStorage(file);
        const storageAssetId = String(asset.assetId || "").trim();
        if (!storageAssetId) throw new Error("Cloud Storage の保存IDが取得できませんでした。");
        uploadedAssets.push(normalizeReceiptAsset({
          id: storageAssetId,
          storageAssetId,
          storageUrl: getReceiptStorageAssetUrl(storageAssetId),
          fileName: file.name || `レシート${index + 1}`,
          mimeType: file.type || "",
          source: "ai_receipt",
          status: "storage_saved",
          uploadedAt: String(asset.uploadedAt || new Date().toISOString()),
          uploadedBy: state.currentUser?.email || "",
          isPrimary: index === 0,
        }));
      }
      state.receiptDraft.pendingReceiptAssets = mergeReceiptAssets(
        state.receiptDraft.receiptAssets || [],
        state.receiptDraft.pendingReceiptAssets || [],
        uploadedAssets
      );
      state.receiptDraft.receiptAssetsEdited = true;
      state.receiptDraft.queueStorageSignature = signature;
      applyPrimaryReceiptAssetToDraft(getPrimaryReceiptAsset({ receiptAssets: state.receiptDraft.pendingReceiptAssets }));
      state.receiptDraft.storageStatus = "stored";
      state.receiptDraft.uploadStatus = "storage_saved";
      setReceiptFlowStatus({
        drive: "ready",
        message: `${uploadedAssets.length}個のファイルを保存しました。Driveへ保存する時は設定画面から同期できます。`,
      });
      renderReceiptLinkedInfo();
      renderReceiptAssetList();
      return true;
    } catch (error) {
      console.error("ensureReceiptQueueAssetsStored failed", error);
      state.receiptDraft.storageStatus = "failed";
      setReceiptFlowStatus({
        drive: "needs_auth",
        message: "画像の保存に失敗しました。内容は残りますが、画像を確実に残すには再度お試しください。",
      });
      renderReceiptLinkedInfo();
      if (options.required) {
        const nextError = new Error(`画像の保存に失敗したため、登録を中止しました: ${error?.message || error}`);
        nextError.code = error?.code || "receipt_storage_failed";
        throw nextError;
      }
      return false;
    }
  }

  function buildReceiptDriveContextFromRecords(records = [], fallback = {}) {
    const normalizedRecords = (Array.isArray(records) ? records : [])
      .filter(Boolean)
      .map((record) => normalizeExpense(record))
      .sort((left, right) => (
        String(left?.date || "").localeCompare(String(right?.date || ""))
        || String(left?.createdAt || left?.updatedAt || "").localeCompare(String(right?.createdAt || right?.updatedAt || ""))
        || String(left?.id || "").localeCompare(String(right?.id || ""))
      ));
    const first = normalizedRecords[0] || {};
    const totalAmount = normalizedRecords.reduce((sum, record) => sum + Math.round(Number(record?.amount) || 0), 0);
    return {
      date: String(fallback.date || first.date || todayISO()).trim() || todayISO(),
      serialCode: String(fallback.serialCode || first.serialCode || first.id || "NO-SERIAL").trim() || "NO-SERIAL",
      storeName: String(fallback.storeName || first.storeName || "").trim(),
      totalAmount: buildReceiptDriveTotalAmount(
        fallback.totalAmount ?? totalAmount ?? first.amount ?? 0,
      ),
      category: String(fallback.category || first.category || "").trim(),
      memo: String(fallback.memo || first.memo || "").trim(),
    };
  }

  async function uploadFileToDrive(file, options = {}) {
    let accessToken = "";
    let folderId = "";
    try {
      accessToken = await getDriveAccessToken({
        allowInteractiveFallback: options.allowInteractiveAuth !== false,
      });
      folderId = await getDriveFolderId({
        allowInteractiveAuth: options.allowInteractiveAuth !== false,
      });
    } catch (error) {
      const nextError = new Error(classifyDriveError(error));
      nextError.code = error?.code || "drive_setup_failed";
      throw nextError;
    }

    const fileContext = options.fileContext || {};
    const now = new Date();
    const filename = options.useRawFilename
      ? (file?.name || "backup.zip")
      : buildReceiptDriveFilenameFromContext(fileContext, {
          sourceName: file?.name || "",
          mimeType: file?.type || "",
        });

    const metadata = options.overwriteId
      ? JSON.stringify({ name: filename })
      : JSON.stringify({ name: filename, parents: [folderId] });
    const form = new FormData();
    form.append("metadata", new Blob([metadata], { type: "application/json" }));
    form.append("file", file);

    const url = options.overwriteId
      ? `https://www.googleapis.com/upload/drive/v3/files/${options.overwriteId}?uploadType=multipart&fields=id`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";
    const method = options.overwriteId ? "PATCH" : "POST";

    const resp = await fetch(url, {
      method: method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const nextError = new Error(errBody?.error?.message || `Drive upload ${resp.status}`);
      nextError.code = resp.status === 401 ? "invalid_grant" : `drive_upload_${resp.status}`;
      throw nextError;
    }
    const data = await resp.json();
    const fileId = data.id;
    return {
      id: fileId,
      url: `https://drive.google.com/file/d/${fileId}/view`,
      uploadedAt: now.toISOString(),
      uploaderName: USER_LABELS[state.currentUser?.email] || "不明",
    };
  }

  async function findDriveBackupFile(accessToken, folderId, filename) {
    const q = `name = '${filename}' and '${folderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      throw new Error(`Drive search failed: ${resp.status}`);
    }
    const data = await resp.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  }

  function getReceiptBlobExtension(mimeType) {
    const type = String(mimeType || "").toLowerCase();
    if (type.includes("png")) return ".png";
    if (type.includes("webp")) return ".webp";
    if (type.includes("heic")) return ".heic";
    if (type.includes("pdf")) return ".pdf";
    return ".jpg";
  }

  function resolveReceiptExtension(fileName = "", mimeType = "", blobMimeType = "") {
    const fn = String(fileName || "").toLowerCase();
    const mt = String(mimeType || "").toLowerCase();
    const bmt = String(blobMimeType || "").toLowerCase();

    // 1. PDFと判定できる情報が1つでもあれば .pdf
    if (fn.includes("pdf") || mt.includes("pdf") || bmt.includes("pdf")) {
      return ".pdf";
    }

    // 2. 元のファイル名（fileName）に拡張子があれば、それを優先して維持する
    const matched = fn.match(/\.[^.]+$/);
    if (matched?.[0]) {
      return matched[0].toLowerCase();
    }

    // 3. 元のファイル名に拡張子がなく、MIMEタイプが判明している場合
    const allMimes = `${mt} ${bmt}`;
    if (allMimes.includes("png")) return ".png";
    if (allMimes.includes("webp")) return ".webp";
    if (allMimes.includes("heic")) return ".heic";
    if (allMimes.includes("jpeg") || allMimes.includes("jpg")) return ".jpg";

    // 4. 不明なら .jpg にしない（勝手にフォールバックさせない）
    return "";
  }

  function buildReceiptSyncFileName(record, blob) {
    const datePart = String(record?.date || todayISO()).trim() || todayISO();
    const serialCode = sanitizeFilenameSegment(record?.serialCode || record?.id || "NO-SERIAL") || "NO-SERIAL";
    const storeName = sanitizeFilenameSegment(record?.storeName || "レシート画像") || "レシート画像";
    const amount = buildReceiptDriveTotalAmount(record?.amount || 0);
    const attachmentIndex = Number(record?.attachmentIndex || 0);
    const assetId = String(record?.receiptStorageAssetId || "").trim();

    // 複数assetは _01 / _02 または asset由来suffixで衝突回避
    let suffix = "";
    if (attachmentIndex > 0) {
      suffix = `_${String(attachmentIndex).padStart(2, "0")}`;
    } else if (assetId) {
      suffix = `_${assetId.slice(0, 8)}`;
    }

    let originalFileName = "";
    let originalMimeType = "";
    if (assetId) {
      const assets = getReceiptAssets(record);
      const asset = assets.find((a) => String(a.storageAssetId || a.id || "").trim() === assetId);
      if (asset) {
        originalFileName = asset.fileName || "";
        originalMimeType = asset.mimeType || "";
      }
    }

    const ext = resolveReceiptExtension(originalFileName, originalMimeType, blob?.type);
    return `${datePart}_${serialCode}_${storeName}_${amount}JPY${suffix}${ext}`;
  }

  async function normalizeDriveReceiptFilenames() {
    const endpoint = `${getSharedApiBase()}/api/receipt/drive-normalize`;
    const headers = await getAuthHeaders();
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify({}),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || `Drive rename ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload || {};
  }

  async function fetchReceiptStorageAssetAsFile(record) {
    const assetId = String(record?.receiptStorageAssetId || "").trim();
    if (!assetId) throw new Error("Cloud Storage のレシートIDが見つかりません。");
    const url = getReceiptStorageAssetUrl(assetId);
    if (!url) throw new Error("Cloud Storage のレシート取得URLを作れませんでした。");
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: await getAuthHeaders({ includeContentType: false }),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        markAuthSessionExpired("Google セッションの期限が切れました。レシート画像を開く時は、下の Google ボタンから再接続してください。");
      }
      const error = new Error(payload?.error || `Cloud Storage レシート取得に失敗しました (${response.status})`);
      error.status = response.status;
      error.code = payload?.code || `receipt_asset_${response.status}`;
      throw error;
    }
    const blob = await response.blob();
    return new File([blob], buildReceiptSyncFileName(record, blob), {
      type: blob.type || "application/octet-stream",
    });
  }

  function hasDriveReceipt(record) {
    const driveFileId = String(record?.receiptDriveFileId || "").trim();
    const fileId = String(record?.receiptFileId || "").trim();
    const driveUrl = String(record?.receiptDriveUrl || "").trim();
    const receiptUrl = String(record?.receiptUrl || "").trim();
    return Boolean(driveFileId || (fileId && !isGcsReceiptFileId(fileId)) || driveUrl || isDriveReceiptUrl(receiptUrl));
  }

  function collectDriveSyncReceiptGroups() {
    const grouped = new Map();
    (Array.isArray(state.expenses) ? state.expenses : []).forEach((record) => {
      const normalized = normalizeExpense(record);
      getReceiptAssets(normalized).forEach((asset, index) => {
        const assetId = String(asset.storageAssetId || "").trim();
        if (!assetId || asset.driveUrl || asset.driveFileId) return;
        const group = grouped.get(assetId) || { assetId, asset, records: [], attachmentIndex: index + 1 };
        group.records.push(normalized);
        grouped.set(assetId, group);
      });
    });
    return [...grouped.values()];
  }

  function setDriveReceiptSyncStatus(message, tone = "muted") {
    if (els.driveReceiptSyncMessage) setMessageState(els.driveReceiptSyncMessage, message || "", tone);
    if (els.driveReceiptSyncSummary && message) setText(els.driveReceiptSyncSummary, message);
  }

  async function syncStoredReceiptsToDrive() {
    if (!canUseSharedStorage()) {
      setDriveReceiptSyncStatus("先に Google ログインしてください。", "warning");
      showSyncToast("先に Google ログインしてください。", "error", { duration: 2600 });
      return;
    }
    const button = els.driveReceiptSyncButton;
    if (button) {
      button.disabled = true;
      button.textContent = "Driveへ同期中...";
    }
    try {
      setDriveReceiptSyncStatus("Drive未反映のレシートを確認しています...", "muted");
      const loaded = await ensureAllExpensesLoaded({ silent: false, forceRefresh: true });
      if (!loaded) throw new Error("支出データの読み込みに失敗しました。");
      const groups = collectDriveSyncReceiptGroups();
      if (groups.length && !window.confirm(`${groups.length}件のレシート画像を Google Drive へ一括同期します。\n\n同期後は一覧・検索のリンクをDriveリンクへ更新し、既存の Drive ファイル名も最新ルールへ整えます。よろしいですか？`)) {
        setDriveReceiptSyncStatus("Drive一括同期をキャンセルしました。", "muted");
        return;
      }
      let successCount = 0;
      let failureCount = 0;
      const errors = [];
      for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index];
        const first = group.records[0] || {};
        setDriveReceiptSyncStatus(`Driveへ同期中です... ${index + 1}/${groups.length} (${first.storeName || "レシート"})`, "muted");
        try {
          // eslint-disable-next-line no-await-in-loop
          const file = await fetchReceiptStorageAssetAsFile({
            ...first,
            receiptStorageAssetId: group.assetId,
            attachmentIndex: group.attachmentIndex,
          });
          // eslint-disable-next-line no-await-in-loop
          const uploaded = await uploadFileToDrive(file, {
            allowInteractiveAuth: true,
            fileContext: {
              ...buildReceiptDriveContextFromRecords(group.records),
              attachmentIndex: group.attachmentIndex,
            },
          });
          const uploadedAt = uploaded.uploadedAt || new Date().toISOString();
          const updatedAsset = normalizeReceiptAsset({
            ...(group.asset || {}),
            storageAssetId: group.assetId,
            driveUrl: uploaded.url,
            driveFileId: uploaded.id,
            status: "drive_synced",
            uploadedAt,
            uploadedBy: state.currentUser?.email || "",
          });
          const fields = {
            receiptUrl: uploaded.url,
            receiptFileId: uploaded.id,
            receiptDriveUrl: uploaded.url,
            receiptDriveFileId: uploaded.id,
            receiptUploadedAt: uploadedAt,
            receiptUploadStatus: "success",
            receiptUploadError: "",
            receiptUploaderName: uploaded.uploaderName || "",
            receiptStorageAssetId: group.assetId,
            receiptStorageStatus: "drive_synced",
            receiptStorageDriveSyncedAt: uploadedAt,
            receiptAssetUpdate: updatedAsset,
          };
          const recordIds = group.records.map((record) => record.id).filter(Boolean);
          // eslint-disable-next-line no-await-in-loop
          const saved = await persistReceiptUploadForRecords(recordIds, fields);
          if (!saved) throw new Error("Driveリンクの明細反映に失敗しました。");
          successCount += 1;
        } catch (error) {
          console.error("Drive receipt batch sync failed", group.assetId, error);
          failureCount += 1;
          errors.push(`${first.storeName || group.assetId}: ${classifyDriveError(error) || error?.message || error}`);
        }
      }
      setDriveReceiptSyncStatus("Drive ファイル名を整えています...", "muted");
      const renameResult = await normalizeDriveReceiptFilenames();
      await ensureAllExpensesLoaded({ silent: true, forceRefresh: true });
      await loadExpenseListFromBackend({ reset: true, silent: true });
      renderAll();
      const renameSummary = renameResult?.renamed || renameResult?.relinked
        ? ` / 名前整理 ${Number(renameResult?.renamed || 0)}件 / リンク補正 ${Number(renameResult?.relinked || 0)}件`
        : "";
      const renameFailureSummary = Array.isArray(renameResult?.failures) && renameResult.failures.length
        ? ` / 名前整理失敗: ${renameResult.failures.slice(0, 1).join(" / ")}`
        : "";
      const message = failureCount
        ? `Drive同期 ${successCount}件完了 / ${failureCount}件失敗${renameSummary}${renameFailureSummary}。${errors.slice(0, 2).join(" / ")}`
        : groups.length
          ? `Drive同期が完了しました。${successCount}件のレシートリンクをDriveへ更新しました。${renameSummary}${renameFailureSummary}`
          : renameSummary || renameFailureSummary
            ? `Drive未反映レシートはありませんでしたが、既存 Drive ファイル名を確認しました。${renameSummary}${renameFailureSummary}`
            : "Drive未反映レシートはなく、既存 Drive ファイル名も最新ルールのままでした。";
      setDriveReceiptSyncStatus(message, failureCount ? "warning" : "success");
      showSyncToast(message, failureCount ? "error" : "success", { duration: failureCount ? 5200 : 3200 });

      // 最新のFirestoreバックアップデータも同時に Google Drive へコピー
      setDriveReceiptSyncStatus("最新のFirestoreバックアップをGoogle Driveへ同期しています...", "muted");
      try {
        const authHeaders = await getAuthHeaders({ includeContentType: false });
        const backupRes = await fetch("/api/backup/latest-zip", {
          headers: authHeaders
        });
        if (!backupRes.ok) {
          throw new Error(`バックアップ取得エラー (HTTP ${backupRes.status})`);
        }
        const backupBlob = await backupRes.blob();
        const tokyoParts = getTokyoDateParts();
        const backupFilename = `kakeibo_database_backup_${tokyoParts.compactDate}.zip`;
        const backupFile = new File([backupBlob], backupFilename, {
          type: "application/zip"
        });

        let overwriteId = null;
        try {
          const accessToken = await getDriveAccessToken({ allowInteractiveFallback: false });
          const folderId = await getDriveFolderId({ allowInteractiveAuth: false });
          overwriteId = await findDriveBackupFile(accessToken, folderId, backupFilename);
        } catch (searchErr) {
          console.warn("Failed to search for duplicate backup file, will proceed to POST:", searchErr);
        }

        await uploadFileToDrive(backupFile, {
          allowInteractiveAuth: true,
          useRawFilename: true,
          overwriteId: overwriteId,
          fileContext: {
            storeName: "Firestoreバックアップ",
            date: tokyoParts.isoDate,
            amount: 0,
            memo: "世代管理自動バックアップデータ",
          }
        });
        const backupMsg = overwriteId
          ? " (Firestoreバックアップを同日上書き更新しました。)"
          : " (Firestoreバックアップを新規保存しました。)";
        setDriveReceiptSyncStatus(`${message}${backupMsg}`, failureCount ? "warning" : "success");
      } catch (backupErr) {
        console.error("Firestore backup sync to Drive failed:", backupErr);
        setDriveReceiptSyncStatus(`${message} (警告: バックアップのDrive同期のみ失敗: ${backupErr.message || backupErr})`, "warning");
      }
    } catch (error) {
      console.error("syncStoredReceiptsToDrive failed", error);
      const message = classifyDriveError(error) || error?.message || "Drive一括同期に失敗しました。";
      setDriveReceiptSyncStatus(message, "error");
      showSyncToast(message, "error", { duration: 4200 });
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Google Driveへ一括同期";
      }
    }
  }

  function onPaymentMethodChange() {
    const isOther = isOtherPaymentMethod(els.paymentMethod.value);
    els.otherPaymentWrapper.classList.toggle("hidden", !isOther);
    els.otherPaymentMethod.required = isOther;
    if (isOther && !els.otherPaymentMethod.value) {
      els.otherPaymentMethod.value = getDefaultOtherPaymentMethod();
    }
    if (!isOther) els.otherPaymentMethod.value = "";

    updateFamilyCardWarning();
  }

  function getBillingTargetFromPaymentMethod(paymentMethod) {
    if (paymentMethod === "husband_card") return "husband_card";
    if (paymentMethod === "wife_card") return "wife_card";
    return "other";
  }

    function mergeCategories(categories = []) {
      const merged = [...DEFAULT_CATEGORIES];
      (categories || []).forEach((category) => {
        const label = normalizeCategoryLabel(category);
        if (label && !merged.includes(label)) merged.push(label);
      });
      return merged;
    }

  function normalizeCategoryLabel(category) {
    const label = String(category || "").trim();
    if (!label) return "";
    return CATEGORY_ALIAS_MAP[label] || CATEGORY_LABEL_BY_CODE[label] || label;
  }

  function getLegacyCategoryOverrideLabel(item) {
    const joined = [
      item?.storeName,
      item?.memo,
      item?.category,
      item?.otherPaymentMethod,
    ].filter(Boolean).join(" ");
    if (["自動車保険", "車保険", "自動車税", "車整備", "車両整備"].some((keyword) => joined.includes(keyword))) {
      return "車両維持費";
    }
    return "";
  }

  function getGrossAmountInput() {
    return Number(els.amount?.value) || 0;
  }

  function getPointCreditInput() {
    return Math.max(Number(els.pointCredit?.value) || 0, 0);
  }

  function calculateNetAmount(grossAmount, pointCredit) {
    return Number(grossAmount || 0) - Math.max(Number(pointCredit) || 0, 0);
  }

    function updateNetAmountPreview() {
      if (!els.netAmountPreview || !els.pointCreditPreview) return;
      const grossAmount = getGrossAmountInput();
      const pointCredit = getPointCreditInput();
      const netAmount = calculateNetAmount(grossAmount, pointCredit);
      const netLabel = getNetAmountDisplayLabel({ personalExpense: els.personalExpense?.value || "family" });
      els.netAmountPreview.textContent = formatCurrency(netAmount);
      if (els.netAmountLabel) els.netAmountLabel.textContent = `${netLabel}額`;
      if (!grossAmount && !pointCredit) {
        els.pointCreditPreview.textContent = `支出額・ポイント還元・${netLabel}額を別々に保持します。`;
        return;
      }
      els.pointCreditPreview.textContent = `支出額 ${formatCurrency(grossAmount)} / ポイント還元 ${formatCurrency(pointCredit)} / ${netLabel} ${formatCurrency(netAmount)}`;
    }

  function buildSingleEntryValues() {
    return {
      storeName: els.storeName.value.trim(),
      grossAmount: els.amount.value,
      pointCredit: els.pointCredit?.value || "",
      category: els.category.value,
      payer: els.payer.value,
      paymentMethod: normalizePaymentMethodCode(els.paymentMethod.value, els.payer.value),
      otherPaymentMethod: normalizeOtherPaymentMethodLabel(els.otherPaymentMethod.value),
      personalExpense: els.personalExpense?.value || "family",
      memo: els.memo.value.trim(),
    };
  }

  function applySingleEntryValues(values, options = {}) {
    const entry = values || {};
    const fallbackCategory = getPreferredCategoryFallback();
    clearAiHighlights();
    els.storeName.value = entry.storeName || "";
    els.amount.value = entry.grossAmount ?? entry.amount ?? "";
    if (els.pointCredit) els.pointCredit.value = entry.pointCredit ?? "";
    els.category.value = normalizeCategoryLabel(entry.category) || fallbackCategory;
    els.payer.value = entry.payer || (state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband");
      els.paymentMethod.value = normalizePaymentMethodCode(
        entry.paymentMethod || getDefaultPaymentMethodForCurrentUser(),
        els.payer.value
      );
      els.otherPaymentMethod.value = normalizeOtherPaymentMethodLabel(entry.otherPaymentMethod) || getDefaultOtherPaymentMethod();
    if (els.personalExpense) els.personalExpense.value = entry.personalExpense || "family";
    els.memo.value = entry.memo || "";
    onPaymentMethodChange();
    updateNetAmountPreview();
    if (!options.preserveMessage) {
      setText(els.formMessage, "");
    }
  }

  function getExpenseTemplateItems() {
    return normalizeRecurringTemplateConfig(state.recurringTemplateConfig).templates
      .filter((template) => template.active !== false)
      .sort((a, b) => String(a.label || a.storeName || "").localeCompare(String(b.label || b.storeName || ""), "ja"));
  }

  function getExpenseTemplateTargetMonth() {
    const pickerMonth = String(els.expenseTemplateStatusMonth?.value || "").trim();
    if (/^\d{4}-\d{2}$/.test(pickerMonth)) return pickerMonth;
    const rawDate = String(els.date?.value || todayISO()).trim();
    const monthKey = rawDate.slice(0, 7);
    return /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : currentMonth();
  }

  function getExpenseTemplateMatchText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getExpenseTemplateRegisteredMatches(template, index, targetMonth = getExpenseTemplateTargetMonth()) {
    if (!state.expensesLoaded) return { loading: true, matches: [] };
    const safeTemplate = normalizeRecurringTemplateEntry(template, index);
    const storeKey = getExpenseTemplateMatchText(safeTemplate.storeName || safeTemplate.label);
    const categoryKey = normalizeCategoryLabel(safeTemplate.category || "");
    const amount = Math.round(Number(safeTemplate.amount || 0));
    const payer = safeTemplate.payer === "wife" ? "wife" : "husband";
    const paymentMethod = normalizePaymentMethodCode(safeTemplate.paymentMethod || "", payer);
    const matches = (Array.isArray(state.expenses) ? state.expenses : [])
      .filter((expense) => String(expense?.date || "").startsWith(targetMonth))
      .filter((expense) => {
        const expenseStoreKey = getExpenseTemplateMatchText(expense?.storeName);
        const expenseCategoryKey = normalizeCategoryLabel(expense?.category || "");
        const expenseAmount = Math.round(Number(expense?.grossAmount ?? expense?.amount ?? 0));
        const expensePayer = expense?.payer === "wife" ? "wife" : "husband";
        const expensePaymentMethod = normalizePaymentMethodCode(expense?.paymentMethod || "", expensePayer);
        if (storeKey && expenseStoreKey === storeKey && (!categoryKey || expenseCategoryKey === categoryKey)) return true;
        if (!storeKey && categoryKey && expenseCategoryKey === categoryKey && amount > 0 && expenseAmount === amount) return true;
        return Boolean(
          categoryKey
          && expenseCategoryKey === categoryKey
          && amount > 0
          && expenseAmount === amount
          && expensePayer === payer
          && (!paymentMethod || expensePaymentMethod === paymentMethod)
        );
      })
      .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));
    return { loading: false, matches };
  }

  function buildExpenseTemplateCard(template, index) {
    const safeTemplate = normalizeRecurringTemplateEntry(template, index);
    const title = safeTemplate.label || safeTemplate.storeName || `支出テンプレ${index + 1}`;
    const storeName = safeTemplate.storeName || safeTemplate.label || "";
    const targetMonth = getExpenseTemplateTargetMonth();
    const registered = getExpenseTemplateRegisteredMatches(safeTemplate, index, targetMonth);
    const latestMatch = registered.matches[0] || null;
    const registeredStatusClass = registered.loading
      ? "checking"
      : registered.matches.length
        ? "registered"
        : "missing";
    const registeredStatusLabel = registered.loading
      ? "確認中"
      : registered.matches.length
        ? "この月登録済み"
        : "この月未登録";
    const registeredMeta = registered.loading
      ? "支出データを読み込み中です。"
      : latestMatch
        ? `${String(latestMatch.date || "").replaceAll("-", "/")} / ${formatCurrency(latestMatch.grossAmount ?? latestMatch.amount ?? 0)}${registered.matches.length > 1 ? ` ほか${registered.matches.length - 1}件` : ""}`
        : `${targetMonth.replace("-", "年")}月分はまだ見つかりません。`;
    return `
      <article class="expense-template-card" data-expense-template-id="${escapeHtml(safeTemplate.id)}">
        <button class="expense-template-card-main" type="button" data-expense-template-apply="${escapeHtml(safeTemplate.id)}">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(storeName)} / ${escapeHtml(safeTemplate.category || "未設定")}</small>
          </div>
          <div class="expense-template-card-meta">
            <span>${escapeHtml(formatCurrency(safeTemplate.amount || 0))}</span>
            <small>${escapeHtml(PAYER_LABELS[safeTemplate.payer] || safeTemplate.payer)} / ${escapeHtml(getPersonalExpenseLabel(safeTemplate.personalExpense))}</small>
          </div>
        </button>
        <div class="expense-template-registered-row">
          <span class="template-registered-pill ${escapeHtml(registeredStatusClass)}">${escapeHtml(registeredStatusLabel)}</span>
          <small>${escapeHtml(registeredMeta)}</small>
        </div>
        <div class="expense-template-card-actions">
          <button class="ghost-button compact danger-text-button" type="button" data-expense-template-delete="${escapeHtml(safeTemplate.id)}">削除</button>
        </div>
      </article>
    `;
  }

  function renderExpenseTemplatePicker() {
    if (!els.expenseTemplateList) return;
    if (els.expenseTemplateStatusMonth && !els.expenseTemplateStatusMonth.value) {
      els.expenseTemplateStatusMonth.value = getExpenseTemplateTargetMonth();
    }
    const templates = getExpenseTemplateItems();
    if (!templates.length) {
      els.expenseTemplateList.innerHTML = '<div class="expense-card"><span class="muted">保存済みの支出テンプレはまだありません。登録時に「この内容を支出テンプレとして保存」にチェックすると追加できます。</span></div>';
      setMessageState(els.expenseTemplateMessage, "テンプレがありません。", "muted");
      return;
    }
    els.expenseTemplateList.innerHTML = templates.map((template, index) => buildExpenseTemplateCard(template, index)).join("");
    const targetMonth = getExpenseTemplateTargetMonth();
    const loadingSuffix = state.expensesLoaded ? "" : " 支出データを読み込み中です。";
    setMessageState(els.expenseTemplateMessage, `${targetMonth.replace("-", "年")}月の登録状況を表示しています。${loadingSuffix}`, "muted");
    els.expenseTemplateList.querySelectorAll("[data-expense-template-apply]").forEach((button) => {
      button.addEventListener("click", () => {
        applyExpenseTemplateToForm(String(button.getAttribute("data-expense-template-apply") || ""));
      });
    });
    els.expenseTemplateList.querySelectorAll("[data-expense-template-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        await deleteExpenseTemplate(String(button.getAttribute("data-expense-template-delete") || ""));
      });
    });
  }

  async function openExpenseTemplatePicker() {
    if (state.splitMode) {
      disableSplitMode(true);
    }
    if (els.expenseTemplateStatusMonth) {
      const rawDate = String(els.date?.value || todayISO()).trim();
      const monthKey = rawDate.slice(0, 7);
      els.expenseTemplateStatusMonth.value = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : currentMonth();
    }
    renderExpenseTemplatePicker();
    els.expenseTemplateModal?.classList.remove("hidden");
    els.expenseTemplateModal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (canUseSharedStorage() && !state.expensesLoaded && !state.expensesLoading) {
      try {
        await ensureAllExpensesLoaded({ silent: true });
        renderExpenseTemplatePicker();
      } catch (error) {
        console.warn("expense template status load failed", error);
        setMessageState(els.expenseTemplateMessage, "登録状況の確認に失敗しました。テンプレの読み込み自体は利用できます。", "warning");
      }
    }
  }

  function closeExpenseTemplatePicker() {
    els.expenseTemplateModal?.classList.add("hidden");
    els.expenseTemplateModal?.setAttribute("aria-hidden", "true");
    if (!state.expenseEditModalOpen && !state.entryFlowModalOpen) {
      document.body.classList.remove("modal-open");
    }
  }

  function applyExpenseTemplateToForm(templateId) {
    const templates = getExpenseTemplateItems();
    const template = templates.find((item) => String(item.id || "") === String(templateId || ""));
    if (!template) {
      setMessageState(els.expenseTemplateMessage, "テンプレが見つかりません。", "error");
      return;
    }
    const safeTemplate = normalizeRecurringTemplateEntry(template, templates.indexOf(template));
    applySingleEntryValues({
      storeName: safeTemplate.storeName || safeTemplate.label || "",
      grossAmount: safeTemplate.amount || "",
      pointCredit: "",
      category: safeTemplate.category,
      payer: safeTemplate.payer,
      paymentMethod: safeTemplate.paymentMethod,
      otherPaymentMethod: safeTemplate.otherPaymentMethod || "",
      personalExpense: safeTemplate.personalExpense || "family",
      memo: safeTemplate.memo || "",
    });
    if (!els.date?.value) els.date.value = todayISO();
    if (els.saveAsTemplateCheckbox) els.saveAsTemplateCheckbox.checked = true;
    closeExpenseTemplatePicker();
    setMessageState(els.formMessage, `支出テンプレ「${safeTemplate.label || safeTemplate.storeName || "テンプレ"}」を反映しました。保存時に同じ購入店名のテンプレも更新します。`, "success");
  }

  function buildExpenseTemplateFromDraft(expense) {
    const storeName = String(expense?.storeName || "").trim();
    const category = normalizeCategoryLabel(expense?.category || "") || getPreferredCategoryFallback();
    const label = storeName || category || "支出テンプレ";
    return normalizeRecurringTemplateEntry({
      id: `template-${makeStableCode([label, category, expense?.payer, expense?.paymentMethod, expense?.personalExpense].join("-"), "expense")}`,
      label,
      storeName,
      category,
      amount: Number(expense?.grossAmount ?? expense?.amount ?? 0),
      payer: expense?.payer === "wife" ? "wife" : "husband",
      paymentMethod: normalizePaymentMethodCode(expense?.paymentMethod || getDefaultPaymentMethodForCurrentUser(), expense?.payer === "wife" ? "wife" : "husband"),
      otherPaymentMethod: normalizeOtherPaymentMethodLabel(expense?.otherPaymentMethod || ""),
      personalExpense: ["family", "husband", "wife", "child"].includes(expense?.personalExpense) ? expense.personalExpense : "family",
      frequency: "monthly",
      month: "01",
      dayOfMonth: Number(String(expense?.date || "").slice(8, 10)) || new Date().getDate(),
      active: true,
      memo: String(expense?.memo || "").trim(),
    }, 0);
  }

  async function deleteExpenseTemplate(templateId) {
    const currentConfig = normalizeRecurringTemplateConfig(state.recurringTemplateConfig);
    const template = currentConfig.templates.find((item) => String(item.id || "") === String(templateId || ""));
    if (!template) {
      setMessageState(els.expenseTemplateMessage, "削除対象のテンプレが見つかりません。", "error");
      return { ok: false };
    }
    const title = String(template.storeName || template.label || "テンプレ").trim() || "テンプレ";
    if (!window.confirm(`支出テンプレ「${title}」を削除しますか？`)) {
      return { ok: false, cancelled: true };
    }
    state.recurringTemplateConfig = normalizeRecurringTemplateConfig({
      ...currentConfig,
      templates: currentConfig.templates.filter((item) => String(item.id || "") !== String(templateId || "")),
    });
    state.recurringTemplateLastSavedAt = new Date().toISOString();
    persist({ skipRemote: true });
    if (canUseSharedStorage()) {
      const result = await saveSharedSettingsFields({ recurringTemplateConfig: state.recurringTemplateConfig });
      if (!result?.ok) {
        setMessageState(els.expenseTemplateMessage, "テンプレの削除に失敗しました。", "error");
        return { ok: false, error: result?.error };
      }
    }
    renderExpenseTemplatePicker();
    showSyncToast(`支出テンプレ「${title}」を削除しました。`, "success", { duration: 2200 });
    return { ok: true };
  }

  async function saveExpenseTemplateFromDraft(expense) {
    if (!els.saveAsTemplateCheckbox?.checked || !expense) return { skipped: true };
    const nextTemplate = buildExpenseTemplateFromDraft(expense);
    const currentConfig = normalizeRecurringTemplateConfig(state.recurringTemplateConfig);
    const templates = currentConfig.templates.slice();
    const duplicateIndex = templates.findIndex((template) => {
      const safe = normalizeRecurringTemplateEntry(template, 0);
      return String(safe.storeName || "").trim() === String(nextTemplate.storeName || "").trim();
    });
    if (duplicateIndex >= 0) {
      templates[duplicateIndex] = { ...templates[duplicateIndex], ...nextTemplate, id: templates[duplicateIndex].id || nextTemplate.id };
    } else {
      templates.unshift(nextTemplate);
    }
    state.recurringTemplateConfig = normalizeRecurringTemplateConfig({
      ...currentConfig,
      templates,
    });
    state.recurringTemplateLastSavedAt = new Date().toISOString();
    persist({ skipRemote: true });
    if (!canUseSharedStorage()) {
      showSyncToast("支出テンプレをこの端末に保存しました。", "success", { duration: 2400 });
      return { ok: true, localOnly: true };
    }
    const result = await saveSharedSettingsFields({ recurringTemplateConfig: state.recurringTemplateConfig });
    if (!result?.ok) {
      showSyncToast("支出は保存済みですが、テンプレ保存に失敗しました。", "warning", { duration: 3200 });
      return { ok: false, error: result?.error };
    }
    showSyncToast(duplicateIndex >= 0 ? "同じ購入店名の支出テンプレを上書きしました。" : "支出テンプレを保存しました。", "success", { duration: 2200 });
    return { ok: true };
  }

  function createSplitEntry(seed = {}) {
    const fallbackCategory = getPreferredCategoryFallback();
    return {
      rowId: seed.rowId || crypto.randomUUID(),
      storeName: seed.storeName || "",
      amount: seed.amount ?? "",
      category: normalizeCategoryLabel(seed.category) || fallbackCategory,
      payer: seed.payer || (state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband"),
      paymentMethod: normalizePaymentMethodCode(
        seed.paymentMethod || getDefaultPaymentMethodForCurrentUser(),
        seed.payer || (state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband")
      ),
      otherPaymentMethod: seed.otherPaymentMethod || "",
      personalExpense: seed.personalExpense || "family",
      memo: seed.memo || "",
      allocationSource: seed.allocationSource || "manual",
      taxRate: seed.taxRate ?? "",
    };
  }

  function enableSplitMode(options = {}) {
    if (els.expenseId.value) {
      setText(els.formMessage, "既存明細の編集時は分割登録へ切り替えできません。新規入力から利用してください。");
      return;
    }
    state.splitMode = true;
    state.splitModeType = options.mode || "manual";
    state.splitEntries = Array.isArray(options.entries) && options.entries.length
      ? options.entries.map((entry) => createSplitEntry(entry))
      : [createSplitEntry(buildSingleEntryValues())];
    els.splitReceiptTotal.value = options.receiptTotal ?? (els.amount.value || "");
    syncSplitModeUI();
    renderSplitEntrySection();
    setText(
      els.formMessage,
      options.message || "分割登録モードに切り替えました。必要な明細を追加してください。"
    );
  }

    function disableSplitMode(force = false) {
      if (!state.splitMode) return;
      const hasMultipleEntries = state.splitEntries.length > 1;
    if (!force && hasMultipleEntries) {
      const confirmed = window.confirm("分割した明細は単一登録へ戻すと保持されません。先頭明細だけを残して戻しますか？");
      if (!confirmed) return;
      }
      const firstEntry = isAiReceiptSummaryMode()
        ? {
            storeName: els.splitSummaryStoreName?.value || "",
            amount: els.splitReceiptTotal?.value || "",
            category: els.splitSummaryCategory?.value || getPreferredCategoryFallback(),
            payer: els.splitSummaryPayer?.value || (state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband"),
            paymentMethod: els.splitSummaryPaymentMethod?.value || getDefaultPaymentMethodForCurrentUser(),
            otherPaymentMethod: els.splitSummaryOtherPaymentMethod?.value || "",
            memo: els.splitSummaryMemo?.value || "",
            personalExpense: "family",
          }
        : (state.splitEntries[0] || createSplitEntry());
      applySingleEntryValues({
        ...firstEntry,
        amount: els.splitReceiptTotal.value || firstEntry.amount || "",
      }, { preserveMessage: true });
    state.splitMode = false;
    state.splitModeType = "manual";
    state.splitEntries = [];
    els.splitReceiptTotal.value = "";
    syncSplitModeUI();
    renderSplitEntrySection();
  }

  function syncSplitModeUI() {
    els.singleEntryFields?.classList.toggle("hidden", state.splitMode);
    els.splitEntrySection?.classList.toggle("hidden", !state.splitMode);
    els.splitAddLineButton?.classList.toggle("hidden", !state.splitMode || state.splitModeType === "ai-allocation" || state.splitModeType === "ai-receipt-summary");
    els.singleEntryFields?.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = state.splitMode;
    });
    if (els.splitModeToggle) {
      els.splitModeToggle.textContent = state.splitMode ? "単一登録に戻す" : "このレシートを分割する";
      els.splitModeToggle.classList.toggle("secondary-button", state.splitMode);
      els.splitModeToggle.classList.toggle("ghost-button", !state.splitMode);
    }
  }

  function addSplitEntry(seed = {}) {
    if (!state.splitMode) return;
    const hasExplicitSeed = seed && Object.keys(seed).length > 0;
    const firstEntry = state.splitEntries[0] || buildSingleEntryValues();
    const baseSeed = hasExplicitSeed ? seed : {
      storeName: firstEntry.storeName || "",
      category: firstEntry.category || getPreferredCategoryFallback(),
      payer: firstEntry.payer || (state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband"),
      paymentMethod: firstEntry.paymentMethod || getDefaultPaymentMethodForCurrentUser(),
      otherPaymentMethod: firstEntry.otherPaymentMethod || "",
      personalExpense: firstEntry.personalExpense || "family",
      memo: firstEntry.memo || "",
      amount: "",
    };
    state.splitEntries.push(createSplitEntry(baseSeed));
    renderSplitEntrySection();
  }

  function removeSplitEntry(rowId) {
    if (!state.splitMode) return;
    if (state.splitEntries.length <= 1) {
      setText(els.formMessage, "分割登録には最低1件の明細が必要です。");
      return;
    }
    state.splitEntries = state.splitEntries.filter((entry) => entry.rowId !== rowId);
    renderSplitEntrySection();
  }

  function onSplitEntryClick(event) {
    const removeButton = event.target.closest("[data-remove-split-row]");
    if (!removeButton) return;
    removeSplitEntry(removeButton.dataset.removeSplitRow);
  }

  function onSplitEntryInput(event) {
    const field = event.target.dataset.field;
    const rowId = event.target.dataset.rowId;
    if (!field || !rowId) return;
    const entry = state.splitEntries.find((item) => item.rowId === rowId);
    if (!entry) return;
      if (field === "allocationChoice") {
        if (!event.target.checked) {
          event.target.checked = true;
          return;
        }
        entry.personalExpense = event.target.dataset.allocationValue || "family";
        renderSplitEntrySection();
        return;
      }
        entry[field] = event.target.value;
        if (field === "paymentMethod" && !isOtherPaymentMethod(entry.paymentMethod)) {
          entry.otherPaymentMethod = "";
      }
      if (field === "paymentMethod" && isOtherPaymentMethod(entry.paymentMethod) && !entry.otherPaymentMethod) {
        entry.otherPaymentMethod = getDefaultOtherPaymentMethod();
      }
      if (field === "paymentMethod" || field === "payer") {
        renderSplitEntrySection();
        return;
      }
    if (field === "amount") {
      renderSplitDifference();
    }
  }

  function splitEntryTemplate(entry, index) {
    const showOther = isOtherPaymentMethod(entry.paymentMethod);
    const showFamilyWarning = shouldShowFamilyCardWarning(entry.payer, entry.paymentMethod);
    const paymentMethodLabels = Object.fromEntries(PAYMENT_METHODS.map((item) => [item.value, item.label]));
    return `
      <article class="split-entry-card">
        <div class="split-entry-top">
          <span class="split-entry-title">明細 ${index + 1}</span>
          <button class="ghost-button" type="button" data-remove-split-row="${entry.rowId}">この明細を削除</button>
        </div>
        <div class="form-grid">
          <label class="input-group">
            <span>購入店 *</span>
            <input type="text" value="${escapeHtml(entry.storeName)}" maxlength="100" placeholder="例: イオン" data-row-id="${entry.rowId}" data-field="storeName" />
          </label>
          <label class="input-group">
            <span>金額 *</span>
            <input type="number" step="1" value="${escapeHtml(entry.amount)}" placeholder="0" data-row-id="${entry.rowId}" data-field="amount" />
          </label>
          <label class="input-group">
            <span>カテゴリ *</span>
            <select data-row-id="${entry.rowId}" data-field="category">
              ${buildSplitSelectOptions(getSelectableCategoryLabels(), entry.category)}
            </select>
          </label>
          <label class="input-group">
            <span>支払者 *</span>
            <select data-row-id="${entry.rowId}" data-field="payer">
              ${buildSplitSelectOptions(Object.keys(PAYER_LABELS), entry.payer, PAYER_LABELS)}
            </select>
          </label>
            <label class="input-group">
              <span>支払い手段 *</span>
              <select data-row-id="${entry.rowId}" data-field="paymentMethod">
                ${buildSplitSelectOptions(PAYMENT_METHODS.map((item) => item.value), entry.paymentMethod, paymentMethodLabels)}
              </select>
              </label>
              <div class="input-group ${showOther ? "" : "hidden"}">
                <span>その他支払い手段</span>
                <select data-row-id="${entry.rowId}" data-field="otherPaymentMethod">
                  ${buildSplitSelectOptions(state.otherPaymentMethods, entry.otherPaymentMethod || getDefaultOtherPaymentMethod())}
                </select>
              </div>
          <label class="input-group">
            <span>負担区分</span>
            <select data-row-id="${entry.rowId}" data-field="personalExpense">
              ${buildSplitSelectOptions(Object.keys(PERSONAL_EXPENSE_LABELS), entry.personalExpense, PERSONAL_EXPENSE_LABELS)}
            </select>
          </label>
        </div>
        ${showFamilyWarning ? '<p class="inline-warning">家族カードの利用です</p>' : ""}
        <label class="input-group">
          <span>メモ</span>
          <textarea rows="2" maxlength="${MEMO_MAX_LENGTH}" placeholder="補足があれば記入" data-row-id="${entry.rowId}" data-field="memo">${escapeHtml(entry.memo)}</textarea>
        </label>
      </article>
    `;
  }

  function buildSplitSelectOptions(values, selected, labels = {}) {
    return values.map((value) => {
      const code = typeof value === "string" ? value : value.value;
      const label = labels[code] || code;
      const isSelected = code === selected ? " selected" : "";
      return `<option value="${escapeHtml(code)}"${isSelected}>${escapeHtml(label)}</option>`;
    }).join("");
  }

    function isAiAllocationSplitMode() {
      return state.splitMode && state.splitModeType === "ai-allocation";
    }

    function isAiReceiptSummaryMode() {
      return state.splitMode && state.splitModeType === "ai-receipt-summary";
    }

    function applyAiReceiptSummaryDefaults(result) {
      if (!els.aiReceiptSummarySection) return;
      const total = result.grossAmount || result.amount || "";
      const normalizedCategory = normalizeCategoryLabel(result.category || "");
      const payer = els.payer?.value || (state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband");
      const paymentMethod = normalizePaymentMethodCode(
        els.paymentMethod?.value || getDefaultPaymentMethodForCurrentUser(),
        payer
      );
      const itemMemo = buildStructuredReceiptMemo(result) || buildAiReferenceMemo(result.items || []);
      els.splitSummaryStoreName.value = result.storeName || "";
      els.splitSummaryCategory.value = normalizedCategory || (state.categories.includes("その他") ? "その他" : getPreferredCategoryFallback());
      els.splitSummaryPayer.value = payer;
      els.splitSummaryPaymentMethod.value = paymentMethod;
      els.splitSummaryOtherPaymentMethod.value =
        normalizeOtherPaymentMethodLabel(els.otherPaymentMethod?.value) || getDefaultOtherPaymentMethod();
      els.splitSummaryMemo.value = joinTextPartsWithinLimit(
        [String(result.memo || "").trim(), itemMemo],
        MEMO_MAX_LENGTH
      );
      els.splitFamilyAmount.value = total;
      els.splitHusbandAmount.value = "";
      els.splitWifeAmount.value = "";
      syncAiReceiptSummaryPaymentFields();
      renderSplitDifference();
    }

    function getAiReceiptSummaryAllocationTotal() {
      return (
        (Number(els.splitFamilyAmount?.value) || 0) +
        (Number(els.splitHusbandAmount?.value) || 0) +
        (Number(els.splitWifeAmount?.value) || 0)
      );
    }

    function getAiReceiptSummaryDifferenceAmount() {
      return (Number(els.splitReceiptTotal?.value) || 0) - getAiReceiptSummaryAllocationTotal();
    }

    function buildStructuredReceiptMemo(result = {}) {
      const items = Array.isArray(result.items) ? result.items : [];
      const taxSummary = Array.isArray(result.taxSummary) && result.taxSummary.length
        ? result.taxSummary
        : buildTaxSummaryFromAiItems(items);
      const warnings = Array.isArray(result.memoWarnings)
        ? result.memoWarnings.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
      if (!items.length && !taxSummary.length && !warnings.length) return "";

      const lines = [];
      if (items.length) {
        lines.push("【レシート明細】");
        items.slice(0, 20).forEach((item) => {
          const label = String(item?.name || item?.storeName || item?.memo || "商品名不明").trim();
          const confidenceSuffix = String(item?.confidence || "").toLowerCase() === "low" ? " ※推定" : "";
          const rawAmount = getAiItemRawAmount(item);
          const taxRate = Number(item?.taxRate);
          const taxIncludedAmount = getAiItemTaxIncludedAmount(item);
          const taxLabel = Number.isFinite(taxRate) ? `税率${taxRate}%` : "税率不明";
          const includedLabel = Number.isFinite(taxIncludedAmount) ? `税込 ${formatPlainYen(taxIncludedAmount)}` : "税込 不明";
          const rawLabel = Number.isFinite(rawAmount) ? formatPlainYen(rawAmount) : "金額不明";
          lines.push(`- ${label}${confidenceSuffix} ${rawLabel} / ${taxLabel} / ${includedLabel}`);
        });
        if (items.length > 20) {
          lines.push(`- ほか${items.length - 20}件`);
        }
      }

      if (taxSummary.length) {
        if (lines.length) lines.push("");
        lines.push("【税率別】");
        taxSummary.forEach((item) => {
          const taxRate = Number(item?.taxRate);
          const total = Number(item?.taxIncludedTotal);
          const taxLabel = Number.isFinite(taxRate) ? `${taxRate}%対象` : "税率不明";
          const totalLabel = Number.isFinite(total) ? formatPlainYen(total) : "不明";
          lines.push(`- ${taxLabel}: ${totalLabel}`);
        });
      }

      const confirmationLines = [...warnings];
      if (items.some((item) => String(item?.confidence || "").toLowerCase() === "low" || String(item?.note || "").trim())) {
        items.forEach((item) => {
          const note = String(item?.note || "").trim();
          if (note) confirmationLines.push(`${String(item?.name || item?.storeName || "商品").trim()}: ${note}`);
        });
      }
      confirmationLines.push("商品別明細は参考情報。保存金額はレシート合計を優先");
      if (confirmationLines.length) {
        if (lines.length) lines.push("");
        lines.push("【確認事項】");
        [...new Set(confirmationLines)].forEach((line) => {
          lines.push(`- ${line}`);
        });
      }
      return joinTextPartsWithinLimit(lines, MEMO_MAX_LENGTH);
    }

    function getAiItemRawAmount(item) {
      const rawAmount = Number(item?.rawAmount);
      if (Number.isFinite(rawAmount)) return rawAmount;
      const amount = Number(item?.amount);
      return Number.isFinite(amount) ? amount : NaN;
    }

    function getAiItemTaxIncludedAmount(item) {
      const taxIncludedAmount = Number(item?.taxIncludedAmount);
      if (Number.isFinite(taxIncludedAmount)) return taxIncludedAmount;
      if (String(item?.amountType || "") === "tax_included") {
        const amount = Number(item?.amount);
        if (Number.isFinite(amount)) return amount;
      }
      return NaN;
    }

    function buildTaxSummaryFromAiItems(items = []) {
      const totals = new Map();
      (Array.isArray(items) ? items : []).forEach((item) => {
        const taxIncludedAmount = getAiItemTaxIncludedAmount(item);
        if (!Number.isFinite(taxIncludedAmount)) return;
        const taxRate = Number(item?.taxRate);
        const key = Number.isFinite(taxRate) ? String(taxRate) : "unknown";
        const existing = totals.get(key) || { taxRate: Number.isFinite(taxRate) ? taxRate : "", taxIncludedTotal: 0 };
        existing.taxIncludedTotal += Math.round(taxIncludedAmount);
        totals.set(key, existing);
      });
      return [...totals.values()];
    }

    function formatPlainYen(value) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return "不明";
      return `${Math.round(amount).toLocaleString("ja-JP")}円`;
    }

    function buildAiReferenceMemo(items) {
      if (!Array.isArray(items) || !items.length) return "";
      const parts = items
        .map((item) => {
          const label = String(item?.name || item?.storeName || "").trim();
          const amount = Number(item?.amount) || 0;
          if (!label) return "";
          return `${label}${formatCompactAmountSuffix(amount)}`;
        })
        .filter(Boolean);
      return parts.length ? `AI候補: ${parts.join(" / ")}` : "";
    }

    function buildAiReceiptSummaryExpenses() {
      const receiptTotal = Number(els.splitReceiptTotal?.value) || 0;
      const difference = getAiReceiptSummaryDifferenceAmount();
      if (!receiptTotal) {
        setText(els.formMessage, "レシート合計を入力してください。");
        return null;
      }
      if (difference !== 0) {
        setText(els.formMessage, "負担額の合計がレシート合計と一致していません。差額を解消してから保存してください。");
        return null;
      }
      const storeName = String(els.splitSummaryStoreName?.value || "").trim();
      if (!storeName) {
        setText(els.formMessage, "購入店を入力してください。");
        return null;
      }
      const category = normalizeCategoryLabel(els.splitSummaryCategory?.value) || "その他";
      const payer = normalizePayerCode(els.splitSummaryPayer?.value);
      const paymentMethod = normalizePaymentMethodCode(els.splitSummaryPaymentMethod?.value, payer);
      const otherPaymentMethod = isOtherPaymentMethod(paymentMethod)
        ? normalizeOtherPaymentMethodLabel(els.splitSummaryOtherPaymentMethod?.value)
        : "";
      const sharedMemo = joinTextPartsWithinLimit(
        [String(els.splitSummaryMemo?.value || "").trim(), buildAiReferenceMemo(state.splitEntries)],
        MEMO_MAX_LENGTH
      );
      const allocations = [
        { personalExpense: "family", amount: Number(els.splitFamilyAmount?.value) || 0 },
        { personalExpense: "husband", amount: Number(els.splitHusbandAmount?.value) || 0 },
        { personalExpense: "wife", amount: Number(els.splitWifeAmount?.value) || 0 },
      ].filter((item) => item.amount > 0);
      if (!allocations.length) {
        setText(els.formMessage, "少なくとも1つの負担額を入力してください。");
        return null;
      }
      return allocations.map((item) => ({
        storeName,
        amount: item.amount,
        category,
        payer,
        paymentMethod,
        otherPaymentMethod,
        memo: sharedMemo,
        personalExpense: item.personalExpense,
      }));
    }

    function syncAiReceiptSummaryPaymentFields() {
      if (!els.splitSummaryOtherPaymentWrapper) return;
      const paymentMethod = normalizePaymentMethodCode(els.splitSummaryPaymentMethod?.value, els.splitSummaryPayer?.value);
      els.splitSummaryOtherPaymentWrapper.classList.toggle("hidden", !isOtherPaymentMethod(paymentMethod));
    }

    function renderAiReceiptSummarySection() {
      if (!els.aiReceiptSummarySection) return;
      const active = isAiReceiptSummaryMode();
      els.aiReceiptSummarySection.classList.toggle("hidden", !active);
      if (!active) return;
      syncAiReceiptSummaryPaymentFields();
      renderSplitDifference();
    }

    function splitAllocationCheckbox(entry, value) {
      const checked = entry.personalExpense === value ? "checked" : "";
      return `
      <label class="split-allocation-check">
        <input
          type="checkbox"
          ${checked}
          data-row-id="${entry.rowId}"
          data-field="allocationChoice"
          data-allocation-value="${value}"
        />
      </label>
    `;
  }

  function splitAiAllocationTemplate(entry, index) {
    return `
      <tr>
        <td>
          <div class="split-item-name">
            <strong>${escapeHtml(entry.storeName || `明細 ${index + 1}`)}</strong>
            ${entry.memo ? `<small>${escapeHtml(entry.memo)}</small>` : ""}
          </div>
        </td>
        <td>
          <input
            class="split-allocation-amount"
            type="number"
            step="1"
            value="${escapeHtml(entry.amount)}"
            placeholder="0"
            data-row-id="${entry.rowId}"
            data-field="amount"
          />
        </td>
        <td>${splitAllocationCheckbox(entry, "family")}</td>
        <td>${splitAllocationCheckbox(entry, "husband")}</td>
        <td>${splitAllocationCheckbox(entry, "wife")}</td>
      </tr>
    `;
  }

    function splitAiAllocationTableTemplate() {
      return `
        <div class="split-allocation-card">
          <div class="split-allocation-heading">
            <strong>AIが読み取った商品別の負担振り分け</strong>
          <span class="muted small split-allocation-guide">負担先を選択: 家計負担 / 夫負担 / 妻負担。1行につき1つだけ選択できます。初期値はすべて家計負担です。同じ負担先は保存時に1件へまとめます。差額が残るときは明細の取りこぼしや 9/0 の誤読を疑って見直してください。</span>
        </div>
        <div class="split-allocation-table-wrap">
          <table class="split-allocation-table">
            <thead>
              <tr>
                <th>商品名</th>
                <th>金額（税込）</th>
                <th>家計負担</th>
                <th>夫負担</th>
                <th>妻負担</th>
              </tr>
            </thead>
            <tbody>
              ${state.splitEntries.map(splitAiAllocationTemplate).join("")}
            </tbody>
          </table>
        </div>
        </div>
      `;
    }

    function splitAiReferenceTableTemplate() {
      const itemCount = state.splitEntries.length;
      return `
        <details class="split-reference-card">
          <summary>参考明細を表示する（${itemCount}件）</summary>
          <div class="split-allocation-card compact">
            <div class="split-allocation-heading">
              <strong>AIが読み取った商品候補</strong>
              <span class="muted small split-allocation-guide">商品名や単価は参考情報です。保存は上の総額振り分けを優先してください。</span>
            </div>
            <div class="split-allocation-table-wrap">
              <table class="split-allocation-table split-reference-table">
                <thead>
                  <tr>
                    <th>商品候補</th>
                    <th>税込金額</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.splitEntries.map((entry, index) => `
                    <tr>
                      <td>
                        <div class="split-item-name">
                          <strong>${escapeHtml(entry.storeName || `明細 ${index + 1}`)}</strong>
                          ${entry.memo ? `<small>${escapeHtml(entry.memo)}</small>` : ""}
                        </div>
                      </td>
                      <td class="split-reference-amount">${escapeHtml(formatCurrency(entry.amount || 0))}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      `;
    }

    function renderSplitEntrySection() {
      if (!els.splitEntryList) return;
      renderAiReceiptSummarySection();
      if (!state.splitMode) {
        if (els.aiReceiptSummarySection) els.aiReceiptSummarySection.classList.add("hidden");
        els.splitEntryList.innerHTML = "";
        renderSplitDifference();
        return;
      }
      els.splitEntryList.innerHTML = isAiAllocationSplitMode()
        ? splitAiAllocationTableTemplate()
        : isAiReceiptSummaryMode()
        ? splitAiReferenceTableTemplate()
        : state.splitEntries.map(splitEntryTemplate).join("");
      renderSplitDifference();
    }

  function autoFillFamilyAmount() {
    if (isAiReceiptSummaryMode() && els.splitFamilyAmount) {
      const total = Number(els.splitReceiptTotal?.value) || 0;
      const husband = Number(els.splitHusbandAmount?.value) || 0;
      const wife = Number(els.splitWifeAmount?.value) || 0;
      const family = total - husband - wife;
      els.splitFamilyAmount.value = family > 0 ? family : 0;
    }
    renderSplitDifference();
  }

  function renderSplitDifference() {
    if (!els.splitEntriesTotal || !els.splitDifferenceTotal || !els.splitDifferenceMessage) return;
    const splitTotal = isAiReceiptSummaryMode()
      ? getAiReceiptSummaryAllocationTotal()
      : state.splitEntries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const receiptTotal = Number(els.splitReceiptTotal?.value) || 0;
    const difference = receiptTotal - splitTotal;
    els.splitEntriesTotal.textContent = formatCurrency(splitTotal);
    els.splitDifferenceTotal.textContent = formatCurrency(difference);
    els.splitDifferenceTotal.classList.toggle("split-difference-warning", difference !== 0);
    els.splitDifferenceTotal.classList.toggle("split-difference-ok", difference === 0);
    if (!state.splitMode) {
      setText(els.splitDifferenceMessage, "");
      setText(els.splitSummaryMessage, "");
      return;
    }
    if (!receiptTotal) {
      setText(els.splitDifferenceMessage, "レシート合計を入力すると、分割合計との差額を確認できます。");
      if (isAiReceiptSummaryMode()) {
        setText(els.splitSummaryMessage, "家計負担・夫負担・妻負担へ総額を振り分けてください。");
      }
      return;
    }
    if (difference === 0) {
      setText(els.splitDifferenceMessage, isAiReceiptSummaryMode() ? "負担額の合計はレシート合計と一致しています。" : "分割合計はレシート合計と一致しています。");
      if (isAiReceiptSummaryMode()) {
        setText(els.splitSummaryMessage, "この内容で保存できます。");
        if (els.splitSummaryMessage) els.splitSummaryMessage.classList.remove("split-difference-warning");
      }
      return;
    }
    setText(
      els.splitDifferenceMessage,
      isAiReceiptSummaryMode()
        ? `負担額の合計が ${formatCurrency(difference)} ずれています。`
        : `差額が ${formatCurrency(difference)} あります。明細の取りこぼしや 9/0 の誤読、税込み計算の違いがないか見直してください。`
    );
    if (isAiReceiptSummaryMode()) {
      const absDifference = Math.abs(difference);
      const msg = difference > 0
        ? `あと ${formatCurrency(absDifference)} 不足しています。`
        : `夫・妻の合計がレシート合計を ${formatCurrency(absDifference)} 超えています。入力値を見直してください。`;
      setText(els.splitSummaryMessage, msg);
      if (els.splitSummaryMessage) {
        els.splitSummaryMessage.classList.add("split-difference-warning");
      }
    }
  }

  function getSplitDifferenceAmount() {
    return isAiReceiptSummaryMode()
      ? getAiReceiptSummaryDifferenceAmount()
      : (Number(els.splitReceiptTotal?.value) || 0) - state.splitEntries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  }

  function shouldShowFamilyCardWarning(payer, paymentMethod) {
    return normalizePayerCode(payer) === "wife" && normalizePaymentMethodCode(paymentMethod, normalizePayerCode(payer)) === "husband_card";
  }

  function isFamilyCardExpense(item) {
    return shouldShowFamilyCardWarning(item?.payer, item?.paymentMethod) || item?.isFamilyCard === true;
  }

  function normalizeExpense(item) {
    if (!item || typeof item !== "object") return item;
    const normalized = { ...item };
    normalized.payer = normalizePayerCode(normalized.payer);
    if (normalized.paymentMethod === "family_card") {
      normalized.paymentMethod = "husband_card";
      normalized.payer = "wife";
      normalized.billingTarget = normalized.billingTarget || "husband_card";
      normalized.isFamilyCard = true;
      } else {
        normalized.paymentMethod = normalizePaymentMethodCode(normalized.paymentMethod, normalized.payer);
        normalized.isFamilyCard = isFamilyCardExpense(normalized);
      }
        normalized.otherPaymentMethod = normalizeOtherPaymentMethodLabel(normalized.otherPaymentMethod);
        if ((item.paymentMethod === "cash" || item.paymentMethod === "husband_cash" || item.paymentMethod === "wife_cash") && !normalized.otherPaymentMethod) {
          normalized.otherPaymentMethod = "現金";
        }
        normalized.billingTarget = normalized.billingTarget || getBillingTargetFromPaymentMethod(normalized.paymentMethod);
      normalized.pointCredit = Math.max(Number(normalized.pointCredit) || 0, 0);
      normalized.grossAmount = normalized.grossAmount ?? ((Number(normalized.amount) || 0) + normalized.pointCredit);
      normalized.amount = calculateNetAmount(normalized.grossAmount, normalized.pointCredit);
      const rawCategory = String(item?.category || "").trim();
      const normalizedCategory = normalizeCategoryLabel(normalized.category) || "その他";
      const legacyOverrideLabel = getLegacyCategoryOverrideLabel(normalized);
      const legacyLikeLabels = new Set(["固定費", "自動車保険", "車保険", "自動車税", "車整備", "車両整備"]);
      normalized.category = normalizedCategory;
      if (legacyOverrideLabel && (legacyLikeLabels.has(rawCategory) || legacyLikeLabels.has(normalizedCategory))) {
        normalized.category = legacyOverrideLabel;
      }
      normalized.serialCode = String(normalized.serialCode || "").trim();
      normalized.receiptStorageAssetId = String(normalized.receiptStorageAssetId || "").trim();
      normalized.receiptStorageUploadedAt = String(normalized.receiptStorageUploadedAt || "").trim();
      normalized.receiptStorageStatus = String(normalized.receiptStorageStatus || "").trim();
      normalized.receiptStorageDriveSyncedAt = String(normalized.receiptStorageDriveSyncedAt || "").trim();
      normalized.receiptUploadError = String(normalized.receiptUploadError || "").trim();
      normalized.receiptAssets = getReceiptAssets(normalized);
      normalized.receiptAssetCount = normalized.receiptAssets.length;
      normalized.receiptGroupId = normalized.receiptGroupId || "";
    normalized.receiptLineIndex = normalized.receiptLineIndex || "";
    normalized.receiptLineCount = normalized.receiptLineCount || "";
    return normalized;
  }

  function normalizeTransfer(item) {
    if (!item || typeof item !== "object") return item;
    return {
      ...item,
      id: item.id || crypto.randomUUID(),
      amount: Number(item.amount) || 0,
      type: normalizeTransferType(item.type),
      settlementScope: normalizeTransferSettlementScope(item.settlementScope || item.settlement_scope),
      fromPerson: item.fromPerson || "husband",
      toPerson: item.toPerson || "wife",
      memo: item.memo || "",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      createdBy: item.createdBy || "",
      serialCode: String(item.serialCode || "").trim(),
    };
  }

  function normalizeChildTransaction(item) {
    if (!item || typeof item !== "object") return item;
    return {
      ...item,
      id: item.id || crypto.randomUUID(),
      amount: Number(item.amount) || 0,
      kind: item.kind || "gift",
      holder: item.holder || "husband",
      memo: item.memo || "",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      createdBy: item.createdBy || "",
      serialCode: String(item.serialCode || "").trim(),
    };
  }

  function normalizeHouseholdIncome(item) {
    if (!item || typeof item !== "object") return item;
    return {
      ...item,
      id: item.id || crypto.randomUUID(),
      date: String(item.date || "").trim(),
      kind: String(item.kind || "sale_profit").trim() || "sale_profit",
      sourceName: String(item.sourceName || "").trim(),
      holder: item.holder === "wife" ? "wife" : "husband",
      amount: Number(item.amount) || 0,
      memo: String(item.memo || "").trim(),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      createdBy: item.createdBy || "",
      updatedBy: item.updatedBy || "",
      serialCode: String(item.serialCode || "").trim(),
    };
  }

  function updateFamilyCardWarning() {
    if (!els.familyCardWarning) return;
    const shouldShow = shouldShowFamilyCardWarning(els.payer.value, els.paymentMethod.value);
    els.familyCardWarning.classList.toggle("hidden", !shouldShow);
    els.familyCardWarning.textContent = shouldShow ? "家族カードの利用です" : "";
  }

  async function onExpenseSubmit(event) {
    const delegated = callExpensesFeature("onExpenseSubmit", event);
    if (delegated !== undefined) return delegated;
  }

  async function triggerExpenseSave(source = "manual") {
    try {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } catch (error) {
      console.warn("Failed to blur active element before expense save", error);
    }
    setText(els.formMessage, "保存処理を開始しています...");
    try {
      await onExpenseSubmit({
        type: source,
        preventDefault() {},
      });
    } catch (error) {
      console.error("triggerExpenseSave failed", error);
      const message = error?.message || "保存処理でエラーが発生しました。入力内容を確認して再度お試しください。";
      setMessageState(els.formMessage, message, "error");
      showSyncToast("保存処理でエラーが発生しました。", "error", { duration: 3200 });
      state.expenseSubmitInFlight = false;
    }
  }

  function buildExpenseFromForm() {
    const delegated = callExpensesFeature("buildExpenseFromForm");
    if (delegated !== undefined) return delegated;
    return null;
  }

  function buildSplitExpensesFromForm() {
    const delegated = callExpensesFeature("buildSplitExpensesFromForm");
    if (delegated !== undefined) return delegated;
    return null;
  }

  function buildGroupedAiSplitExpenses(rows) {
    const delegated = callExpensesFeature("buildGroupedAiSplitExpenses", rows);
    if (delegated !== undefined) return delegated;
    return [];
  }

  function pickDominantCategory(entries) {
    const delegated = callExpensesFeature("pickDominantCategory", entries);
    if (delegated !== undefined) return delegated;
    return "その他";
  }

  function buildGroupedSplitMemo(entries) {
    const delegated = callExpensesFeature("buildGroupedSplitMemo", entries);
    if (delegated !== undefined) return delegated;
    return "";
  }

  function formatCompactAmountSuffix(value) {
    const delegated = callExpensesFeature("formatCompactAmountSuffix", value);
    if (delegated !== undefined) return delegated;
    return "";
  }

  function joinTextPartsWithinLimit(parts, limit) {
    const delegated = callExpensesFeature("joinTextPartsWithinLimit", parts, limit);
    if (delegated !== undefined) return delegated;
    return "";
  }

  function resetForm(clearEditContext = true) {
    els.expenseForm.reset();
    state.entryReturnTab = null;
    if (clearEditContext) state.editScrollContext = null;
    state.splitMode = false;
      state.splitModeType = "manual";
      state.splitEntries = [];
      els.expenseId.value = "";
    if (els.expenseUpdatedAt) els.expenseUpdatedAt.value = "";
    els.date.value = todayISO();
    els.deleteEntryButton.classList.add("hidden");
    if (els.saveAsTemplateCheckbox) els.saveAsTemplateCheckbox.checked = false;
    setText(els.formMessage, "");
    applySingleEntryValues({
      category: getPreferredCategoryFallback(),
      paymentMethod: getDefaultPaymentMethodForCurrentUser(),
      payer: state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband",
      personalExpense: "family",
      pointCredit: "",
    }, { preserveMessage: true });
      els.splitReceiptTotal.value = "";
      if (els.splitSummaryStoreName) els.splitSummaryStoreName.value = "";
      if (els.splitSummaryCategory) els.splitSummaryCategory.value = getPreferredCategoryFallback();
      if (els.splitSummaryPayer) els.splitSummaryPayer.value = state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband";
      if (els.splitSummaryPaymentMethod) {
        els.splitSummaryPaymentMethod.value = getDefaultPaymentMethodForCurrentUser();
      }
      if (els.splitSummaryOtherPaymentMethod) els.splitSummaryOtherPaymentMethod.value = getDefaultOtherPaymentMethod();
      if (els.splitFamilyAmount) els.splitFamilyAmount.value = "";
      if (els.splitHusbandAmount) els.splitHusbandAmount.value = "";
      if (els.splitWifeAmount) els.splitWifeAmount.value = "";
      if (els.splitSummaryMemo) els.splitSummaryMemo.value = "";
      syncSplitModeUI();
      renderSplitEntrySection();
      clearReceiptDraftSilently();
    clearAiHighlights();
    updateFamilyCardWarning();
    updateNetAmountPreview();
  }

  function clearReceiptDraftSilently() {
    if (_receiptAutoAnalyzeTimer) {
      clearTimeout(_receiptAutoAnalyzeTimer);
      _receiptAutoAnalyzeTimer = null;
    }
    if (_receiptDrivePreflightTimer) {
      clearTimeout(_receiptDrivePreflightTimer);
      _receiptDrivePreflightTimer = null;
    }
    _receiptAutoAnalyzeQueued = false;
    _receiptStorageUploadFile = null;
    _receiptStorageUploadPromise = null;
    state.receiptQueue = [];
    state.receiptQueueIndex = -1;
    state.receiptDraft = {
      file: null,
      previewUrl: "",
      aiResult: null,
      aiSource: "",
      storageAssetId: "",
      storageUploadedAt: "",
      storageStatus: "",
      driveFileId: "",
      driveUrl: "",
      uploadedAt: "",
      uploadStatus: "",
      uploaderName: "",
      receiptAssets: [],
      pendingReceiptAssets: [],
      receiptAssetsEdited: false,
      queueStorageSignature: "",
    };
    state.receiptFlowStatus = {
      analyze: "idle",
      drive: "idle",
      message: "画像やPDFを最大3ファイルまで選び、Gemini AI解析ボタンで解析と一時保存を開始します。",
    };
    if (els.receiptCameraFile) els.receiptCameraFile.value = "";
    els.receiptFile.value = "";
    if (els.orderMailText) els.orderMailText.value = "";
    els.receiptPreview.src = "";
    els.receiptPreview.classList.add("hidden");
    els.receiptPreviewContainer.classList.add("empty");
    els.aiSuggestionBox.classList.add("hidden");
    if (els.receiptMoreToggle) {
      els.receiptMoreToggle.classList.add("hidden");
      els.receiptMoreToggle.textContent = "ファイルを追加する";
    }
    if (els.receiptMoreActions) els.receiptMoreActions.classList.add("hidden");
    renderReceiptQueue();
    setText(els.receiptMessage, "");
    renderReceiptLinkedInfo();
    renderReceiptAssetList();
  }

  function renderReceiptLinkedInfo() {
    const statusSuffix = state.receiptDraft.uploadStatus === "failed"
      ? " [保存失敗]"
      : state.receiptDraft.uploadStatus === "storage_saved"
      ? " [画像を保存しました / Drive未反映]"
      : state.receiptDraft.uploadStatus === "storage_fallback"
      ? " [保存完了 / Drive未反映]"
      : state.receiptDraft.uploadStatus === "pending"
      ? state.receiptDraft.storageAssetId
        ? " [画像を保存しました / Drive保存待ち]"
        : " [保存待ち/キュー]"
      : state.receiptDraft.uploadStatus === "skipped"
      ? " [スキップ]"
      : "";
    const receiptUrlLabel = state.receiptDraft.driveUrl
      || (state.receiptDraft.storageAssetId ? "画像を保存しました（Drive未反映）" : "未保存");
    const receiptFileIdLabel = state.receiptDraft.driveFileId
      || (state.receiptDraft.storageAssetId ? `temp:${truncateText(state.receiptDraft.storageAssetId, 18)}` : "未保存");
    setText(els.receiptUrlLabel, receiptUrlLabel + statusSuffix);
    setText(els.receiptFileIdLabel, receiptFileIdLabel);
    renderReceiptAssetList();
    renderPendingReceiptUploadQueue();
    renderReceiptFlowStatus();
  }

  function getReceiptStorageAssetUrl(assetId) {
    const id = String(assetId || "").trim();
    if (!id) return "";
    const baseUrl = String(config.ai?.apiBaseUrl || "").replace(/\/$/, "");
    if (!baseUrl) return "";
    return `${baseUrl}/api/receipt/assets/${encodeURIComponent(id)}`;
  }

  function isGcsReceiptFileId(fileId) {
    return String(fileId || "").trim().startsWith("gcs:");
  }

  function isDriveReceiptUrl(url) {
    return /https:\/\/drive\.google\.com\//.test(String(url || ""));
  }

  function normalizeReceiptAsset(asset = {}, fallback = {}) {
    const raw = asset && typeof asset === "object" ? asset : {};
    const storageAssetId = String(raw.storageAssetId || raw.receiptStorageAssetId || "").trim();
    const driveFileId = String(raw.driveFileId || raw.receiptDriveFileId || raw.receiptFileId || "").trim();
    const driveUrl = String(raw.driveUrl || raw.receiptDriveUrl || "").trim();
    const storageUrl = String(raw.storageUrl || (storageAssetId ? getReceiptStorageAssetUrl(storageAssetId) : "") || "").trim();
    const fallbackId = storageAssetId || driveFileId || raw.fileId || crypto.randomUUID();
    const status = String(raw.status || raw.receiptStorageStatus || raw.receiptUploadStatus || (driveUrl || driveFileId ? "drive_synced" : storageAssetId ? "storage_saved" : "")).trim();
    return {
      id: String(raw.id || fallbackId).trim(),
      storageAssetId,
      storageUrl,
      driveFileId,
      driveUrl,
      fileName: String(raw.fileName || raw.name || fallback.fileName || "レシート画像").trim(),
      mimeType: String(raw.mimeType || raw.fileType || fallback.mimeType || "").trim(),
      source: String(raw.source || "manual_attach").trim(),
      status,
      uploadedAt: String(raw.uploadedAt || raw.storageUploadedAt || raw.receiptStorageUploadedAt || fallback.uploadedAt || "").trim(),
      uploadedBy: String(raw.uploadedBy || raw.createdBy || fallback.uploadedBy || "").trim(),
      isPrimary: raw.isPrimary === true,
    };
  }

  function buildLegacyReceiptAsset(record = {}) {
    const receiptUrl = String(record?.receiptUrl || "").trim();
    const receiptFileId = String(record?.receiptFileId || "").trim();
    const driveUrl = String(record?.receiptDriveUrl || (isDriveReceiptUrl(receiptUrl) ? receiptUrl : "")).trim();
    const driveFileId = String(record?.receiptDriveFileId || (receiptFileId && !isGcsReceiptFileId(receiptFileId) ? receiptFileId : "")).trim();
    const storageAssetId = String(record?.receiptStorageAssetId || (isGcsReceiptFileId(receiptFileId) ? receiptFileId.replace(/^gcs:/, "") : "")).trim();
    if (!receiptUrl && !receiptFileId && !driveUrl && !driveFileId && !storageAssetId) return null;
    return normalizeReceiptAsset({
      id: storageAssetId || driveFileId || receiptFileId || crypto.randomUUID(),
      storageAssetId,
      storageUrl: storageAssetId ? getReceiptStorageAssetUrl(storageAssetId) : "",
      driveFileId,
      driveUrl,
      fileName: `${String(record?.date || todayISO()).trim() || todayISO()}_${String(record?.serialCode || record?.id || "NO-SERIAL").trim() || "NO-SERIAL"}_${String(record?.storeName || "レシート").trim() || "レシート"}_${Math.max(Math.round(Number(record?.amount) || 0), 0)}JPY${getReceiptDriveFileExtension(driveUrl || receiptUrl || "receipt.jpg", "")}`,
      status: driveUrl || driveFileId ? "drive_synced" : storageAssetId ? "storage_saved" : String(record?.receiptUploadStatus || ""),
      uploadedAt: record?.receiptUploadedAt || record?.receiptStorageUploadedAt || "",
      uploadedBy: record?.createdBy || "",
      isPrimary: true,
    });
  }

  function getReceiptAssets(record = {}) {
    const assets = [];
    const seen = new Set();
    const push = (asset) => {
      if (!asset) return;
      const normalized = normalizeReceiptAsset(asset, { uploadedBy: record?.createdBy || "" });
      const key = normalized.storageAssetId || normalized.driveFileId || normalized.driveUrl || normalized.storageUrl || normalized.id;
      if (!key || seen.has(key)) return;
      seen.add(key);
      assets.push(normalized);
    };
    (Array.isArray(record?.receiptAssets) ? record.receiptAssets : []).forEach(push);
    push(buildLegacyReceiptAsset(record));
    if (assets.length && !assets.some((asset) => asset.isPrimary)) assets[0].isPrimary = true;
    return assets;
  }

  function getPrimaryReceiptAsset(record = {}) {
    const assets = getReceiptAssets(record);
    return assets.find((asset) => asset.isPrimary) || assets[0] || null;
  }

  function buildReceiptAssetFromDraft() {
    const storageAssetId = String(state.receiptDraft.storageAssetId || "").trim();
    const driveUrl = String(state.receiptDraft.driveUrl || "").trim();
    const driveFileId = String(state.receiptDraft.driveFileId || "").trim();
    if (!storageAssetId && !driveUrl && !driveFileId) return null;
    return normalizeReceiptAsset({
      id: storageAssetId || driveFileId || crypto.randomUUID(),
      storageAssetId,
      storageUrl: storageAssetId ? getReceiptStorageAssetUrl(storageAssetId) : "",
      driveUrl,
      driveFileId,
      fileName: state.receiptDraft.file?.name || "レシート画像",
      mimeType: state.receiptDraft.file?.type || "",
      source: "manual_attach",
      status: driveUrl || driveFileId ? "drive_synced" : "storage_saved",
      uploadedAt: state.receiptDraft.uploadedAt || state.receiptDraft.storageUploadedAt || "",
      uploadedBy: state.currentUser?.email || "",
    });
  }

  function mergeReceiptAssets(...groups) {
    const merged = [];
    const seen = new Set();
    groups.flat().forEach((asset) => {
      if (!asset) return;
      const normalized = normalizeReceiptAsset(asset);
      const key = normalized.storageAssetId || normalized.driveFileId || normalized.driveUrl || normalized.storageUrl || normalized.id;
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(normalized);
    });
    if (merged.length && !merged.some((asset) => asset.isPrimary)) merged[0].isPrimary = true;
    return merged.map((asset, index) => ({ ...asset, isPrimary: asset.isPrimary || index === 0 }));
  }

  function getReceiptAssetOpenUrl(asset = {}) {
    return asset.driveUrl || asset.storageUrl || "";
  }

  function applyPrimaryReceiptAssetToDraft(asset = null) {
    const primary = asset || getPrimaryReceiptAsset({ receiptAssets: mergeReceiptAssets(state.receiptDraft.receiptAssets || [], state.receiptDraft.pendingReceiptAssets || []) });
    state.receiptDraft.storageAssetId = primary?.storageAssetId || "";
    state.receiptDraft.storageUploadedAt = primary?.uploadedAt || "";
    state.receiptDraft.storageStatus = primary?.storageAssetId ? "stored" : "";
    state.receiptDraft.driveFileId = primary?.driveFileId || "";
    state.receiptDraft.driveUrl = primary?.driveUrl || "";
    state.receiptDraft.uploadedAt = primary?.uploadedAt || "";
    state.receiptDraft.uploadStatus = primary?.driveUrl || primary?.driveFileId ? "success" : primary?.storageAssetId ? "storage_saved" : "";
  }

  function renderReceiptAssetList() {
    if (!els.receiptAssetList) return;
    const assets = mergeReceiptAssets(state.receiptDraft.receiptAssets || [], state.receiptDraft.pendingReceiptAssets || []);
    if (!assets.length) {
      els.receiptAssetList.innerHTML = '<p class="muted small">添付済みレシートはありません。</p>';
      return;
    }
    els.receiptAssetList.innerHTML = assets.map((asset, index) => {
      const status = asset.driveUrl || asset.driveFileId ? "Drive保存完了" : asset.storageAssetId ? "画像を保存しました" : "未保存";
      const openUrl = getReceiptAssetOpenUrl(asset);
      return `
        <div class="receipt-asset-row">
          <div>
            <strong>${escapeHtml(asset.fileName || `レシート${index + 1}`)}</strong>
            <small>${escapeHtml(status)}${asset.isPrimary ? " / 代表" : ""}</small>
          </div>
          <div class="button-row">
            ${openUrl ? `<button class="ghost-button compact" type="button" data-open-receipt-asset-row="${escapeHtml(asset.storageAssetId || "")}" data-open-receipt-url="${escapeHtml(openUrl)}">開く</button>` : ""}
            ${!asset.isPrimary ? `<button class="ghost-button compact" type="button" data-receipt-asset-primary="${index}">代表</button>` : ""}
            <button class="ghost-button compact" type="button" data-receipt-asset-remove="${index}">解除</button>
          </div>
        </div>
      `;
    }).join("");
    els.receiptAssetList.querySelectorAll("[data-receipt-asset-primary]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.receiptAssetPrimary);
        const nextAssets = assets.map((asset, assetIndex) => ({ ...asset, isPrimary: assetIndex === index }));
        state.receiptDraft.receiptAssets = nextAssets;
        state.receiptDraft.pendingReceiptAssets = [];
        state.receiptDraft.receiptAssetsEdited = true;
        applyPrimaryReceiptAssetToDraft(nextAssets[index]);
        renderReceiptLinkedInfo();
        setText(els.formMessage, "代表レシートを変更しました。保存ボタンを押すと反映します。");
      });
    });
    els.receiptAssetList.querySelectorAll("[data-receipt-asset-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.receiptAssetRemove);
        const nextAssets = assets
          .filter((_, assetIndex) => assetIndex !== index)
          .map((asset, assetIndex) => ({ ...asset, isPrimary: assetIndex === 0 }));
        state.receiptDraft.receiptAssets = nextAssets;
        state.receiptDraft.pendingReceiptAssets = [];
        state.receiptDraft.receiptAssetsEdited = true;
        applyPrimaryReceiptAssetToDraft(getPrimaryReceiptAsset({ receiptAssets: nextAssets }));
        renderReceiptLinkedInfo();
        setText(els.formMessage, "レシートの紐付けを解除しました。保存ボタンを押すと反映します。");
      });
    });
    els.receiptAssetList.querySelectorAll("[data-open-receipt-asset-row]").forEach((button) => {
      button.addEventListener("click", () => {
        const assetId = String(button.dataset.openReceiptAssetRow || "").trim();
        const url = String(button.dataset.openReceiptUrl || "").trim();
        if (assetId && url.includes("/api/receipt/assets/")) {
          openReceiptStorageAsset(assetId).catch((error) => {
            showSyncToast(error?.message || "レシート画像を開けませんでした。", "error", { duration: 3200 });
          });
          return;
        }
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
    });
  }

  function buildReceiptFieldsFromDraft(existing = {}) {
    const receiptAssets = mergeReceiptAssets(
      state.receiptDraft.receiptAssetsEdited ? [] : getReceiptAssets(existing),
      state.receiptDraft.receiptAssets || [],
      [buildReceiptAssetFromDraft()],
      state.receiptDraft.pendingReceiptAssets || []
    );
    const primaryAsset = receiptAssets.find((asset) => asset.isPrimary) || receiptAssets[0] || null;
    const storageAssetId = String(state.receiptDraft.storageAssetId || (state.receiptDraft.receiptAssetsEdited ? "" : existing?.receiptStorageAssetId) || "").trim();
    const existingReceiptUrl = String(state.receiptDraft.receiptAssetsEdited ? "" : existing?.receiptUrl || "").trim();
    const existingReceiptFileId = String(state.receiptDraft.receiptAssetsEdited ? "" : existing?.receiptFileId || "").trim();
    const driveUrl = String(
      state.receiptDraft.driveUrl
      || (state.receiptDraft.receiptAssetsEdited ? "" : existing?.receiptDriveUrl)
      || (isDriveReceiptUrl(existingReceiptUrl) ? existingReceiptUrl : "")
      || ""
    ).trim();
    const driveFileId = String(
      state.receiptDraft.driveFileId
      || (state.receiptDraft.receiptAssetsEdited ? "" : existing?.receiptDriveFileId)
      || (existingReceiptFileId && !isGcsReceiptFileId(existingReceiptFileId) ? existingReceiptFileId : "")
      || ""
    ).trim();
    const hasDrive = Boolean(driveUrl || driveFileId);
    const storageUrl = getReceiptStorageAssetUrl(storageAssetId);
    const draftStatus = String(state.receiptDraft.uploadStatus || "").trim();
    const primaryHasDrive = Boolean(primaryAsset?.driveUrl || primaryAsset?.driveFileId);
    const primaryStorageAssetId = String(primaryAsset?.storageAssetId || storageAssetId || "").trim();
    const primaryStorageUrl = primaryStorageAssetId ? getReceiptStorageAssetUrl(primaryStorageAssetId) : String(primaryAsset?.storageUrl || storageUrl || "").trim();
    const primaryDriveUrl = String(primaryAsset?.driveUrl || driveUrl || "").trim();
    const primaryDriveFileId = String(primaryAsset?.driveFileId || driveFileId || "").trim();
    return {
      receiptUrl: primaryHasDrive ? (primaryDriveUrl || existingReceiptUrl) : (primaryStorageUrl || existingReceiptUrl),
      receiptFileId: primaryHasDrive ? (primaryDriveFileId || existingReceiptFileId) : (primaryStorageAssetId ? `gcs:${primaryStorageAssetId}` : existingReceiptFileId),
      receiptDriveUrl: primaryDriveUrl,
      receiptDriveFileId: primaryDriveFileId,
      receiptUploadedAt: state.receiptDraft.uploadedAt || primaryAsset?.uploadedAt || existing?.receiptUploadedAt || state.receiptDraft.storageUploadedAt || "",
      receiptUploadStatus: primaryHasDrive
        ? (draftStatus || existing?.receiptUploadStatus || "success")
        : (primaryStorageAssetId ? "storage_saved" : (draftStatus || existing?.receiptUploadStatus || "")),
      receiptUploaderName: state.receiptDraft.uploaderName || existing?.receiptUploaderName || "",
      receiptStorageAssetId: primaryStorageAssetId,
      receiptStorageUploadedAt: state.receiptDraft.storageUploadedAt || primaryAsset?.uploadedAt || existing?.receiptStorageUploadedAt || "",
      receiptStorageStatus: state.receiptDraft.storageStatus || primaryAsset?.status || existing?.receiptStorageStatus || (primaryStorageAssetId ? "stored" : ""),
      receiptAssets,
      receiptAssetCount: receiptAssets.length,
    };
  }

  function getPendingReceiptUploadJob(recordIds) {
    if (state.receiptDraft.storageAssetId && !state.receiptDraft.driveUrl) return null;
    if ((!state.receiptDraft.file && !state.receiptDraft.storageAssetId) || state.receiptDraft.driveUrl) return null;
    const ids = (Array.isArray(recordIds) ? recordIds : [recordIds]).filter(Boolean);
    if (!ids.length) return null;
    const storageAssetId = state.receiptDraft.storageAssetId || "";
    return {
      jobId: storageAssetId ? `receipt-storage-${storageAssetId}` : crypto.randomUUID(),
      file: storageAssetId ? null : state.receiptDraft.file,
      fileName: state.receiptDraft.file?.name || "receipt-image",
      fileType: state.receiptDraft.file?.type || "",
      fileSize: Number(state.receiptDraft.file?.size) || 0,
      storageAssetId,
      storageUploadedAt: state.receiptDraft.storageUploadedAt || "",
      recordIds: ids,
      fileContext: buildReceiptUploadContext(),
    };
  }

  function buildReceiptUploadContext() {
    const filenameSeed = state.splitMode ? (state.splitEntries[0] || {}) : buildSingleEntryValues();
    return {
      date: String(els.date?.value || todayISO()).trim() || todayISO(),
      storeName: String(filenameSeed.storeName || "").trim(),
      category: String(filenameSeed.category || "").trim(),
      memo: String(filenameSeed.memo || "").trim(),
    };
  }

  async function createPendingReceiptUploadJob(job) {
    if ((!job?.file && !job?.storageAssetId) || !job?.recordIds?.length) return null;
    const meta = upsertPendingReceiptUploadMeta({
      jobId: job.jobId || crypto.randomUUID(),
      recordIds: job.recordIds,
      storageAssetId: job.storageAssetId || "",
      storageUploadedAt: job.storageUploadedAt || "",
      fileName: job.file?.name || job.fileName || "receipt-image",
      fileType: job.file?.type || job.fileType || "",
      fileSize: Number(job.file?.size) || job.fileSize || 0,
      fileContext: job.fileContext || buildReceiptUploadContext(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attempts: 0,
      status: "queued",
      lastError: "",
    });
    if (!meta) return null;
    if (job.file) {
      await putPendingReceiptUploadBlob(meta.jobId, job.file);
    }
    return meta;
  }

  function getPendingReceiptUploadMeta(jobId) {
    return (state.pendingReceiptUploads || []).find((item) => item.jobId === jobId) || null;
  }

  function hasLegacyPendingReceiptUploads() {
    const delegated = callReceiptFeature("hasLegacyPendingReceiptUploads");
    if (delegated !== undefined) return delegated;
    return false;
  }

  async function processPendingReceiptUploadJob(jobId, options = {}) {
    if (!jobId || _receiptUploadProcessingJobs.has(jobId)) return false;
    const meta = getPendingReceiptUploadMeta(jobId);
    if (!meta) return false;
    _receiptUploadProcessingJobs.add(jobId);
    const interactive = options.interactive === true;
    try {
      upsertPendingReceiptUploadMeta({
        ...meta,
        status: "uploading",
        updatedAt: new Date().toISOString(),
        lastError: "",
      });
      let saved = false;
      let fields = null;
      if (meta.storageAssetId) {
        const firstRecord = (meta.recordIds || [])
          .map((recordId) => state.expenses.find((item) => item.id === recordId) || state.expenseListItems.find((item) => item.id === recordId))
          .find(Boolean) || {
            receiptStorageAssetId: meta.storageAssetId,
            receiptStorageUploadedAt: meta.storageUploadedAt || "",
            ...(meta.fileContext || {}),
          };
        const groupedRecords = (meta.recordIds || [])
          .map((recordId) => state.expenses.find((item) => item.id === recordId) || state.expenseListItems.find((item) => item.id === recordId))
          .filter(Boolean);
        const file = await fetchReceiptStorageAssetAsFile(firstRecord);
        const uploaded = await uploadFileToDrive(file, {
          allowInteractiveAuth: interactive,
          fileContext: buildReceiptDriveContextFromRecords(groupedRecords, meta.fileContext || {}),
        });
        fields = {
          receiptUrl: uploaded.url,
          receiptFileId: uploaded.id,
          receiptDriveUrl: uploaded.url,
          receiptDriveFileId: uploaded.id,
          receiptUploadedAt: uploaded.uploadedAt,
          receiptUploadStatus: "success",
          receiptUploadError: "",
          receiptUploaderName: uploaded.uploaderName || "",
          receiptStorageAssetId: meta.storageAssetId,
          receiptStorageStatus: "drive_synced",
          receiptStorageDriveSyncedAt: uploaded.uploadedAt,
        };
        saved = await persistReceiptUploadForRecords(meta.recordIds, fields);
        meta.recordIds.forEach((recordId) => syncReceiptDraftFromRecord(recordId, fields));
      } else {
        const file = await getPendingReceiptUploadBlob(jobId);
        if (!file) {
          throw new Error("レシート画像の一時データが見つかりませんでした。もう一度画像を選んでください。");
        }
        const uploaded = await uploadFileToDrive(file, {
          allowInteractiveAuth: interactive,
          fileContext: buildReceiptDriveContextFromRecords(
            (meta.recordIds || [])
              .map((recordId) => state.expenses.find((item) => item.id === recordId) || state.expenseListItems.find((item) => item.id === recordId))
              .filter(Boolean),
            meta.fileContext || {},
          ),
        });
        fields = {
          receiptUrl: uploaded.url,
          receiptFileId: uploaded.id,
          receiptDriveUrl: uploaded.url,
          receiptDriveFileId: uploaded.id,
          receiptUploadedAt: uploaded.uploadedAt,
          receiptUploadStatus: "success",
          receiptUploaderName: uploaded.uploaderName || "",
        };
        saved = await persistReceiptUploadForRecords(meta.recordIds, fields);
        meta.recordIds.forEach((recordId) => syncReceiptDraftFromRecord(recordId, fields));
      }
      await removePendingReceiptUploadJob(jobId);
      showSyncToast(saved ? "レシート画像を保存しました。" : "レシート画像は保存しましたが、一部明細への反映に失敗しました。", saved ? "success" : "error", { duration: saved ? 2200 : 3200 });
      return saved;
    } catch (error) {
      console.error("Pending receipt upload failed", error);
      const status = getReceiptPendingStatusFromError(error);
      const message = classifyDriveError(error);
      upsertPendingReceiptUploadMeta({
        ...meta,
        status,
        updatedAt: new Date().toISOString(),
        attempts: (meta.attempts || 0) + 1,
        lastError: message,
      });
      await persistReceiptUploadForRecords(meta.recordIds, {
        receiptUploadStatus: "failed",
      });
      meta.recordIds.forEach((recordId) => syncReceiptDraftFromRecord(recordId, { receiptUploadStatus: "failed" }));
      if (!options.silent) {
        showSyncToast(`レシート画像の保存は保留になりました: ${message}`, "error", { duration: 4200 });
      }
      setReceiptFlowStatus({
        drive: status === "needs_auth" ? "needs_auth" : state.receiptFlowStatus.drive,
        message: status === "needs_auth"
          ? "Drive 側の権限を確認したあと、未処理キューから再送できます。"
          : "レシート画像の保存を未処理キューへ残しました。あとで再送できます。",
      });
      return false;
    } finally {
      _receiptUploadProcessingJobs.delete(jobId);
      renderPendingReceiptUploadQueue();
      renderReceiptFlowStatus();
    }
  }

  async function queueDeferredReceiptUpload(job, options = {}) {
    if ((!job?.file && !job?.storageAssetId) || !job.recordIds?.length) return null;
    const meta = await createPendingReceiptUploadJob(job);
    if (!meta) return null;
    if (!options.silent) {
      showSyncToast("レシート画像をバックグラウンドで保存しています...", "pending", { duration: 2200 });
    }
    processPendingReceiptUploadJob(meta.jobId, {
      interactive: options.interactive === true,
      silent: options.silent === true,
    }).catch((error) => {
      console.error("Queued receipt upload failed", error);
    });
    return meta.jobId;
  }

  async function resumePendingReceiptUploads(options = {}) {
    return callReceiptFeature("resumePendingReceiptUploads", options);
  }

  async function retryPendingReceiptUploads(options = {}) {
    return callReceiptFeature("retryPendingReceiptUploads", options);
  }

  function applyReceiptUploadFields(record, fields = {}) {
    const receiptAssetUpdate = fields.receiptAssetUpdate ? normalizeReceiptAsset(fields.receiptAssetUpdate) : null;
    const receiptAssets = mergeReceiptAssets(getReceiptAssets(record)).map((asset) => {
      if (!receiptAssetUpdate) return asset;
      const sameAsset = (
        (receiptAssetUpdate.storageAssetId && asset.storageAssetId === receiptAssetUpdate.storageAssetId)
        || (receiptAssetUpdate.id && asset.id === receiptAssetUpdate.id)
      );
      return sameAsset ? { ...asset, ...receiptAssetUpdate } : asset;
    });
    if (receiptAssetUpdate && !receiptAssets.some((asset) => (
      (receiptAssetUpdate.storageAssetId && asset.storageAssetId === receiptAssetUpdate.storageAssetId)
      || (receiptAssetUpdate.id && asset.id === receiptAssetUpdate.id)
    ))) {
      receiptAssets.push(receiptAssetUpdate);
    }
    const primaryAsset = receiptAssets.find((asset) => asset.isPrimary) || receiptAssets[0] || null;
    const primaryHasDrive = Boolean(primaryAsset?.driveUrl || primaryAsset?.driveFileId);
    const primaryStorageAssetId = String(primaryAsset?.storageAssetId || fields.receiptStorageAssetId || record?.receiptStorageAssetId || "").trim();
    return normalizeExpense({
      ...record,
      receiptUrl: primaryAsset
        ? (primaryHasDrive ? primaryAsset.driveUrl : (primaryAsset.storageUrl || getReceiptStorageAssetUrl(primaryStorageAssetId)))
        : (fields.receiptUrl ?? record?.receiptUrl ?? ""),
      receiptFileId: primaryAsset
        ? (primaryHasDrive ? primaryAsset.driveFileId : (primaryStorageAssetId ? `gcs:${primaryStorageAssetId}` : ""))
        : (fields.receiptFileId ?? record?.receiptFileId ?? ""),
      receiptDriveUrl: primaryHasDrive ? primaryAsset.driveUrl : (fields.receiptDriveUrl ?? record?.receiptDriveUrl ?? ""),
      receiptDriveFileId: primaryHasDrive ? primaryAsset.driveFileId : (fields.receiptDriveFileId ?? record?.receiptDriveFileId ?? ""),
      receiptUploadedAt: primaryAsset?.uploadedAt || fields.receiptUploadedAt || record?.receiptUploadedAt || "",
      receiptUploadStatus: fields.receiptUploadStatus ?? record?.receiptUploadStatus ?? "",
      receiptUploadError: fields.receiptUploadError ?? record?.receiptUploadError ?? "",
      receiptUploaderName: fields.receiptUploaderName ?? record?.receiptUploaderName ?? "",
      receiptStorageAssetId: primaryStorageAssetId,
      receiptStorageUploadedAt: fields.receiptStorageUploadedAt ?? record?.receiptStorageUploadedAt ?? "",
      receiptStorageStatus: fields.receiptStorageStatus ?? record?.receiptStorageStatus ?? "",
      receiptStorageDriveSyncedAt: fields.receiptStorageDriveSyncedAt ?? record?.receiptStorageDriveSyncedAt ?? "",
      receiptAssets,
      receiptAssetCount: receiptAssets.length,
    });
  }

  async function persistReceiptUploadForRecord(recordId, fields) {
    const localRecord = state.expenses.find((item) => item.id === recordId);
    if (!localRecord) return false;
    const patched = applyReceiptUploadFields(localRecord, fields);
    if (!canUseSharedStorage()) {
      upsertStateRecord("expenses", patched);
      upsertExpenseListRecord(patched);
      loadExpenseOverviewFromBackend({ silent: true }).catch(() => {});
      persist({ skipRemote: true });
      return true;
    }
    const remoteRecord = await loadSharedRecord("expenses", recordId) || localRecord;
    const result = await saveSharedRecord("expenses", applyReceiptUploadFields(remoteRecord, fields), {
      action: "update",
      expectedUpdatedAt: remoteRecord.updatedAt,
      allowConflictRetry: false,
    });
    if (result.ok) {
      await loadSharedRecord("expenses", recordId);
      return true;
    }
    return false;
  }

  async function persistReceiptUploadForRecords(recordIds, fields) {
    const ids = (Array.isArray(recordIds) ? recordIds : [recordIds]).filter(Boolean);
    let allSucceeded = true;
    for (const recordId of ids) {
      const ok = await persistReceiptUploadForRecord(recordId, fields);
      if (!ok) allSucceeded = false;
    }
    return allSucceeded;
  }

  function syncReceiptDraftFromRecord(recordId, fields = {}) {
    if (!els.expenseId || els.expenseId.value !== recordId) return;
    state.receiptDraft.driveUrl = fields.receiptDriveUrl ?? state.receiptDraft.driveUrl;
    state.receiptDraft.driveFileId = fields.receiptDriveFileId ?? state.receiptDraft.driveFileId;
    state.receiptDraft.uploadedAt = fields.receiptUploadedAt ?? state.receiptDraft.uploadedAt;
    state.receiptDraft.uploadStatus = fields.receiptUploadStatus ?? state.receiptDraft.uploadStatus;
    state.receiptDraft.uploaderName = fields.receiptUploaderName ?? state.receiptDraft.uploaderName;
    state.receiptDraft.storageAssetId = fields.receiptStorageAssetId ?? state.receiptDraft.storageAssetId;
    state.receiptDraft.storageUploadedAt = fields.receiptStorageUploadedAt ?? state.receiptDraft.storageUploadedAt;
    state.receiptDraft.storageStatus = fields.receiptStorageStatus ?? state.receiptDraft.storageStatus;
    if (fields.receiptAssetUpdate) {
      state.receiptDraft.receiptAssets = mergeReceiptAssets(
        state.receiptDraft.receiptAssets || [],
        [fields.receiptAssetUpdate]
      );
    }
    renderReceiptLinkedInfo();
  }

  async function deleteCurrentExpense() {
    const id = els.expenseId.value;
    if (!id) return;
    const returnTab = state.entryReturnTab;
    setText(els.formMessage, "支出削除を共有データへ反映中です...");
    let synced = true;
    if (canUseSharedStorage()) {
      showSyncToast("支出削除を共有データへ反映中です...", "pending", { sticky: true });
      const result = await deleteSharedRecord("expenses", id, {
        expectedUpdatedAt: els.expenseUpdatedAt?.value,
      });
      synced = result.ok;
      if (synced) {
        state.expenses = state.expenses.filter((item) => item.id !== id);
        removeExpenseListRecord(id);
        loadExpenseOverviewFromBackend({ silent: true }).catch(() => {});
        persist({ skipRemote: true });
        showSyncToast("支出を共有データから削除しました。", "success");
      } else {
        showSyncToast("支出削除の共有反映に失敗しました。", "error", { duration: 3200 });
      }
    } else {
      state.expenses = state.expenses.filter((item) => item.id !== id);
      removeExpenseListRecord(id);
      loadExpenseOverviewFromBackend({ silent: true }).catch(() => {});
      persist({ skipRemote: true });
      showSyncToast("支出を削除しました。", "success");
    }
    renderAll();
    resetForm();
    if (state.expenseEditModalOpen) {
      closeExpenseEditModal({ reset: false });
    }
    setText(els.formMessage, returnTab ? "" : (synced ? "支出を削除しました。" : "支出削除の共有反映に失敗しました。"));
    if (returnTab && returnTab !== "entry") {
      switchTab(returnTab);
    }
  }

  async function onTransferSubmit(event) {
    event.preventDefault();
    const wasEditing = Boolean(els.transferId.value);
    const amount = Number(els.transferAmount.value);
    if (!amount || amount < 1) {
      setText(els.transferMessage, "送金額は1以上で入力してください。");
      return;
    }
    if (els.transferFromPerson.value === els.transferToPerson.value) {
      setText(els.transferMessage, "送金元と送金先は別の人を選択してください。");
      return;
    }

    // 当年以外の年で新規登録する際の警告確認
    if (!wasEditing && els.transferDate?.value) {
      const inputYear = els.transferDate.value.slice(0, 4);
      const cYear = window.KakeiboCore.currentYear();
      if (inputYear && inputYear !== cYear) {
        const confirmed = window.confirm(`登録する日付（${els.transferDate.value}）の年は当年（${cYear}年）ではありませんが、よろしいですか？`);
        if (!confirmed) {
          return;
        }
      }
    }
    const now = new Date().toISOString();
    const existing = state.transfers.find((item) => item.id === els.transferId.value);
    const originalUpdatedAt = String(els.transferUpdatedAt?.value || existing?.updatedAt || "").trim();
    const transfer = {
      id: els.transferId.value || crypto.randomUUID(),
      date: els.transferDate.value,
      type: normalizeTransferType(els.transferType.value),
      settlementScope: normalizeTransferSettlementScope(els.transferSettlementScope?.value),
      fromPerson: els.transferFromPerson.value,
      toPerson: els.transferToPerson.value,
      amount,
      memo: els.transferMemo.value.trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: originalUpdatedAt || now,
      createdBy: existing?.createdBy || state.currentUser?.email || "",
      serialCode: existing?.serialCode || "",
    };
    const existingIndex = state.transfers.findIndex((item) => item.id === transfer.id);
    setText(els.transferMessage, "送金を共有データへ反映中です...");
    let synced = true;
    if (canUseSharedStorage()) {
      showSyncToast("送金を共有データへ反映中です...", "pending", { sticky: true });
      const result = await saveSharedRecord("transfers", transfer, {
        action: existingIndex >= 0 ? "update" : "create",
        expectedUpdatedAt: els.transferUpdatedAt?.value,
      });
      synced = result.ok;
      if (synced) {
        showSyncToast(existingIndex >= 0 ? "送金を共有データへ更新しました。" : "送金を共有データへ登録しました。", "success");
      } else {
        showSyncToast(existingIndex >= 0 ? "送金更新の共有反映に失敗しました。" : "送金登録の共有反映に失敗しました。", "error", { duration: 3200 });
      }
    } else if (existingIndex >= 0) {
      state.transfers[existingIndex] = transfer;
      persist({ skipRemote: true });
      showSyncToast("送金を更新しました。", "success");
    } else {
      state.transfers.unshift(transfer);
      persist({ skipRemote: true });
      showSyncToast("送金を登録しました。", "success");
    }
    renderTransferList();
    resetTransferForm(false);
    setText(els.transferMessage, synced ? (existingIndex >= 0 ? "送金を更新しました。" : "送金を登録しました。") : "送金の共有反映に失敗しました。");
    if (wasEditing && state.editScrollContext) {
      restoreEditScrollContext();
    }
  }

  function resetTransferForm(clearEditContext = true) {
    els.transferForm?.reset();
    if (clearEditContext) state.editScrollContext = null;
    if (els.transferId) els.transferId.value = "";
    if (els.transferUpdatedAt) els.transferUpdatedAt.value = "";
    if (els.transferDate) els.transferDate.value = todayISO();
    if (els.transferType) els.transferType.value = "transfer";
    if (els.transferSettlementScope) els.transferSettlementScope.value = "private_lending";
    if (els.transferFromPerson) els.transferFromPerson.value = state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband";
    if (els.transferToPerson) els.transferToPerson.value = state.currentUser?.email === "partner-email@example.com" ? "husband" : "wife";
    els.transferDeleteButton?.classList.add("hidden");
    setText(els.transferMessage, "");
  }

  function renderTransferList() {
    if (!els.transferList) return;
    renderTransferYearSummary();
    const hasTransferData = Array.isArray(state.transfers) && state.transfers.length > 0;
    if (canUseSharedStorage() && state.sharedStateLoading && !state.sharedStateLoaded && !hasTransferData) {
      if (els.transferFilterSummary) {
        setText(els.transferFilterSummary, "送金履歴を読み込み中です。");
      }
      els.transferList.innerHTML = '<div class="expense-card"><span class="muted">送金履歴を読み込み中です...</span></div>';
      return;
    }
    if (canUseSharedStorage() && !state.sharedStateLoaded && !hasTransferData) {
      if (els.transferFilterSummary) {
        setText(els.transferFilterSummary, "共有データの接続確認後に送金履歴を表示します。");
      }
      els.transferList.innerHTML = '<div class="expense-card"><span class="muted">共有データの接続確認後に送金履歴を表示します。</span></div>';
      return;
    }
    const items = getFilteredTransfers();
    if (els.transferFilterSummary) {
      setText(els.transferFilterSummary, buildRangeSummaryText("送金", items.length, els.transferFilterStartMonth?.value, els.transferFilterEndMonth?.value));
    }
    if (!items.length) {
      els.transferList.innerHTML = '<div class="expense-card"><span class="muted">まだ送金が登録されていません。</span></div>';
      return;
    }
    els.transferList.innerHTML = items.map((item) => `
      <article class="expense-card">
        <div class="expense-topline">
          <div>
            <div class="expense-store">${escapeHtml(TRANSFER_TYPE_LABELS[item.type] || item.type)}</div>
            <div class="expense-subline">${escapeHtml(item.serialCode || "未採番")} / ${escapeHtml(item.date)} / ${escapeHtml(getTransferSettlementScopeLabel(item.settlementScope))}</div>
          </div>
          <strong>${formatCurrency(item.amount)}</strong>
        </div>
        <div class="badge-row">
          <span class="badge">${escapeHtml(PAYER_LABELS[item.fromPerson] || item.fromPerson)} → ${escapeHtml(PAYER_LABELS[item.toPerson] || item.toPerson)}</span>
          <span class="badge">${escapeHtml(getTransferSettlementScopeLabel(item.settlementScope))}</span>
        </div>
        <div class="expense-meta">
          <span class="muted small">${escapeHtml(item.memo || "メモなし")}</span>
          <div class="button-row">
            <button class="ghost-button" type="button" data-edit-transfer-id="${item.id}">編集</button>
          </div>
        </div>
      </article>
    `).join("");
    els.transferList.querySelectorAll("[data-edit-transfer-id]").forEach((button) => {
      button.addEventListener("click", () => loadTransferIntoForm(button.dataset.editTransferId));
    });
  }

  function renderTransferYearSummary() {
    if (!els.transferYearSummary) return;
    const year = currentYear();
    const privateRows = getTransferYearDirectionSummary(year, "private_lending");
    const poolRows = getTransferYearDirectionSummary(year, "household_pool");
    els.transferYearSummary.innerHTML = [
      buildMiniSummaryCard(`${year}年 個人間貸借`, privateRows),
      buildMiniSummaryCard(`${year}年 家計費プール移動`, poolRows),
    ].join("");
  }

  function loadTransferIntoForm(id) {
    const transfer = state.transfers.find((item) => item.id === id);
    if (!transfer) return;
    rememberEditScrollContext("transfer", id);
    els.transferId.value = transfer.id;
    if (els.transferUpdatedAt) els.transferUpdatedAt.value = transfer.updatedAt || "";
    els.transferDate.value = transfer.date || todayISO();
    els.transferType.value = normalizeTransferType(transfer.type);
    if (els.transferSettlementScope) els.transferSettlementScope.value = normalizeTransferSettlementScope(transfer.settlementScope);
    els.transferFromPerson.value = transfer.fromPerson || "husband";
    els.transferToPerson.value = transfer.toPerson || "wife";
    els.transferAmount.value = transfer.amount || "";
    els.transferMemo.value = transfer.memo || "";
    els.transferDeleteButton.classList.remove("hidden");
    setText(els.transferMessage, "既存の送金を読み込みました。修正後に保存してください。");
    scrollToElementTop(els.transferForm);
  }

  async function deleteCurrentTransfer() {
    const id = els.transferId.value;
    if (!id) return;
    setText(els.transferMessage, "送金削除を共有データへ反映中です...");
    let synced = true;
    if (canUseSharedStorage()) {
      showSyncToast("送金削除を共有データへ反映中です...", "pending", { sticky: true });
      const result = await deleteSharedRecord("transfers", id, {
        expectedUpdatedAt: els.transferUpdatedAt?.value,
      });
      synced = result.ok;
      if (synced) {
        showSyncToast("送金を共有データから削除しました。", "success");
      } else {
        showSyncToast("送金削除の共有反映に失敗しました。", "error", { duration: 3200 });
      }
    } else {
      state.transfers = state.transfers.filter((item) => item.id !== id);
      persist({ skipRemote: true });
      showSyncToast("送金を削除しました。", "success");
    }
    renderTransferList();
    resetTransferForm();
    setText(els.transferMessage, synced ? "送金を削除しました。" : "送金削除の共有反映に失敗しました。");
  }

  async function onHouseholdIncomeSubmit(event) {
    event.preventDefault();
    const wasEditing = Boolean(els.householdIncomeId.value);
    const amount = Number(els.householdIncomeAmount.value);
    if (!amount) {
      setText(els.householdIncomeMessage, "金額は0以外で入力してください。");
      return;
    }
    if (!els.householdIncomeSourceName.value.trim()) {
      setText(els.householdIncomeMessage, "入金元・内容を入力してください。");
      return;
    }

    // 当年以外の年で新規登録する際の警告確認
    if (!wasEditing && els.householdIncomeDate?.value) {
      const inputYear = els.householdIncomeDate.value.slice(0, 4);
      const cYear = window.KakeiboCore.currentYear();
      if (inputYear && inputYear !== cYear) {
        const confirmed = window.confirm(`登録する日付（${els.householdIncomeDate.value}）の年は当年（${cYear}年）ではありませんが、よろしいですか？`);
        if (!confirmed) {
          return;
        }
      }
    }

    const now = new Date().toISOString();
    const existing = state.householdIncomes.find((item) => item.id === els.householdIncomeId.value);
    const originalUpdatedAt = String(els.householdIncomeUpdatedAt?.value || existing?.updatedAt || "").trim();
    const record = normalizeHouseholdIncome({
      id: els.householdIncomeId.value || crypto.randomUUID(),
      date: els.householdIncomeDate.value,
      kind: els.householdIncomeKind.value,
      sourceName: els.householdIncomeSourceName.value.trim(),
      holder: els.householdIncomeHolder.value,
      amount,
      memo: els.householdIncomeMemo.value.trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: originalUpdatedAt || now,
      createdBy: existing?.createdBy || state.currentUser?.email || "",
      serialCode: existing?.serialCode || "",
    });
    const existingIndex = state.householdIncomes.findIndex((item) => item.id === record.id);
    setText(els.householdIncomeMessage, "家計への臨時入金を共有データへ反映中です...");
    let synced = true;
    if (canUseSharedStorage()) {
      showSyncToast("家計への臨時入金を共有データへ反映中です...", "pending", { sticky: true });
      const result = await saveSharedRecord("householdIncomes", record, {
        action: existingIndex >= 0 ? "update" : "create",
        expectedUpdatedAt: els.householdIncomeUpdatedAt?.value,
      });
      synced = result.ok;
      if (synced) {
        showSyncToast(existingIndex >= 0 ? "家計への臨時入金を共有データへ更新しました。" : "家計への臨時入金を共有データへ登録しました。", "success");
      } else {
        showSyncToast(existingIndex >= 0 ? "家計への臨時入金更新の共有反映に失敗しました。" : "家計への臨時入金登録の共有反映に失敗しました。", "error", { duration: 3200 });
      }
    } else if (existingIndex >= 0) {
      state.householdIncomes[existingIndex] = record;
      state.householdIncomes = sortRecordsByDateDesc(state.householdIncomes);
      persist({ skipRemote: true });
      showSyncToast("家計への臨時入金を更新しました。", "success");
    } else {
      state.householdIncomes.unshift(record);
      state.householdIncomes = sortRecordsByDateDesc(state.householdIncomes);
      persist({ skipRemote: true });
      showSyncToast("家計への臨時入金を登録しました。", "success");
    }
    renderHouseholdIncomeList();
    resetHouseholdIncomeForm(false);
    setText(
      els.householdIncomeMessage,
      synced ? (existingIndex >= 0 ? "家計への臨時入金を更新しました。" : "家計への臨時入金を登録しました。") : "家計への臨時入金の共有反映に失敗しました。"
    );
    if (wasEditing && state.editScrollContext) {
      restoreEditScrollContext();
    }
  }

  function resetHouseholdIncomeForm(clearEditContext = true) {
    els.householdIncomeForm?.reset();
    if (clearEditContext) state.editScrollContext = null;
    if (els.householdIncomeId) els.householdIncomeId.value = "";
    if (els.householdIncomeUpdatedAt) els.householdIncomeUpdatedAt.value = "";
    if (els.householdIncomeDate) els.householdIncomeDate.value = todayISO();
    if (els.householdIncomeKind) els.householdIncomeKind.value = "sale_profit";
    if (els.householdIncomeHolder) els.householdIncomeHolder.value = state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband";
    els.householdIncomeDeleteButton?.classList.add("hidden");
    setText(els.householdIncomeMessage, "");
  }

  function getFilteredHouseholdIncomes() {
    return filterRecordsByMonthRange(
      state.householdIncomes,
      els.householdIncomeFilterStartMonth?.value || "",
      els.householdIncomeFilterEndMonth?.value || ""
    );
  }

  function renderHouseholdIncomeList() {
    if (!els.householdIncomeList) return;
    const hasIncomeData = Array.isArray(state.householdIncomes) && state.householdIncomes.length > 0;
    if (canUseSharedStorage() && state.sharedStateLoading && !state.sharedStateLoaded && !hasIncomeData) {
      if (els.householdIncomeFilterSummary) {
        setText(els.householdIncomeFilterSummary, "家計への臨時入金を読み込み中です。");
      }
      els.householdIncomeList.innerHTML = '<div class="expense-card"><span class="muted">家計への臨時入金を読み込み中です...</span></div>';
      return;
    }
    if (canUseSharedStorage() && !state.sharedStateLoaded && !hasIncomeData) {
      if (els.householdIncomeFilterSummary) {
        setText(els.householdIncomeFilterSummary, "共有データの接続確認後に家計への臨時入金を表示します。");
      }
      els.householdIncomeList.innerHTML = '<div class="expense-card"><span class="muted">共有データの接続確認後に家計への臨時入金を表示します。</span></div>';
      return;
    }
    const items = getFilteredHouseholdIncomes();
    if (els.householdIncomeFilterSummary) {
      setText(
        els.householdIncomeFilterSummary,
        buildRangeSummaryText("家計への臨時入金", items.length, els.householdIncomeFilterStartMonth?.value, els.householdIncomeFilterEndMonth?.value)
      );
    }
    if (!items.length) {
      els.householdIncomeList.innerHTML = '<div class="expense-card"><span class="muted">まだ家計への臨時入金は登録されていません。</span></div>';
      return;
    }
    els.householdIncomeList.innerHTML = items.map((item) => `
      <article class="expense-card">
        <div class="expense-topline">
          <div>
            <div class="expense-store">${escapeHtml(item.sourceName || HOUSEHOLD_INCOME_KIND_LABELS[item.kind] || item.kind || "名称なし")}</div>
            <div class="expense-subline">${escapeHtml(item.serialCode || "未採番")} / ${escapeHtml(item.date)}</div>
          </div>
          <strong>${formatCurrency(item.amount)}</strong>
        </div>
        <div class="badge-row">
          <span class="badge">${escapeHtml(HOUSEHOLD_INCOME_KIND_LABELS[item.kind] || item.kind)}</span>
          <span class="badge">預かり: ${escapeHtml(PAYER_LABELS[item.holder] || item.holder)}</span>
        </div>
        <div class="expense-meta">
          <span class="muted small">${escapeHtml(item.memo || "メモなし")}</span>
          <div class="button-row">
            <button class="ghost-button" type="button" data-edit-household-income-id="${item.id}">編集</button>
          </div>
        </div>
      </article>
    `).join("");
    els.householdIncomeList.querySelectorAll("[data-edit-household-income-id]").forEach((button) => {
      button.addEventListener("click", () => loadHouseholdIncomeIntoForm(button.dataset.editHouseholdIncomeId));
    });
  }

  function loadHouseholdIncomeIntoForm(id) {
    const record = state.householdIncomes.find((item) => item.id === id);
    if (!record) return;
    rememberEditScrollContext("householdIncome", id);
    els.householdIncomeId.value = record.id;
    if (els.householdIncomeUpdatedAt) els.householdIncomeUpdatedAt.value = record.updatedAt || "";
    els.householdIncomeDate.value = record.date || todayISO();
    els.householdIncomeKind.value = record.kind || "sale_profit";
    els.householdIncomeSourceName.value = record.sourceName || "";
    els.householdIncomeHolder.value = record.holder || "husband";
    els.householdIncomeAmount.value = record.amount || "";
    els.householdIncomeMemo.value = record.memo || "";
    els.householdIncomeDeleteButton.classList.remove("hidden");
    setText(els.householdIncomeMessage, "既存の家計への臨時入金を読み込みました。修正後に保存してください。");
    scrollToElementTop(els.householdIncomeForm);
  }

  async function deleteCurrentHouseholdIncome() {
    const id = els.householdIncomeId.value;
    if (!id) return;
    setText(els.householdIncomeMessage, "家計への臨時入金削除を共有データへ反映中です...");
    let synced = true;
    if (canUseSharedStorage()) {
      showSyncToast("家計への臨時入金削除を共有データへ反映中です...", "pending", { sticky: true });
      const result = await deleteSharedRecord("householdIncomes", id, {
        expectedUpdatedAt: els.householdIncomeUpdatedAt?.value,
      });
      synced = result.ok;
      if (synced) {
        showSyncToast("家計への臨時入金を共有データから削除しました。", "success");
      } else {
        showSyncToast("家計への臨時入金削除の共有反映に失敗しました。", "error", { duration: 3200 });
      }
    } else {
      state.householdIncomes = state.householdIncomes.filter((item) => item.id !== id);
      persist({ skipRemote: true });
      showSyncToast("家計への臨時入金を削除しました。", "success");
    }
    renderHouseholdIncomeList();
    resetHouseholdIncomeForm();
    setText(els.householdIncomeMessage, synced ? "家計への臨時入金を削除しました。" : "家計への臨時入金削除の共有反映に失敗しました。");
  }

  async function onChildSubmit(event) {
    event.preventDefault();
    const wasEditing = Boolean(els.childTransactionId.value);
    const rawAmount = Number(els.childAmount.value);
    if (!rawAmount) {
      setText(els.childMessage, "金額は0以外で入力してください。");
      return;
    }
    // 支出種別の場合は残高から差し引くため変数を負にする
    const isExpense = els.childKind.value === "expense";
    const amount = isExpense ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    if (!els.childSourceOrFrom.value.trim()) {
      setText(els.childMessage, "相手・出どころ / 使途を入力してください。");
      return;
    }

    // 当年以外の年で新規登録する際の警告確認
    if (!wasEditing && els.childDate?.value) {
      const inputYear = els.childDate.value.slice(0, 4);
      const cYear = window.KakeiboCore.currentYear();
      if (inputYear && inputYear !== cYear) {
        const confirmed = window.confirm(`登録する日付（${els.childDate.value}）の年は当年（${cYear}年）ではありませんが、よろしいですか？`);
        if (!confirmed) {
          return;
        }
      }
    }

    const now = new Date().toISOString();
    const existing = state.childTransactions.find((item) => item.id === els.childTransactionId.value);
    const originalUpdatedAt = String(els.childUpdatedAt?.value || existing?.updatedAt || "").trim();
    const record = {
      id: els.childTransactionId.value || crypto.randomUUID(),
      date: els.childDate.value,
      kind: els.childKind.value,
      sourceOrFrom: els.childSourceOrFrom.value.trim(),
      holder: els.childHolder.value,
      amount,
      memo: els.childMemo.value.trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: originalUpdatedAt || now,
      createdBy: existing?.createdBy || state.currentUser?.email || "",
      serialCode: existing?.serialCode || "",
    };
    const existingIndex = state.childTransactions.findIndex((item) => item.id === record.id);
    setText(els.childMessage, "子供入出金を共有データへ反映中です...");
    let synced = true;
    if (canUseSharedStorage()) {
      showSyncToast("子供入出金を共有データへ反映中です...", "pending", { sticky: true });
      const result = await saveSharedRecord("childTransactions", record, {
        action: existingIndex >= 0 ? "update" : "create",
        expectedUpdatedAt: els.childUpdatedAt?.value,
      });
      synced = result.ok;
      if (synced) {
        showSyncToast(existingIndex >= 0 ? "子供入出金を共有データへ更新しました。" : "子供入出金を共有データへ登録しました。", "success");
      } else {
        showSyncToast(existingIndex >= 0 ? "子供入出金更新の共有反映に失敗しました。" : "子供入出金登録の共有反映に失敗しました。", "error", { duration: 3200 });
      }
    } else if (existingIndex >= 0) {
      state.childTransactions[existingIndex] = record;
      persist({ skipRemote: true });
      showSyncToast("子供入出金を更新しました。", "success");
    } else {
      state.childTransactions.unshift(record);
      persist({ skipRemote: true });
      showSyncToast("子供入出金を登録しました。", "success");
    }
    renderChildWalletTotal();
    renderChildTransactionList();
    resetChildForm(false);
    setText(els.childMessage, synced ? (existingIndex >= 0 ? "子供入出金を更新しました。" : "子供入出金を登録しました。") : "子供入出金の共有反映に失敗しました。");
    if (wasEditing && state.editScrollContext) {
      restoreEditScrollContext();
    }
  }

  function resetChildForm(clearEditContext = true) {
    els.childForm?.reset();
    if (clearEditContext) state.editScrollContext = null;
    if (els.childTransactionId) els.childTransactionId.value = "";
    if (els.childUpdatedAt) els.childUpdatedAt.value = "";
    if (els.childDate) els.childDate.value = todayISO();
    if (els.childKind) els.childKind.value = "gift";
    if (els.childHolder) els.childHolder.value = state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband";
    els.childDeleteButton?.classList.add("hidden");
    setText(els.childMessage, "");
  }

  function renderChildTransactionList() {
      if (!els.childTransactionList) return;
      const hasRinData = Array.isArray(state.childTransactions) && state.childTransactions.length > 0;
      if (canUseSharedStorage() && state.sharedStateLoading && !state.sharedStateLoaded && !hasRinData) {
        if (els.childFilterSummary) {
          setText(els.childFilterSummary, "子供口座の履歴を読み込み中です。");
        }
        els.childTransactionList.innerHTML = '<div class="expense-card"><span class="muted">子供口座の履歴を読み込み中です...</span></div>';
        return;
      }
      if (canUseSharedStorage() && !state.sharedStateLoaded && !hasRinData) {
        if (els.childFilterSummary) {
          setText(els.childFilterSummary, "共有データの接続確認後に子供口座履歴を表示します。");
        }
        els.childTransactionList.innerHTML = '<div class="expense-card"><span class="muted">共有データの接続確認後に子供口座履歴を表示します。</span></div>';
        return;
      }
      const items = [...getFilteredChildTransactions()].sort((a, b) => new Date(b.date) - new Date(a.date));
      if (els.childFilterSummary) {
        setText(els.childFilterSummary, buildRangeSummaryText("子供入出金", items.length, els.childFilterStartMonth?.value, els.childFilterEndMonth?.value));
      }
      if (!items.length) {
        els.childTransactionList.innerHTML = '<div class="expense-card"><span class="muted">まだ子供入出金が登録されていません。</span></div>';
        return;
    }
    const visibleItems = items.slice(0, state.childVisibleCount);
    els.childTransactionList.innerHTML = visibleItems.map((item) => `
      <article class="expense-card">
        <div class="expense-topline">
          <div>
            <div class="expense-store">${escapeHtml(CHILD_KIND_LABELS[item.kind] || item.kind)}</div>
            <div class="expense-subline">${escapeHtml(item.serialCode || "未採番")} / ${escapeHtml(item.date)}</div>
          </div>
          <strong class="${Number(item.amount) < 0 ? "expense-amount-negative" : ""}">${formatCurrency(item.amount)}</strong>
        </div>
        <div class="badge-row">
          <span class="badge">預かり者: ${escapeHtml(PAYER_LABELS[item.holder] || item.holder)}</span>
          <span class="badge">${escapeHtml(item.sourceOrFrom)}</span>
        </div>
        <div class="expense-meta">
          <span class="muted small">${escapeHtml(item.memo || "メモなし")}</span>
          <div class="button-row">
            <button class="ghost-button" type="button" data-edit-child-id="${item.id}">編集</button>
          </div>
        </div>
      </article>
    `).join("") + buildLoadMoreButtonHtml("childLoadMoreButton", state.childVisibleCount, items.length);
      els.childTransactionList.querySelectorAll("[data-edit-child-id]").forEach((button) => {
        button.addEventListener("click", () => loadChildIntoForm(button.dataset.editChildId));
      });
      els.childTransactionList.querySelector("#childLoadMoreButton")?.addEventListener("click", () => {
        state.childVisibleCount += COLLAPSED_LOAD_MORE_STEP;
        renderChildTransactionList();
      });
    }

  function renderChildWalletTotal() {
      if (!els.childWalletTotal) return;
      const hasRinData = Array.isArray(state.childTransactions) && state.childTransactions.length > 0;
      if (canUseSharedStorage() && state.sharedStateLoading && !state.sharedStateLoaded && !hasRinData) {
        els.childWalletTotal.textContent = "読込中";
        if (els.childWalletHolderSummary) {
          els.childWalletHolderSummary.textContent = "子供口座の残高を読み込み中です。";
        }
        return;
      }
      if (canUseSharedStorage() && !state.sharedStateLoaded && !hasRinData) {
        els.childWalletTotal.textContent = "--";
        if (els.childWalletHolderSummary) {
          els.childWalletHolderSummary.textContent = "共有データの接続確認後に子供口座残高を表示します。";
        }
        return;
      }
      const total = state.childTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const byHolder = state.childTransactions.reduce((summary, item) => {
        const holder = item?.holder === "wife" ? "wife" : "husband";
        summary[holder] += Number(item.amount || 0);
        return summary;
      }, { husband: 0, wife: 0 });
      els.childWalletTotal.textContent = formatCurrency(total);
      if (els.childWalletHolderSummary) {
        els.childWalletHolderSummary.textContent = `夫預かり ${formatCurrency(byHolder.husband)} / 妻預かり ${formatCurrency(byHolder.wife)}`;
      }
    }

  function loadChildIntoForm(id) {
    const record = state.childTransactions.find((item) => item.id === id);
    if (!record) return;
    rememberEditScrollContext("child", id);
    els.childTransactionId.value = record.id;
    if (els.childUpdatedAt) els.childUpdatedAt.value = record.updatedAt || "";
    els.childDate.value = record.date || todayISO();
    els.childKind.value = record.kind || "gift";
    els.childSourceOrFrom.value = record.sourceOrFrom || "";
    els.childHolder.value = record.holder || "husband";
    els.childAmount.value = record.amount || "";
    els.childMemo.value = record.memo || "";
    els.childDeleteButton.classList.remove("hidden");
    setText(els.childMessage, "既存の子供入出金を読み込みました。修正後に保存してください。");
    scrollToElementTop(els.childForm);
  }

  async function deleteCurrentChildTransaction() {
    const id = els.childTransactionId.value;
    if (!id) return;
    setText(els.childMessage, "子供入出金削除を共有データへ反映中です...");
    let synced = true;
    if (canUseSharedStorage()) {
      showSyncToast("子供入出金削除を共有データへ反映中です...", "pending", { sticky: true });
      const result = await deleteSharedRecord("childTransactions", id, {
        expectedUpdatedAt: els.childUpdatedAt?.value,
      });
      synced = result.ok;
      if (synced) {
        showSyncToast("子供入出金を共有データから削除しました。", "success");
      } else {
        showSyncToast("子供入出金削除の共有反映に失敗しました。", "error", { duration: 3200 });
      }
    } else {
      state.childTransactions = state.childTransactions.filter((item) => item.id !== id);
      persist({ skipRemote: true });
      showSyncToast("子供入出金を削除しました。", "success");
    }
    renderChildWalletTotal();
    renderChildTransactionList();
    resetChildForm();
    setText(els.childMessage, synced ? "子供入出金を削除しました。" : "子供入出金削除の共有反映に失敗しました。");
  }

  async function onImportFileSelected(event) {
    const file = event.target.files?.[0];
    state.pendingImportData = null;
    if (!file) {
      setText(els.importPreviewSummary, "ファイルを選ぶと件数を表示します。");
      setText(els.importMessage, "");
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const expenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];
      const transfers = Array.isArray(parsed.transfers) ? parsed.transfers : [];
      const childTransactions = Array.isArray(parsed.childTransactions) ? parsed.childTransactions : [];
      const householdIncomes = Array.isArray(parsed.householdIncomes) ? parsed.householdIncomes : [];
      state.pendingImportData = { expenses, transfers, childTransactions, householdIncomes };
      setText(
        els.importPreviewSummary,
        `支出 ${expenses.length}件 / 送金 ${transfers.length}件 / 子供入出金 ${childTransactions.length}件 / 家計臨時入金 ${householdIncomes.length}件 を追加取り込みします。`
      );
      setText(els.importMessage, "");
    } catch (error) {
      console.error(error);
      state.pendingImportData = null;
      setText(els.importPreviewSummary, "JSON の読み取りに失敗しました。");
      setMessageState(els.importMessage, `JSONの解析に失敗しました: ${error.message || error}`, "error");
    }
  }

  async function importPendingJsonData() {
    if (!state.pendingImportData) {
      setMessageState(els.importMessage, "先に取込用JSONファイルを選択してください。", "warning");
      return;
    }

    const importCategories = [];
    const importedExpenses = state.pendingImportData.expenses.map((item) => {
      const normalized = normalizeImportedExpense(item);
      if (normalized.category && !importCategories.includes(normalized.category)) {
        importCategories.push(normalized.category);
      }
      return normalized;
    });
    const importedTransfers = state.pendingImportData.transfers.map(normalizeImportedTransfer);
    const importedChildTransactions = state.pendingImportData.childTransactions.map(normalizeImportedChildTransaction);
    const importedHouseholdIncomes = (state.pendingImportData.householdIncomes || []).map(normalizeImportedHouseholdIncome);

    state.expenses = [...importedExpenses.reverse(), ...state.expenses];
    state.transfers = [...importedTransfers.reverse(), ...state.transfers];
    state.childTransactions = [...importedChildTransactions.reverse(), ...state.childTransactions];
    state.householdIncomes = sortRecordsByDateDesc([...importedHouseholdIncomes.reverse(), ...state.householdIncomes]);
    state.categories = mergeCategories([...state.categories, ...importCategories]);

    persist({ skipRemote: true });
    let sharedSynced = true;
    if (canUseSharedStorage()) {
      setMessageState(els.importMessage, "共有データへ追加取り込みを反映しています...", "pending");
      sharedSynced = await syncSharedStateToBackend("json-import", { force: true });
    }
    renderSelectOptions();
    renderAll();

    const importedCount = importedExpenses.length + importedTransfers.length + importedChildTransactions.length + importedHouseholdIncomes.length;
    setMessageState(
      els.importMessage,
      sharedSynced
        ? `${importedCount}件を追加取り込みしました（支出 ${importedExpenses.length} / 送金 ${importedTransfers.length} / 子供入出金 ${importedChildTransactions.length} / 家計臨時入金 ${importedHouseholdIncomes.length}）。`
        : `${importedCount}件をローカルへ取り込みましたが、共有データへの反映に失敗しました。`,
      sharedSynced ? "success" : "error"
    );
    state.pendingImportData = null;
    if (els.importJsonFile) els.importJsonFile.value = "";
    setText(els.importPreviewSummary, "ファイルを選ぶと件数を表示します。");
  }

  function normalizeImportedExpense(item) {
    const now = new Date().toISOString();
    const normalized = normalizeExpense({
      ...item,
      id: crypto.randomUUID(),
      serialCode: String(item?.serialCode || "").trim(),
      date: item?.date || todayISO(),
      storeName: item?.storeName || "不明",
      category: String(item?.category || "不明").trim() || "不明",
      payer: item?.payer || "husband",
      paymentMethod: item?.paymentMethod || "husband_other",
        otherPaymentMethod: item?.otherPaymentMethod || "",
      memo: item?.memo || item?.sourceMessage || "",
      personalExpense: item?.personalExpense || "family",
      createdBy: item?.createdBy || state.currentUser?.email || "import",
      createdAt: item?.createdAt || now,
      updatedAt: item?.updatedAt || now,
      grossAmount: item?.grossAmount ?? item?.amount ?? 0,
      pointCredit: item?.pointCredit ?? 0,
      receiptUrl: item?.receiptUrl || "",
      receiptFileId: item?.receiptFileId || "",
      receiptDriveUrl: item?.receiptDriveUrl || (isDriveReceiptUrl(item?.receiptUrl) ? item?.receiptUrl : ""),
      receiptDriveFileId: item?.receiptDriveFileId || (item?.receiptFileId && !isGcsReceiptFileId(item?.receiptFileId) ? item?.receiptFileId : ""),
      receiptUploadedAt: item?.receiptUploadedAt || "",
      receiptUploadStatus: item?.receiptUploadStatus || "",
      receiptUploaderName: item?.receiptUploaderName || "",
      receiptStorageAssetId: item?.receiptStorageAssetId || "",
      receiptStorageUploadedAt: item?.receiptStorageUploadedAt || "",
      receiptStorageStatus: item?.receiptStorageStatus || "",
      receiptGroupId: item?.receiptGroupId || "",
      receiptLineIndex: item?.receiptLineIndex || "",
      receiptLineCount: item?.receiptLineCount || "",
      receiptTotalAmount: item?.receiptTotalAmount || "",
    });
    return normalized;
  }

  function normalizeImportedTransfer(item) {
    const now = new Date().toISOString();
    return normalizeTransfer({
      ...item,
      id: crypto.randomUUID(),
      serialCode: String(item?.serialCode || "").trim(),
      createdBy: item?.createdBy || state.currentUser?.email || "import",
      createdAt: item?.createdAt || now,
      updatedAt: item?.updatedAt || now,
    });
  }

  function normalizeImportedChildTransaction(item) {
    const now = new Date().toISOString();
    return normalizeChildTransaction({
      ...item,
      id: crypto.randomUUID(),
      serialCode: String(item?.serialCode || "").trim(),
      createdBy: item?.createdBy || state.currentUser?.email || "import",
      createdAt: item?.createdAt || now,
      updatedAt: item?.updatedAt || now,
    });
  }

  function normalizeImportedHouseholdIncome(item) {
    const now = new Date().toISOString();
    return normalizeHouseholdIncome({
      ...item,
      id: crypto.randomUUID(),
      serialCode: String(item?.serialCode || "").trim(),
      createdBy: item?.createdBy || state.currentUser?.email || "import",
      createdAt: item?.createdAt || now,
      updatedAt: item?.updatedAt || now,
    });
  }

  function renderAll() {
    const tasks = [
      { name: "syncAuthUI", fn: syncAuthUI },
      { name: "ensureSerialCodes", fn: ensureSerialCodes },
      { name: "renderHero", fn: renderHero },
      { name: "renderAnnualPaceCard", fn: renderAnnualPaceCard },
      { name: "renderRecentMonthsSummary", fn: renderRecentMonthsSummary },
      { name: "renderExpenseList", fn: renderExpenseList },
      { name: "renderTransferList", fn: renderTransferList },
      { name: "renderHouseholdIncomeList", fn: renderHouseholdIncomeList },
      { name: "renderChildWalletTotal", fn: renderChildWalletTotal },
      { name: "renderChildTransactionList", fn: renderChildTransactionList },
      { name: "renderSummary", fn: renderSummary },
      { name: "renderSearchResults", fn: renderSearchResults },
      { name: "renderReceiptLinkedInfo", fn: renderReceiptLinkedInfo },
      { name: "renderPendingReceiptUploadQueue", fn: renderPendingReceiptUploadQueue },
      { name: "renderReceiptFlowStatus", fn: renderReceiptFlowStatus },
      { name: "renderSettingsTabContent", fn: renderSettingsTabContent }
    ];

    for (const task of tasks) {
      try {
        task.fn();
      } catch (error) {
        console.error(`[renderAll] Failed to run ${task.name}:`, error);
      }
    }
  }

  function getHouseholdIncomeTotalForYear(year) {
    return sumAmounts(
      (Array.isArray(state.householdIncomes) ? state.householdIncomes : []).filter((item) => String(item?.date || "").startsWith(String(year || "")))
    );
  }

  function getAnnualHouseholdCapacity(year) {
    const rules = normalizeSettlementRules(state.settlementRules);
    const monthlyContributionTotal = Number(rules.monthlyContribution?.husband || 0) + Number(rules.monthlyContribution?.wife || 0);
    const bonusContributionTotal = ["husband", "wife"].reduce((personSum, person) => {
      const bonusMap = rules.bonusContribution?.[person] || {};
      return personSum + Object.values(bonusMap).reduce((sum, value) => sum + Number(value || 0), 0);
    }, 0);
    const temporaryIncomeTotal = getHouseholdIncomeTotalForYear(year);
    return {
      monthlyContributionTotal,
      bonusContributionTotal,
      temporaryIncomeTotal,
      annualBaseTotal: monthlyContributionTotal * 12 + bonusContributionTotal,
      annualTotal: monthlyContributionTotal * 12 + bonusContributionTotal + temporaryIncomeTotal,
    };
  }

  function renderAnnualPaceCard() {
    if (!els.annualPaceCard) return;
    const targetYear = currentYear();
    const annualProgress = getAnnualProgressInfo(targetYear);
    const capacity = getAnnualHouseholdCapacity(targetYear);
    const budgetConfig = getDashboardBudgetConfig();
    const majorGroupKeys = DASHBOARD_ANNUAL_MONTHLY_FOCUS_GROUP_KEYS.slice();
    const majorAnnualBudget = majorGroupKeys.reduce((sum, key) => {
      return sum + getDashboardBudgetGroupValue(budgetConfig, "monthly", key) * 12;
    }, 0);
    const overviewYear = String(state.expenseOverview?.currentYear || "");
    const hasOverviewActual = overviewYear === targetYear && Number.isFinite(Number(state.expenseOverview?.yearlyTotal));
    const loading = !state.expensesLoaded && !hasOverviewActual;
    const annualActual = state.expensesLoaded
      ? sumAmounts(state.expenses.filter((item) => isFamilySummaryExpense(item) && String(item?.date || "").startsWith(targetYear)))
      : hasOverviewActual
        ? Number(state.expenseOverview.yearlyTotal || 0)
        : 0;
    const majorAnnualActual = state.expensesLoaded
      ? (() => {
          const actuals = buildDashboardGroupActuals(getDashboardExpenses().filter((item) => String(item?.date || "").startsWith(targetYear)));
          return majorGroupKeys.reduce((sum, key) => sum + Number(actuals[key] || 0), 0);
        })()
      : 0;
    const expectedToDate = capacity.annualTotal * Number(annualProgress.elapsedRatio || 0);
    const paceRate = expectedToDate > 0 ? annualActual / expectedToDate : 0;
    const width = loading ? 0 : Math.min(Math.max(paceRate * 100, 0), 140);
    const delta = annualActual - expectedToDate;
    const tone = loading ? "good" : delta <= 0 ? "good" : delta <= Math.max(expectedToDate * 0.1, 30000) ? "warning" : "danger";
    const majorExpectedToDate = majorAnnualBudget * Number(annualProgress.elapsedRatio || 0);
    const majorDailyRate = majorExpectedToDate > 0 ? majorAnnualActual / majorExpectedToDate : 0;
    const majorLoading = !state.expensesLoaded;
    const majorAssessment = majorLoading
      ? { tone: "idle", label: "集計待ち" }
      : getDashboardAnnualExecutionAssessment(majorAnnualActual, majorAnnualBudget, annualProgress);
    if (els.annualPaceTitle) {
      els.annualPaceTitle.textContent = `${targetYear}年 家計簿チェック`;
    }
    if (els.annualPaceFormula) {
      const incomeText = capacity.temporaryIncomeTotal ? ` / 臨時入金 ${formatCurrency(capacity.temporaryIncomeTotal)}` : "";
      els.annualPaceFormula.textContent = `年間 ${formatCurrency(capacity.annualBaseTotal)} の予算の日割りに対する使用率${incomeText} (未来日付は含みません)`;
    }
    if (els.annualPaceExpected) els.annualPaceExpected.textContent = loading ? "読込中" : formatCurrency(expectedToDate);
    if (els.annualPaceActual) els.annualPaceActual.textContent = loading ? "読込中" : formatCurrency(annualActual);
    if (els.annualPaceDelta) els.annualPaceDelta.textContent = loading ? "読込中" : formatCurrency(Math.abs(delta));
    if (els.annualPaceDeltaStatus) {
      els.annualPaceDeltaStatus.textContent = loading ? "確認中" : delta <= 0 ? "残り" : "超過";
      els.annualPaceDeltaStatus.className = `annual-pace-delta-status ${loading ? "status-idle" : delta <= 0 ? "status-good" : "status-danger"}`;
    }
    if (els.annualPaceBar) {
      els.annualPaceBar.className = `tone-${tone}`;
      els.annualPaceBar.style.width = `${width}%`;
    }
    if (els.annualPaceMajorTotal) {
      els.annualPaceMajorTotal.textContent = majorLoading ? "読込中" : formatCurrency(majorAnnualActual);
    }
    if (els.annualPaceMajorMeta) {
      els.annualPaceMajorMeta.textContent = majorLoading
        ? "主要項目の年間ペースを確認します"
        : `今日時点の目安 ${formatCurrency(majorExpectedToDate)} / 使用率 ${Math.round(majorDailyRate * 100)}% / ${getDashboardDeltaText(majorAnnualActual - majorExpectedToDate)} (未来日付は含みません)`;
    }
    if (els.annualPaceMajorBar) {
      els.annualPaceMajorBar.className = `tone-${majorAssessment.tone}`;
      els.annualPaceMajorBar.style.width = `${majorLoading ? 0 : Math.min(Math.max(majorDailyRate * 100, 0), 140)}%`;
    }
    if (els.annualPaceMajorStatus) {
      els.annualPaceMajorStatus.className = `status-pill status-${majorAssessment.tone}`;
      els.annualPaceMajorStatus.textContent = majorAssessment.label;
    }
    if (els.annualPaceMeta) {
      els.annualPaceMeta.textContent = loading
        ? "共有データの読込後に、今年の使用ペースを表示します。"
        : `${annualProgress.elapsedDays}/${annualProgress.totalDays}日経過 / 使用率 ${Math.round(paceRate * 100)}% (年初から今日までの経過日数基準)`;
    }
  }

  async function reloadLatestSharedData(options = {}) {
    if (!canUseSharedStorage()) {
      showSyncToast("先に Google ログインしてください。", "error", { duration: 2600 });
      return false;
    }
    const button = els.reloadLatestDataButton;
    const previousLabel = button?.textContent || "最新読込";
    if (button) {
      button.disabled = true;
      button.textContent = "更新中...";
    }
    if (options.interactive) {
      showSyncToast("最新データを読み込み中です...", "pending", { duration: 2200 });
    }
    try {
      const [sharedLoaded, overviewLoaded, expensesLoaded] = await Promise.all([
        loadSharedStateFromBackend({ silent: true }),
        loadExpenseOverviewFromBackend({ silent: true }),
        ensureAllExpensesLoaded({ silent: true, forceRefresh: true }),
      ]);
      if (expensesLoaded) {
        state.expenseListItems = [...state.expenses].sort(compareExpensesForDisplay);
        state.expenseListCursor = "";
        state.expenseListHasMore = false;
      }
      renderAll();
      const succeeded = Boolean(sharedLoaded || overviewLoaded || expensesLoaded);
      if (succeeded) {
        setSharedBootstrapError("");
      }
      if (options.interactive) {
        showSyncToast(
          succeeded ? "最新データへ更新しました。" : "最新データの再読み込みに失敗しました。",
          succeeded ? "success" : "error",
          { duration: succeeded ? 2200 : 3200 },
        );
      }
      return succeeded;
    } catch (error) {
      console.error("reloadLatestSharedData failed", error);
      if (options.interactive) {
        showSyncToast("最新データの再読み込みに失敗しました。", "error", { duration: 3200 });
      }
      return false;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = previousLabel;
      }
    }
  }

  function ensureSummaryPeriodDefaults() {
    const defaultMonth = String(state.expenseOverview?.currentMonth || currentMonth()).trim() || currentMonth();
    const defaultYear = String(defaultMonth.slice(0, 4) || state.expenseOverview?.currentYear || currentYear()).trim() || currentYear();
    const timelineYears = collectTimelineYears();
    applySummaryMonthBounds(timelineYears);
    if (els.summaryMonth && String(els.summaryMonth.value || "").trim()) {
      const selectedYear = String(els.summaryMonth.value || "").slice(0, 4);
      if (!timelineYears.includes(selectedYear)) {
        els.summaryMonth.value = defaultMonth;
      }
    }
    if (els.summaryMonth && !String(els.summaryMonth.value || "").trim()) {
      els.summaryMonth.value = defaultMonth;
    }
    if (els.summaryYear && !String(els.summaryYear.value || "").trim()) {
      els.summaryYear.value = defaultYear;
    }
    if (els.summarySettlementYear && !String(els.summarySettlementYear.value || "").trim()) {
      els.summarySettlementYear.value = defaultYear;
    }
  }

  function renderHero() {
    ensureSummaryPeriodDefaults();
    renderSummaryYearOptions();
    renderSettlementYearOptions();
    ensureSummaryPeriodDefaults();
  }

  function handleSummaryMonthChange() {
    renderSummaryYearOptions();
    if (els.summaryYear && els.summaryMonth?.value) {
      els.summaryYear.value = els.summaryMonth.value.slice(0, 4);
    }
    renderSummary();
  }

  function renderSettlementYearOptions() {
    if (!els.summarySettlementYear) return;
    const current = els.summarySettlementYear.value;
    const years = collectTimelineYears();
    els.summarySettlementYear.innerHTML = years
      .map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}年</option>`)
      .join("");
    if (current && years.includes(current)) {
      els.summarySettlementYear.value = current;
    } else if (years.includes(currentYear())) {
      els.summarySettlementYear.value = currentYear();
    } else if (years.length) {
      els.summarySettlementYear.value = years[0];
    }
  }

  function getDaysInMonth(monthKey) {
    const value = String(monthKey || "");
    const [year, month] = value.split("-").map((item) => Number(item));
    if (!year || !month) return 30;
    return new Date(year, month, 0).getDate();
  }

  function getDashboardExpenses() {
    return Array.isArray(state.expenses) ? state.expenses.filter(isFamilyDashboardExpense) : [];
  }

  function buildProjectedAmount(actual, elapsedDays, totalDays) {
    if (!totalDays) return actual;
    return Math.round((Number(actual || 0) / Math.max(1, elapsedDays)) * totalDays);
  }

  function getOverallDashboardAssessment(projectedRatio, projectedOverAmount) {
    if (projectedRatio > 1.2 && projectedOverAmount >= 15000) {
      return { tone: "critical", label: "対応必要" };
    }
    if (projectedRatio > 1.15 || projectedOverAmount >= 10000) {
      return { tone: "review", label: "見直し推奨" };
    }
    if (projectedRatio > 1.08 || projectedOverAmount >= 5000) {
      return { tone: "watch", label: "要観察" };
    }
    if (projectedRatio > 1.03 || projectedOverAmount > 0) {
      return { tone: "warning", label: "注意" };
    }
    return { tone: "good", label: "順調" };
  }

  function getCategoryDashboardAssessment(projectedRatio, projectedOverAmount) {
    if (projectedRatio > 1.1 || projectedOverAmount >= 3000) {
      return { tone: "danger", label: "超過" };
    }
    if (projectedRatio > 1 || projectedOverAmount > 0) {
      return { tone: "warning", label: "注意" };
    }
    return { tone: "good", label: "順調" };
  }

  function getDashboardDeltaText(deltaAmount) {
    if (deltaAmount > 0) return `+${formatCurrency(deltaAmount)}`;
    if (deltaAmount < 0) return `残り ${formatCurrency(Math.abs(deltaAmount))}`;
    return "±0円";
  }

  function buildStatusPillHtml(tone, label) {
    return `<span class="status-pill status-${escapeHtml(tone || "idle")}">${escapeHtml(label || "集計待ち")}</span>`;
  }

  function getDashboardBudgetGroupValue(configValue, kind, key) {
    const source = kind === "annual" ? configValue.annualBudgetGroups : configValue.monthlyBudgetGroups;
    return Number(source?.[key] || 0);
  }

  function isLeapYear(year) {
    const numericYear = Number(year);
    if (!Number.isFinite(numericYear)) return false;
    if (numericYear % 400 === 0) return true;
    if (numericYear % 100 === 0) return false;
    return numericYear % 4 === 0;
  }

  function getAnnualProgressInfo(targetYear) {
    const year = Number(targetYear);
    const today = todayISO();
    const current = Number(today.slice(0, 4));
    const totalDays = isLeapYear(year) ? 366 : 365;
    if (year < current) return { elapsedDays: totalDays, totalDays, elapsedRatio: 1 };
    if (year > current) return { elapsedDays: 0, totalDays, elapsedRatio: 0 };
    const dayOfYear = Math.floor((Date.parse(today) - Date.parse(`${targetYear}-01-01`)) / 86400000) + 1;
    const elapsedDays = Math.max(1, Math.min(dayOfYear, totalDays));
    return { elapsedDays, totalDays, elapsedRatio: elapsedDays / totalDays };
  }

  function getAnnualBudgetProgressMetrics(actualYtd, annualBudgetTotal, annualProgress) {
    const elapsedDays = Math.max(1, Number(annualProgress?.elapsedDays || 0));
    const totalDays = Math.max(1, Number(annualProgress?.totalDays || 0));
    const elapsedRatio = Number(annualProgress?.elapsedRatio || 0);
    const annualIdealToDate = annualBudgetTotal * elapsedRatio;
    const annualForecast = Math.round((Number(actualYtd || 0) / elapsedDays) * totalDays);
    const actualToIdealRatio = annualIdealToDate > 0 ? Number(actualYtd || 0) / annualIdealToDate : 0;
    const forecastToBudgetRatio = annualBudgetTotal > 0 ? annualForecast / annualBudgetTotal : 0;
    return {
      annualIdealToDate,
      annualForecast,
      actualToIdealRatio,
      forecastToBudgetRatio,
      comparisonRatio: Math.max(actualToIdealRatio, forecastToBudgetRatio),
      overAmount: Math.max(Number(actualYtd || 0) - annualIdealToDate, 0),
    };
  }

  function getDashboardUnassignedRecommendation(issue) {
    const rawCategory = String(issue?.rawCategory || "").trim();
    const categoryLabel = String(issue?.categoryLabel || "").trim();
    const issueType = String(issue?.issueType || "").trim();
    if (!rawCategory) {
      return "カテゴリを入力して保存してください。";
    }
    if (rawCategory === "その他" || rawCategory === "other") {
      return "中身を見て再分類してください。必要なら検索タブで複数候補を確認してください。";
    }
    if (
      rawCategory === "車整備"
      || rawCategory === "車保険"
      || rawCategory === "自動車税"
      || issue?.categoryCode === "car_maintenance"
      || issue?.categoryCode === "car_insurance"
      || issue?.categoryCode === "car_tax"
    ) {
      return "車両維持費へ統合してください。旧カテゴリのまま残っている明細は検索タブで確認してください。";
    }
    if (rawCategory === "子供日常費" || rawCategory === "child_child_daily") {
      return "日用品へ統合してください（daily_goods）。";
    }
    if (rawCategory === "child_child_special") {
      return "育児特別費として扱う内容かを確認してください。";
    }
    if (rawCategory === "fixed_cost" || rawCategory === "hobby") {
      return "旧カテゴリです。検索タブで中身を確認し、現在のカテゴリへ寄せてください。";
    }
    if (issueType === "カテゴリ未定義") {
      return "既存カテゴリへ置き換えるか、カテゴリマスターを見直してください。";
    }
    if (issueType === "表示解決失敗") {
      return "カテゴリ名またはコード表記を見直してください。";
    }
    if (issueType === "予算グループ未接続") {
      return categoryLabel
        ? `categoryMasterConfig で ${categoryLabel} の budgetGroupKey を設定してください。`
        : "categoryMasterConfig で budgetGroupKey を設定してください。";
    }
    return "検索タブで対象レコードを確認し、必要なら設定でカテゴリ構成を見直してください。";
  }

  function getDashboardUnassignedIssueRows(yearlyItems, monthlyGroupKeys, annualGroupKeys, excludedAnnualGroupKeys) {
    const grouped = new Map();
    const connectedKeys = new Set([
      ...monthlyGroupKeys,
      ...annualGroupKeys,
      ...Array.from(excludedAnnualGroupKeys || []),
    ]);
    yearlyItems.forEach((item) => {
      const rawCategory = String(item?.category || "").trim();
      const normalizedLabel = rawCategory ? normalizeCategoryLabel(rawCategory) : "";
      const normalizedCode = rawCategory ? normalizeCategoryCode(rawCategory, rawCategory) : "";
      const meta = rawCategory
        ? (
            getCategoryMetaByLabel(rawCategory)
            || getCategoryMetaByLabel(normalizedLabel)
            || getCategoryMetaByCode(rawCategory)
            || getCategoryMetaByCode(normalizedCode)
          )
        : null;
      const categoryCode = meta?.code || normalizedCode || "";
      const categoryLabel = meta?.label || getDashboardCategoryLabelByCode(categoryCode) || normalizedLabel || rawCategory || "未設定";
      const budgetGroupKey = String(meta?.budgetGroupKey || "").trim();
      const isConnected = Boolean(budgetGroupKey && connectedKeys.has(budgetGroupKey));
      const issueTypes = [];
      if (!rawCategory) {
        issueTypes.push("カテゴリ空欄");
      }
      if (rawCategory && !meta) {
        issueTypes.push("カテゴリ未定義");
      }
      if (meta && !budgetGroupKey) {
        issueTypes.push("予算グループ未接続");
      }
      if (!categoryLabel || (!meta && !normalizedLabel)) {
        issueTypes.push("表示解決失敗");
      }
      if (rawCategory === "fixed_cost" || rawCategory === "hobby" || rawCategory === "other") {
        issueTypes.push("legacyカテゴリ");
      }
      if (isConnected) return;
      const issueType = issueTypes[0] || "予算グループ未接続";
      const key = `${issueType}__${categoryLabel}__${rawCategory || "__empty__"}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          issueType,
          categoryLabel,
          rawCategory: rawCategory || "未設定",
          categoryCode,
          budgetGroupKey,
          count: 0,
          amount: 0,
          recommendation: "",
          note: "",
        });
      }
      const row = grouped.get(key);
      row.count += 1;
      row.amount += getDashboardExpenseAmount(item);
      row.recommendation = getDashboardUnassignedRecommendation({
        rawCategory,
        categoryLabel,
        categoryCode,
        issueType,
      });
      if (!row.note) {
        if (issueType === "カテゴリ空欄") {
          row.note = "保存時にカテゴリを選び忘れている可能性があります。";
        } else if (issueType === "カテゴリ未定義") {
          row.note = "検索タブで対象レコードを確認し、既存カテゴリへ寄せると整合しやすくなります。";
        } else if (issueType === "予算グループ未接続") {
          row.note = budgetGroupKey
            ? `予算グループ ${budgetGroupKey} は未接続です。`
            : "予算グループが未設定です。";
        } else if (issueType === "legacyカテゴリ") {
          row.note = "旧カテゴリを残したままなので、検索タブで中身を確認して整理してください。";
        } else if (issueType === "表示解決失敗") {
          row.note = "表示名とコードの変換に失敗しています。";
        }
      }
    });
    return Array.from(grouped.values())
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0) || Number(b.count || 0) - Number(a.count || 0) || String(a.categoryLabel || "").localeCompare(String(b.categoryLabel || "")));
  }

  function renderDashboardUnassignedWarning({ issues = [], totalAmount = 0, targetYear = "" } = {}) {
    if (!els.dashboardUnassignedWarning) return;
    const issueCount = issues.length;
    const summaryText = issueCount
      ? `${issueCount}カテゴリ / 合計 ${formatCurrency(totalAmount)}`
      : "対象カテゴリはありません";
    const impactText = issueCount
      ? "この金額は予算進捗に未反映です。下の候補を確認し、検索タブで対象データを見直してください。"
      : "対象年の family 支出は、月予算・年次予算・別枠グループのいずれかに割り当てられています。";
    if (els.dashboardUnassignedTitle) {
      els.dashboardUnassignedTitle.textContent = issueCount
        ? "予算グループに未接続のカテゴリがあります"
        : "未割当カテゴリはありません";
    }
    if (els.dashboardUnassignedSummary) {
      els.dashboardUnassignedSummary.textContent = summaryText;
    }
    if (els.dashboardUnassignedMessage) {
      els.dashboardUnassignedMessage.textContent = impactText;
    }
    if (els.dashboardUnassignedWarning) {
      els.dashboardUnassignedWarning.classList.toggle("warning", issueCount > 0);
    }
    if (els.dashboardUnassignedDetails) {
      els.dashboardUnassignedDetails.classList.toggle("warning", issueCount > 0);
    }
    if (els.dashboardUnassignedList) {
      if (!issueCount) {
        els.dashboardUnassignedList.innerHTML = '<div class="dashboard-unassigned-empty"><span class="muted small">未割当カテゴリは見つかりませんでした。</span></div>';
      } else {
        els.dashboardUnassignedList.innerHTML = issues.map((item) => {
          const badgeText = item.issueType || "要確認";
          const searchCategory = item.categoryLabel || item.rawCategory || "";
          return `
            <article class="dashboard-unassigned-card">
              <div class="dashboard-unassigned-card-head">
                <div>
                  <strong>${escapeHtml(item.categoryLabel || item.rawCategory || "未設定")}</strong>
                  <p class="muted small">${escapeHtml(item.issueType || "要確認")} / ${escapeHtml(item.rawCategory || "未設定")}</p>
                </div>
                <span class="status-pill status-warning">${escapeHtml(badgeText)}</span>
              </div>
              <div class="dashboard-unassigned-meta">
                <span class="badge">件数 ${escapeHtml(String(item.count || 0))}</span>
                <span class="badge">合計 ${escapeHtml(formatCurrency(item.amount || 0))}</span>
                ${item.budgetGroupKey ? `<span class="badge">group ${escapeHtml(item.budgetGroupKey)}</span>` : ""}
              </div>
              <p class="dashboard-unassigned-recommendation">${escapeHtml(item.recommendation || "検索タブで対象レコードを確認してください。")}</p>
              ${item.note ? `<p class="muted small">${escapeHtml(item.note)}</p>` : ""}
              <div class="button-row wrap">
                <button class="ghost-button compact" type="button" data-unassigned-search-category="${escapeHtml(searchCategory)}">検索タブで確認</button>
              </div>
            </article>
          `;
        }).join("");
        els.dashboardUnassignedList.querySelectorAll("[data-unassigned-search-category]").forEach((button) => {
          button.addEventListener("click", () => {
            const categoryLabel = String(button.dataset.unassignedSearchCategory || "").trim();
            openSearchTabForCategory(categoryLabel, { focusScan: !categoryLabel || categoryLabel === "未設定" });
          });
        });
      }
    }
    if (els.dashboardUnassignedActions) {
      els.dashboardUnassignedActions.classList.toggle("hidden", !issueCount);
    }
    if (els.dashboardUnassignedSearchButton) {
      els.dashboardUnassignedSearchButton.disabled = !issueCount;
    }
    if (els.dashboardUnassignedSettingsButton) {
      els.dashboardUnassignedSettingsButton.disabled = !issueCount;
    }
  }

  function getStoredLastSeenAppVersion() {
    try {
      return String(localStorage.getItem(LAST_SEEN_APP_VERSION_KEY) || "").trim();
    } catch (error) {
      return "";
    }
  }

  function setStoredLastSeenAppVersion(version) {
    try {
      localStorage.setItem(LAST_SEEN_APP_VERSION_KEY, String(version || "").trim());
      return true;
    } catch (error) {
      console.warn("setStoredLastSeenAppVersion failed", error);
      return false;
    }
  }

  function openSearchTabForCategory(categoryLabel = "", options = {}) {
    const targetCategory = String(categoryLabel || "").trim();
    if (els.filterCategory) {
      els.filterCategory.value = targetCategory;
    }
    switchTab("search");
    handleSearchFilterInput();
    window.setTimeout(() => {
      if (options.focusScan) {
        document.getElementById("categoryIntegrityScanSummary")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      document.getElementById("searchResultInfo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);
  }

  function openSettingsTabForUpdateHistory() {
    switchTab("settings");
    window.setTimeout(() => {
      document.getElementById("updateHistoryList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);
  }

  async function maybeNotifyAppVersionUpdate() {
    const currentVersion = String(config.app?.version || "").trim();
    if (!currentVersion || !canUseSharedStorage()) return false;
    if (!state.currentUser) return false;
    if (!supportsPushNotifications() || !state.pushNotifications.supported) return false;
    if (state.pushNotifications.permission !== "granted") return false;
    if (!state.pushNotifications.serverEnabled || !state.pushNotifications.subscribed) return false;
    if (getStoredLastSeenAppVersion() === currentVersion) return false;
    if (state.appVersionNotificationInFlight === currentVersion) return false;
    state.appVersionNotificationInFlight = currentVersion;
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("家計簿WebApp を更新しました", {
        body: `${currentVersion} に更新されました。設定内のアップデート履歴をご確認ください。`,
        tag: `kakeibo-app-version-${currentVersion}`,
        renotify: false,
        data: { url: "/?tab=settings&focus=update-history" },
        badge: "/src/assets/favicon-192.png",
        icon: "/src/assets/favicon-192.png",
      });
      setStoredLastSeenAppVersion(currentVersion);
      return true;
    } catch (error) {
      console.warn("maybeNotifyAppVersionUpdate failed", error);
      return false;
    } finally {
      state.appVersionNotificationInFlight = "";
    }
  }

  function buildDashboardGroupActuals(items) {
    return items.reduce((result, item) => {
      const groupKey = getCategoryBudgetGroupKey(item?.category);
      if (!groupKey) return result;
      result[groupKey] = (result[groupKey] || 0) + getDashboardExpenseAmount(item);
      return result;
    }, {});
  }

  function buildSummaryDetailAttributes(options = {}) {
    return callSummaryDetailFeature("buildSummaryDetailAttributes", options);
  }

  function getDashboardProgressCardHtml(label, actual, budget, referenceAmount, assessment, suffixText, detailOptions = {}) {
    const ratio = budget > 0 ? referenceAmount / budget : 0;
    const width = Math.min(Math.max(ratio * 100, 0), 100);
    const actualAmount = Number(actual || 0);
    return `
      <button class="dashboard-progress-card summary-detail-card" type="button"${buildSummaryDetailAttributes({ ...detailOptions, expectedTotal: actualAmount })}>
        <div class="dashboard-progress-head">
          <span>${escapeHtml(label)}</span>
          ${buildStatusPillHtml(assessment.tone, assessment.label)}
        </div>
        <strong>${escapeHtml(formatCurrency(actualAmount))}</strong>
        <small>予算 ${escapeHtml(formatCurrency(budget))} / ${escapeHtml(suffixText)} ${escapeHtml(formatCurrency(referenceAmount))} / ${escapeHtml(getDashboardDeltaText(referenceAmount - budget))}</small>
        <div class="dashboard-progress-bar"><span class="tone-${escapeHtml(assessment.tone)}" style="width:${width}%"></span></div>
      </button>
    `;
  }

  function getDashboardReferenceCardHtml(label, actual, budget, note, detailOptions = {}) {
    const hasBudget = Number(budget) > 0;
    const budgetText = hasBudget ? formatCurrency(budget) : "予算未設定";
    const noteText = String(note || "参考表示").trim() || "参考表示";
    const actualAmount = Number(actual || 0);
    return `
      <button class="dashboard-reference-card summary-detail-card" type="button"${buildSummaryDetailAttributes({ ...detailOptions, expectedTotal: actualAmount })}>
        <div class="dashboard-reference-head">
          <span>${escapeHtml(label)}</span>
          <span class="dashboard-reference-chip">参考</span>
        </div>
        <strong>${escapeHtml(formatCurrency(actualAmount))}</strong>
        <small>${hasBudget ? `月予算 ${escapeHtml(budgetText)}` : "予算未設定"}</small>
        <p class="muted small">${escapeHtml(noteText)}</p>
      </button>
    `;
  }

  function getDashboardAnnualExecutionCardHtml(label, actual, annualBudget, annualProgress, assessment, budgetLabel = "年予算", detailOptions = {}) {
    const budget = Math.max(0, Number(annualBudget || 0));
    const actualAmount = Number(actual || 0);
    const expectedToDate = budget * Number(annualProgress?.elapsedRatio || 0);
    const executionRate = expectedToDate > 0 ? actualAmount / expectedToDate : 0;
    const width = Math.min(Math.max(executionRate * 100, 0), 100);
    const rateText = budget > 0 ? `${Math.round(executionRate * 100)}%` : "予算未設定";
    const deltaText = budget > 0 ? getDashboardDeltaText(actualAmount - expectedToDate) : getDashboardDeltaText(actualAmount);
    return `
      <button class="dashboard-progress-card dashboard-annual-execution-card summary-detail-card" type="button"${buildSummaryDetailAttributes({ ...detailOptions, expectedTotal: actualAmount })}>
        <div class="dashboard-progress-head">
          <span>${escapeHtml(label)}</span>
          ${buildStatusPillHtml(assessment.tone, assessment.label)}
        </div>
        <strong>${escapeHtml(formatCurrency(actualAmount))}</strong>
        <small>執行率 ${escapeHtml(rateText)} / ${escapeHtml(budgetLabel)} ${escapeHtml(formatCurrency(budget))}</small>
        <small>経過 ${escapeHtml(String(annualProgress?.elapsedDays || 0))}日 / 本日時点の目安 ${escapeHtml(formatCurrency(expectedToDate))} / ${escapeHtml(deltaText)}</small>
        <div class="dashboard-progress-bar"><span class="tone-${escapeHtml(assessment.tone)}" style="width:${width}%"></span></div>
      </button>
    `;
  }

  function getDashboardAnnualFocusCardHtml(label, actual, annualBudget, annualProgress, assessment, detailOptions = {}) {
    const budget = Math.max(0, Number(annualBudget || 0));
    const actualAmount = Number(actual || 0);
    const expectedToDate = budget * Number(annualProgress?.elapsedRatio || 0);
    const executionRate = expectedToDate > 0 ? actualAmount / expectedToDate : 0;
    const width = Math.min(Math.max(executionRate * 100, 0), 100);
    const deltaText = budget > 0
      ? getDashboardDeltaText(actualAmount - expectedToDate)
      : getDashboardDeltaText(actualAmount);
    return `
      <button class="dashboard-progress-card dashboard-annual-focus-card summary-detail-card" type="button"${buildSummaryDetailAttributes({ ...detailOptions, expectedTotal: actualAmount })}>
        <div class="dashboard-progress-head">
          <span>${escapeHtml(label)}</span>
          ${buildStatusPillHtml(assessment.tone, assessment.label)}
        </div>
        <strong>${escapeHtml(formatCurrency(actualAmount))}</strong>
        <small>本日時点の目安 ${escapeHtml(formatCurrency(expectedToDate))} / ${escapeHtml(deltaText)}</small>
        <div class="dashboard-progress-bar"><span class="tone-${escapeHtml(assessment.tone)}" style="width:${width}%"></span></div>
      </button>
    `;
  }

  function getDashboardAnnualCumulativeCardHtml(label, actual, note = "累計支払額", detailOptions = {}) {
    const isTotal = String(label || "").includes("合計");
    const actualAmount = Number(actual || 0);
    return `
      <button class="dashboard-reference-card dashboard-cumulative-card${isTotal ? " dashboard-total-card" : ""} summary-detail-card" type="button"${buildSummaryDetailAttributes({ ...detailOptions, expectedTotal: actualAmount })}>
        <div class="dashboard-reference-head">
          <span>${escapeHtml(label)}</span>
        </div>
        <strong>${escapeHtml(formatCurrency(actualAmount))}</strong>
        <small>${escapeHtml(note)}</small>
      </button>
    `;
  }

  function getDashboardDailyPaceCardHtml(label, actual, budget, expectedToDate, assessment, detailOptions = {}) {
    const expected = Math.max(0, Number(expectedToDate || 0));
    const actualAmount = Math.max(0, Number(actual || 0));
    const ratio = expected > 0 ? actualAmount / expected : 0;
    const width = Math.min(Math.max(ratio * 100, 0), 140);
    const deltaText = getDashboardDeltaText(actualAmount - expected);
    return `
      <button class="dashboard-progress-card dashboard-daily-pace-card summary-detail-card" type="button"${buildSummaryDetailAttributes({ ...detailOptions, expectedTotal: actualAmount })}>
        <div class="dashboard-progress-head">
          <span>${escapeHtml(label)}</span>
          ${buildStatusPillHtml(assessment.tone, assessment.label)}
        </div>
        <strong>${escapeHtml(formatCurrency(actualAmount))}</strong>
        <small>今日時点の目安 ${escapeHtml(formatCurrency(expected))} / 使用率 ${escapeHtml(String(Math.round(ratio * 100)))}% / ${escapeHtml(deltaText)} (※未来日付は含みません)</small>
        <small>月予算 ${escapeHtml(formatCurrency(budget))}</small>
        <div class="dashboard-progress-bar"><span class="tone-${escapeHtml(assessment.tone)}" style="width:${width}%"></span></div>
      </button>
    `;
  }

  function getHomeMiniProgressCardHtml(label, actual, budget, expectedToDate, assessment, detailOptions = {}) {
    return callHomeDashboardFeature("getHomeMiniProgressCardHtml", label, actual, budget, expectedToDate, assessment, detailOptions);
  }

  function getDashboardAnnualExecutionAssessment(actual, annualBudget, annualProgress) {
    const budget = Math.max(0, Number(annualBudget || 0));
    const expectedToDate = budget * Number(annualProgress?.elapsedRatio || 0);
    if (budget <= 0) {
      return Number(actual || 0) > 0
        ? { tone: "warning", label: "予算未設定" }
        : { tone: "idle", label: "予算未設定" };
    }
    return getOverallDashboardAssessment(
      expectedToDate > 0 ? Number(actual || 0) / expectedToDate : 0,
      Math.max(Number(actual || 0) - expectedToDate, 0)
    );
  }

  function getDashboardReferenceNote(groupKey) {
    switch (groupKey) {
      case "housing_rent":
        return "毎月の固定費として参考実績で確認";
      case "communication_total":
      case "utilities_home":
      case "utility_water":
        return "請求確定後の参考実績として確認";
      case "car_fuel":
        return "使い方の参考実績として確認";
      case "car_parking_toll":
        return "外出や車移動に連動する支出として参考実績で確認";
      case "medical_regular":
        return "必要支出の参考実績として確認";
      case "car_loan":
        return "定額返済の参考実績として確認";
      case "other":
        return "分類先に迷う支出の受け皿として参考実績で確認";
      default:
        return "参考表示";
    }
  }

  function getDashboardOverallCauseText(label, drivers, fallback) {
    if (!drivers.length) return fallback;
    const detail = drivers.map((item) => `${item.label} ${getDashboardDeltaText(item.overAmount)}`).join("、");
    if (label === "順調") return fallback;
    if (label === "注意" || label === "要観察") return `主因: ${detail}`;
    if (label === "見直し推奨") return `超過幅が大きめです。主因: ${detail}`;
    if (label === "対応必要") return `超過が大きく、早めの調整が必要です。主因: ${detail}`;
    return fallback;
  }

  function renderHomeMonthlyKpi(data = {}) {
    return callHomeDashboardFeature("renderHomeMonthlyKpi", data);
  }

  function getDriveUnsyncedReceiptCount(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((count, item) => {
      const assets = getReceiptAssets(item);
      const hasUnsyncedAsset = assets.some((asset) => asset.storageAssetId && !asset.driveUrl && !asset.driveFileId);
      const hasLegacyUnsynced = Boolean(
        item?.receiptStorageAssetId
        && !item?.receiptDriveUrl
        && !item?.receiptDriveFileId
      );
      return count + (hasUnsyncedAsset || hasLegacyUnsynced ? 1 : 0);
    }, 0);
  }

  function renderDashboardSummary(targetMonth, targetYear) {
    const budgetConfig = getDashboardBudgetConfig();
    renderDashboardBudgetForm();

    const monthlyGroupKeys = getDashboardMonthlyGroupKeys();
    const monthlyFocusGroupKeys = getDashboardMonthlyFocusGroupKeys();
    const monthlyReferenceGroupKeys = getDashboardMonthlyReferenceGroupKeys();
    const annualMonthlyFocusGroupKeys = DASHBOARD_ANNUAL_MONTHLY_FOCUS_GROUP_KEYS.slice();
    const annualMonthlyReferenceGroupKeys = monthlyGroupKeys.filter((key) => !DASHBOARD_ANNUAL_MONTHLY_FOCUS_GROUP_KEYS.includes(key));
    const annualGroupKeys = getDashboardAnnualGroupKeys();
    const excludedAnnualGroupKeys = new Set(budgetConfig.excludedAnnualGroups || []);

    if (!state.expensesLoaded) {
      const loadingMessage = hasSummaryDataRefreshError() ? state.sharedBootstrapError : getSummaryLoadingMessage();
      const monthlyFocusBudgetTotal = monthlyFocusGroupKeys.reduce((sum, key) => sum + getDashboardBudgetGroupValue(budgetConfig, "monthly", key), 0);
      const annualBudgetTotal = annualGroupKeys.reduce((sum, key) => sum + getDashboardBudgetGroupValue(budgetConfig, "annual", key), 0);
      const loadingLabel = hasSummaryDataRefreshError() ? "要再読込" : "読込中";
      const loadingStatusLabel = hasSummaryDataRefreshError() ? "再試行可" : "更新中";
      renderHomeMonthlyKpi({
        loading: true,
        budget: monthlyFocusBudgetTotal,
        statusLabel: loadingStatusLabel,
        message: loadingMessage,
      });
      if (els.homeMonthlyMiniProgress) {
        els.homeMonthlyMiniProgress.innerHTML = `
          <div class="home-loading-indicator">
            <span class="startup-spinner"></span>
            <p class="muted">やりくり費の支出を計算中...</p>
          </div>
        `;
      }
      if (els.dashboardCoreMonthlyTotal) els.dashboardCoreMonthlyTotal.textContent = loadingLabel;
      if (els.dashboardCoreMonthlyMeta) els.dashboardCoreMonthlyMeta.textContent = `食料品・外食費・日用品の予算は ${formatCurrency(monthlyFocusBudgetTotal)}`;
      if (els.dashboardCoreMonthlyStatus) {
        els.dashboardCoreMonthlyStatus.className = "status-pill status-idle";
        els.dashboardCoreMonthlyStatus.textContent = loadingStatusLabel;
      }
      if (els.dashboardCoreMonthlyBar) {
        els.dashboardCoreMonthlyBar.className = "tone-good";
        els.dashboardCoreMonthlyBar.style.width = "0%";
      }
      if (els.dashboardForecastTotal) els.dashboardForecastTotal.textContent = loadingLabel;
      if (els.dashboardForecastMeta) els.dashboardForecastMeta.textContent = "今のペースから今月の着地を計算します";
      if (els.dashboardForecastStatus) {
        els.dashboardForecastStatus.className = "status-pill status-idle";
        els.dashboardForecastStatus.textContent = loadingStatusLabel;
      }
      if (els.dashboardSpecialAnnualTotal) els.dashboardSpecialAnnualTotal.textContent = loadingLabel;
      if (els.dashboardSpecialAnnualMeta) els.dashboardSpecialAnnualMeta.textContent = `今年の年予算は ${formatCurrency(annualBudgetTotal)}`;
      if (els.dashboardSpecialAnnualStatus) {
        els.dashboardSpecialAnnualStatus.className = "status-pill status-idle";
        els.dashboardSpecialAnnualStatus.textContent = "累計";
      }
      if (els.dashboardOverallLabel) els.dashboardOverallLabel.textContent = loadingLabel;
      if (els.dashboardOverallMeta) els.dashboardOverallMeta.textContent = loadingMessage;
      if (els.dashboardOverallCause) els.dashboardOverallCause.textContent = hasSummaryDataRefreshError() ? "下の再読み込みから、もう一度共有データを取得できます" : "読込が終わると今月と今年の状態を表示します";
      if (els.dashboardOverallStatus) {
        els.dashboardOverallStatus.className = "status-pill status-idle";
        els.dashboardOverallStatus.textContent = loadingStatusLabel;
      }
      if (els.dashboardCoreCategoryProgress) {
        els.dashboardCoreCategoryProgress.innerHTML = DASHBOARD_MONTHLY_GROUP_DEFINITIONS
          .filter((group) => monthlyFocusGroupKeys.includes(group.key))
          .map((group) => getDashboardDailyPaceCardHtml(
          group.label,
          0,
          getDashboardBudgetGroupValue(budgetConfig, "monthly", group.key),
          0,
          { tone: "idle", label: loadingStatusLabel }
          )).join("");
      }
      if (els.dashboardReferenceCategoryProgress) {
        els.dashboardReferenceCategoryProgress.innerHTML = DASHBOARD_MONTHLY_GROUP_DEFINITIONS
          .filter((group) => monthlyReferenceGroupKeys.includes(group.key))
          .map((group) => getDashboardReferenceCardHtml(
            group.label,
            0,
            getDashboardBudgetGroupValue(budgetConfig, "monthly", group.key),
            getDashboardReferenceNote(group.key)
          )).join("");
      }
      if (els.dashboardAnnualCategoryProgress) {
        els.dashboardAnnualCategoryProgress.innerHTML = [
          ...DASHBOARD_ANNUAL_GROUP_DEFINITIONS.map((group) => getDashboardAnnualCumulativeCardHtml(group.label, 0, "累計支払額")),
          getDashboardAnnualCumulativeCardHtml("特別費の合計", 0, "年次予算グループの累計"),
        ].join("");
      }
      if (els.dashboardAnnualMonthlyFocusProgress) {
        const loadingAnnualProgress = getAnnualProgressInfo(targetYear);
        const loadingFocusCards = DASHBOARD_MONTHLY_GROUP_DEFINITIONS
          .filter((group) => annualMonthlyFocusGroupKeys.includes(group.key))
          .map((group) => {
            const annualizedBudget = getDashboardBudgetGroupValue(budgetConfig, "monthly", group.key) * 12;
            return getDashboardAnnualFocusCardHtml(
              group.label,
              0,
              annualizedBudget,
              loadingAnnualProgress,
              { tone: "idle", label: loadingStatusLabel }
            );
          });
        const loadingFocusAnnualBudget = annualMonthlyFocusGroupKeys.reduce((sum, key) => {
          return sum + getDashboardBudgetGroupValue(budgetConfig, "monthly", key) * 12;
        }, 0);
        loadingFocusCards.push(getDashboardAnnualFocusCardHtml(
          "主要5項目合計",
          0,
          loadingFocusAnnualBudget,
          loadingAnnualProgress,
          { tone: "idle", label: loadingStatusLabel }
        ));
        els.dashboardAnnualMonthlyFocusProgress.innerHTML = loadingFocusCards.join("");
      }
      if (els.dashboardAnnualMonthlyReferenceProgress) {
        els.dashboardAnnualMonthlyReferenceProgress.innerHTML = [
          ...DASHBOARD_MONTHLY_GROUP_DEFINITIONS
          .filter((group) => annualMonthlyReferenceGroupKeys.includes(group.key))
          .map((group) => getDashboardAnnualCumulativeCardHtml(group.label, 0, "累計支払額")),
          getDashboardAnnualCumulativeCardHtml("月予算グループの合計", 0, "月予算グループ全体の累計"),
        ].join("");
      }
      if (els.dashboardAnnualMonthlyTotalProgress) {
        els.dashboardAnnualMonthlyTotalProgress.innerHTML = "";
      }
      if (els.dashboardExcludedAnnualTitle) els.dashboardExcludedAnnualTitle.textContent = "";
      if (els.dashboardExcludedAnnualMessage) els.dashboardExcludedAnnualMessage.textContent = "";
      renderDashboardUnassignedWarning({ issues: [], totalAmount: 0, targetYear });
      return;
    }

    const dashboardExpenses = getDashboardExpenses();
    const monthlyItems = dashboardExpenses.filter((item) => String(item?.date || "").startsWith(targetMonth));
    const yearlyItems = dashboardExpenses.filter((item) => String(item?.date || "").startsWith(targetYear));
    const monthlyActuals = buildDashboardGroupActuals(monthlyItems);
    const annualActuals = buildDashboardGroupActuals(yearlyItems);
    const monthlyFocusBudgetTotal = monthlyFocusGroupKeys.reduce((sum, key) => sum + getDashboardBudgetGroupValue(budgetConfig, "monthly", key), 0);
    const monthlyFocusActualTotal = monthlyFocusGroupKeys.reduce((sum, key) => sum + Number(monthlyActuals[key] || 0), 0);
    const monthlyFocusActualRatio = monthlyFocusBudgetTotal ? monthlyFocusActualTotal / monthlyFocusBudgetTotal : 0;
    const elapsedMonthDays = Math.max(1, Math.min(
      targetMonth === currentMonth() ? Number(todayISO().slice(8, 10)) : getDaysInMonth(targetMonth),
      getDaysInMonth(targetMonth)
    ));
    const totalMonthDays = getDaysInMonth(targetMonth);
    const forecastTotal = buildProjectedAmount(monthlyFocusActualTotal, elapsedMonthDays, totalMonthDays);
    const forecastRatio = monthlyFocusBudgetTotal ? forecastTotal / monthlyFocusBudgetTotal : 0;
    const forecastOverAmount = Math.max(forecastTotal - monthlyFocusBudgetTotal, 0);
    const monthlyFocusExpectedToDate = monthlyFocusBudgetTotal * (elapsedMonthDays / Math.max(totalMonthDays, 1));
    const monthlyFocusDailyRatio = monthlyFocusExpectedToDate > 0 ? monthlyFocusActualTotal / monthlyFocusExpectedToDate : 0;
    const monthlyFocusDailyDelta = monthlyFocusActualTotal - monthlyFocusExpectedToDate;

    const annualBudgetTotal = annualGroupKeys.reduce((sum, key) => sum + getDashboardBudgetGroupValue(budgetConfig, "annual", key), 0);
    const annualActualTotal = annualGroupKeys.reduce((sum, key) => sum + Number(annualActuals[key] || 0), 0);
    const annualProgress = getAnnualProgressInfo(targetYear);
    const annualMetrics = getAnnualBudgetProgressMetrics(annualActualTotal, annualBudgetTotal, annualProgress);

    const monthlyAssessment = getCategoryDashboardAssessment(monthlyFocusDailyRatio, Math.max(monthlyFocusDailyDelta, 0));
    const forecastAssessment = getOverallDashboardAssessment(forecastRatio, forecastOverAmount);
    const focusGroupKeys = new Set(getDashboardMonthlyFocusGroupKeys());
    const focusExpenses = monthlyItems.filter(item => {
      const groupKey = getCategoryBudgetGroupKey(item?.category);
      return focusGroupKeys.has(groupKey);
    });

    const topExpenses = focusExpenses
      .slice()
      .sort((a, b) => getDashboardExpenseAmount(b) - getDashboardExpenseAmount(a))
      .slice(0, 5);

    const categoryTotals = {};
    focusExpenses.forEach(item => {
      const cat = item.category || "その他";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + getDashboardExpenseAmount(item);
    });

    renderHomeMonthlyKpi({
      loading: false,
      budget: monthlyFocusBudgetTotal,
      actual: monthlyFocusActualTotal,
      expectedToDate: monthlyFocusExpectedToDate,
      forecast: forecastTotal,
      elapsedDays: elapsedMonthDays,
      totalDays: totalMonthDays,
      assessment: monthlyAssessment,
      topExpenses,
      categoryTotals,
    });
    bindHomeMonthlyMiniProgressCards();
    if (els.dashboardCoreMonthlyTotal) els.dashboardCoreMonthlyTotal.textContent = formatCurrency(monthlyFocusActualTotal);
    if (els.dashboardCoreMonthlyMeta) {
      els.dashboardCoreMonthlyMeta.textContent = `今日時点の目安 ${formatCurrency(monthlyFocusExpectedToDate)} / 使用率 ${Math.round(monthlyFocusDailyRatio * 100)}% / ${getDashboardDeltaText(monthlyFocusDailyDelta)} (※未来日付は含みません)`;
    }
    if (els.dashboardCoreMonthlyStatus) {
      els.dashboardCoreMonthlyStatus.className = `status-pill status-${monthlyAssessment.tone}`;
      els.dashboardCoreMonthlyStatus.textContent = monthlyAssessment.label;
    }
    if (els.dashboardCoreMonthlyBar) {
      els.dashboardCoreMonthlyBar.className = `tone-${monthlyAssessment.tone}`;
      els.dashboardCoreMonthlyBar.style.width = `${Math.min(Math.max(monthlyFocusDailyRatio * 100, 0), 140)}%`;
    }
    if (els.dashboardForecastTotal) els.dashboardForecastTotal.textContent = formatCurrency(forecastTotal);
    if (els.dashboardForecastMeta) {
      els.dashboardForecastMeta.textContent = `このままのペースだと ${formatCurrency(forecastTotal)} くらい / 予算まで ${getDashboardDeltaText(forecastTotal - monthlyFocusBudgetTotal)} (※今日までの実績ペースからの月末予測)`;
    }
    if (els.dashboardForecastStatus) {
      els.dashboardForecastStatus.className = `status-pill status-${forecastAssessment.tone}`;
      els.dashboardForecastStatus.textContent = forecastAssessment.label;
    }
    if (els.dashboardSpecialAnnualTotal) els.dashboardSpecialAnnualTotal.textContent = formatCurrency(annualActualTotal);
    if (els.dashboardSpecialAnnualMeta) {
      els.dashboardSpecialAnnualMeta.textContent = `年予算合計 ${formatCurrency(annualBudgetTotal)} / 本日時点の目安 ${formatCurrency(annualMetrics.annualIdealToDate)}`;
    }
    if (els.dashboardSpecialAnnualStatus) {
      els.dashboardSpecialAnnualStatus.className = "status-pill status-idle";
      els.dashboardSpecialAnnualStatus.textContent = "累計";
    }

    const monthlyDrivers = DASHBOARD_MONTHLY_GROUP_DEFINITIONS.filter((group) => monthlyFocusGroupKeys.includes(group.key)).map((group) => {
      const budget = getDashboardBudgetGroupValue(budgetConfig, "monthly", group.key);
      const actual = Number(monthlyActuals[group.key] || 0);
      const expectedToDate = budget * (elapsedMonthDays / Math.max(totalMonthDays, 1));
      return { label: group.label, overAmount: Math.max(actual - expectedToDate, 0) };
    }).filter((item) => item.overAmount > 0).sort((a, b) => b.overAmount - a.overAmount).slice(0, 2);
    let overallAssessment = monthlyAssessment;
    let overallMeta = `今日時点の差額 ${getDashboardDeltaText(monthlyFocusDailyDelta)} (※未来日付を除く今日時点の目安との差) / 月予算 ${formatCurrency(monthlyFocusBudgetTotal)}`;
    let overallCause = monthlyDrivers.length
      ? `主因: ${monthlyDrivers.map((item) => `${item.label} ${getDashboardDeltaText(item.overAmount)}`).join("、")}`
      : "日割り目安の範囲内です";

    const unassignedIssues = getDashboardUnassignedIssueRows(yearlyItems, monthlyGroupKeys, annualGroupKeys, excludedAnnualGroupKeys);
    const unassignedTotal = unassignedIssues.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    if (unassignedIssues.length) {
      overallAssessment = { tone: "warning", label: "見直しあり" };
      overallMeta = `${unassignedIssues.length}カテゴリ / 合計 ${formatCurrency(unassignedTotal)} が予算グループ未接続です`;
      overallCause = `この金額は家計チェックにまだ反映されません。${unassignedIssues
        .slice(0, 4)
        .map((item) => `${item.categoryLabel} ${formatCurrency(item.amount || 0)}`)
        .join(" / ")}`;
    }

    if (els.dashboardOverallLabel) els.dashboardOverallLabel.textContent = overallAssessment.label;
    if (els.dashboardOverallMeta) els.dashboardOverallMeta.textContent = overallMeta;
    if (els.dashboardOverallCause) els.dashboardOverallCause.textContent = overallCause;
    if (els.dashboardOverallStatus) {
      els.dashboardOverallStatus.className = `status-pill status-${overallAssessment.tone}`;
      els.dashboardOverallStatus.textContent = overallAssessment.label;
    }

    if (els.dashboardCoreCategoryProgress) {
      els.dashboardCoreCategoryProgress.innerHTML = DASHBOARD_MONTHLY_GROUP_DEFINITIONS.filter((group) => monthlyFocusGroupKeys.includes(group.key)).map((group) => {
        const budget = getDashboardBudgetGroupValue(budgetConfig, "monthly", group.key);
        const actual = Number(monthlyActuals[group.key] || 0);
        const expectedToDate = budget * (elapsedMonthDays / Math.max(totalMonthDays, 1));
        const assessment = getCategoryDashboardAssessment(expectedToDate > 0 ? actual / expectedToDate : 0, Math.max(actual - expectedToDate, 0));
        return getDashboardDailyPaceCardHtml(group.label, actual, budget, expectedToDate, assessment, {
          detail: "dashboard-group",
          period: "month",
          groupKey: group.key,
          title: `${group.label}の明細`,
        });
      }).join("");
    }

    if (els.dashboardReferenceCategoryProgress) {
      els.dashboardReferenceCategoryProgress.innerHTML = DASHBOARD_MONTHLY_GROUP_DEFINITIONS.filter((group) => monthlyReferenceGroupKeys.includes(group.key)).map((group) => {
        const budget = getDashboardBudgetGroupValue(budgetConfig, "monthly", group.key);
        const actual = Number(monthlyActuals[group.key] || 0);
        return getDashboardReferenceCardHtml(group.label, actual, budget, getDashboardReferenceNote(group.key), {
          detail: "dashboard-group",
          period: "month",
          groupKey: group.key,
          title: `${group.label}の明細`,
        });
      }).join("");
    }

    if (els.dashboardAnnualCategoryProgress) {
      els.dashboardAnnualCategoryProgress.innerHTML = [
        ...DASHBOARD_ANNUAL_GROUP_DEFINITIONS.map((group) => getDashboardAnnualCumulativeCardHtml(
          group.label,
          Number(annualActuals[group.key] || 0),
          "累計支払額",
          {
            detail: "dashboard-group",
            period: "year",
            groupKey: group.key,
            title: `${group.label}の明細`,
          }
        )),
        getDashboardAnnualCumulativeCardHtml("特別費の合計", annualActualTotal, "年次予算グループの累計", {
          detail: "dashboard-group",
          period: "year",
          groupKeys: annualGroupKeys,
          title: "特別費の合計明細",
        }),
      ].join("");
    }

    if (els.dashboardAnnualMonthlyFocusProgress) {
      const annualFocusCards = DASHBOARD_MONTHLY_GROUP_DEFINITIONS
        .filter((group) => annualMonthlyFocusGroupKeys.includes(group.key))
        .map((group) => {
        const monthlyBudget = getDashboardBudgetGroupValue(budgetConfig, "monthly", group.key);
        const annualizedBudget = monthlyBudget * 12;
        const actual = Number(annualActuals[group.key] || 0);
        const assessment = getDashboardAnnualExecutionAssessment(actual, annualizedBudget, annualProgress);
        return getDashboardAnnualFocusCardHtml(group.label, actual, annualizedBudget, annualProgress, assessment, {
          detail: "dashboard-group",
          period: "year",
          groupKey: group.key,
          title: `${group.label}の明細`,
        });
      });
      const majorFiveAnnualActual = annualMonthlyFocusGroupKeys.reduce((sum, key) => sum + Number(annualActuals[key] || 0), 0);
      const majorFiveAnnualBudget = annualMonthlyFocusGroupKeys.reduce((sum, key) => {
        return sum + getDashboardBudgetGroupValue(budgetConfig, "monthly", key) * 12;
      }, 0);
      annualFocusCards.push(getDashboardAnnualFocusCardHtml(
        "主要5項目合計",
        majorFiveAnnualActual,
        majorFiveAnnualBudget,
        annualProgress,
        getDashboardAnnualExecutionAssessment(majorFiveAnnualActual, majorFiveAnnualBudget, annualProgress),
        {
          detail: "dashboard-group",
          period: "year",
          groupKeys: annualMonthlyFocusGroupKeys,
          title: "主要5項目合計の明細",
        }
      ));
      els.dashboardAnnualMonthlyFocusProgress.innerHTML = annualFocusCards.join("");
    }

    if (els.dashboardAnnualMonthlyReferenceProgress) {
      const annualMonthlyTotal = monthlyGroupKeys.reduce((sum, key) => sum + Number(annualActuals[key] || 0), 0);
      els.dashboardAnnualMonthlyReferenceProgress.innerHTML = [
        ...DASHBOARD_MONTHLY_GROUP_DEFINITIONS
        .filter((group) => annualMonthlyReferenceGroupKeys.includes(group.key))
        .map((group) => getDashboardAnnualCumulativeCardHtml(
          group.label,
          Number(annualActuals[group.key] || 0),
          "累計支払額",
          {
            detail: "dashboard-group",
            period: "year",
            groupKey: group.key,
            title: `${group.label}の明細`,
          }
        )),
        getDashboardAnnualCumulativeCardHtml(
          "月予算グループの合計",
          annualMonthlyTotal,
          "月予算グループ全体の累計",
          {
            detail: "dashboard-group",
            period: "year",
            groupKeys: monthlyGroupKeys,
            title: "月予算グループの合計明細",
          }
        ),
      ].join("");
    }

    if (els.dashboardAnnualMonthlyTotalProgress) {
      els.dashboardAnnualMonthlyTotalProgress.innerHTML = "";
    }

    if (els.dashboardExcludedAnnualTitle) {
      els.dashboardExcludedAnnualTitle.textContent = "";
    }
    if (els.dashboardExcludedAnnualMessage) {
      els.dashboardExcludedAnnualMessage.textContent = "";
    }

    renderDashboardUnassignedWarning({ issues: unassignedIssues, totalAmount: unassignedTotal, targetYear });
  }

  function renderExpenseList() {
    const delegated = callExpenseListFeature("renderExpenseList");
    if (delegated !== undefined) return delegated;
  }

  function getKnownExpensesForList() {
    const delegated = callExpenseListFeature("getKnownExpensesForList");
    if (delegated !== undefined) return delegated;
    return [];
  }

  function getListFilteredExpenses() {
    const delegated = callExpenseListFeature("getListFilteredExpenses");
    if (delegated !== undefined) return delegated;
    return [];
  }

    function renderSearchResults() {
      const delegated = callSearchFeature("renderSearchResults");
      if (delegated !== undefined) return delegated;
  }

  function renderSummary() {
    ensureSummaryPeriodDefaults();
    renderSummaryViewMode();
    renderSummaryDataStatus();
    renderSummaryYearOptions();
    renderSettlementYearOptions();
    ensureSummaryPeriodDefaults();
    const targetMonth = els.summaryMonth.value || currentMonth();
    const targetYear = els.summaryYear?.value || targetMonth.slice(0, 4) || currentYear();
    const settlementYear = els.summarySettlementYear?.value || targetYear;
    if (els.summaryYear && els.summaryYear.value !== targetYear) {
      els.summaryYear.value = targetYear;
    }
    renderDashboardSummary(targetMonth, targetYear);
      if (!state.expensesLoaded) {
        const summaryPlaceholder = hasSummaryDataRefreshError() ? "要再読込" : isSummaryDataRefreshing() ? "読込中" : formatCurrency(0);
        els.summaryTotal.textContent = summaryPlaceholder;
        els.summaryYearlyTotal.textContent = summaryPlaceholder;
        els.summaryYearlyHusband.textContent = summaryPlaceholder;
        els.summaryYearlyWife.textContent = summaryPlaceholder;
        els.summaryYearlyFamilyCard.textContent = summaryPlaceholder;
        if (els.summaryYearlyTemporaryIncome) els.summaryYearlyTemporaryIncome.textContent = summaryPlaceholder;
        if (els.summaryYearlyTotalFormula) els.summaryYearlyTotalFormula.textContent = "共有データの読込後に式を表示します";
        if (els.summaryYearlyFormulaHusband) els.summaryYearlyFormulaHusband.textContent = `夫 ${summaryPlaceholder}`;
        if (els.summaryYearlyFormulaWife) els.summaryYearlyFormulaWife.textContent = `妻 ${summaryPlaceholder}`;
        if (els.summaryYearlyFormulaIncome) els.summaryYearlyFormulaIncome.textContent = `臨時入金 ${summaryPlaceholder}`;
        if (els.summaryYearlyFormulaTotal) els.summaryYearlyFormulaTotal.textContent = `合計 ${summaryPlaceholder}`;
        els.summaryHusband.textContent = summaryPlaceholder;
        els.summaryWife.textContent = summaryPlaceholder;
        els.summaryFamilyCard.textContent = summaryPlaceholder;
      els.categorySummary.innerHTML = `
        <div class="expense-card">
          <span class="muted">${escapeHtml(hasSummaryDataRefreshError() ? state.sharedBootstrapError : getSummaryLoadingMessage())}</span>
        </div>
      `;
      renderCrossBurdenSummary(settlementYear);
      renderSettlementReport();
      renderRecentMonthsSummary();
      return;
    }
    const familyExpenses = state.expenses.filter(isFamilySummaryExpense);
    const items = familyExpenses.filter((item) => item.date.startsWith(targetMonth));
    const yearlyItems = familyExpenses.filter((item) => item.date.startsWith(targetYear));
    const husbandTotal = sumAmounts(items.filter((item) => getSettlementFamilyPayer(item) === "husband"));
    const wifeTotal = sumAmounts(items.filter((item) => getSettlementFamilyPayer(item) === "wife"));
    const familyTotal = sumAmounts(items.filter((item) => isFamilyCardExpense(item)));
    const total = sumAmounts(items);
      const yearlyFamilyTotal = sumAmounts(yearlyItems);
      const yearlyHusbandTotal = sumAmounts(yearlyItems.filter((item) => getSettlementFamilyPayer(item) === "husband"));
      const yearlyWifeTotal = sumAmounts(yearlyItems.filter((item) => getSettlementFamilyPayer(item) === "wife"));
      const yearlyFamilyCardTotal = sumAmounts(yearlyItems.filter((item) => isFamilyCardExpense(item)));
      const yearlyTemporaryIncomeTotal = sumAmounts(
        (Array.isArray(state.householdIncomes) ? state.householdIncomes : []).filter((item) => {
          if (!item) return false;
          return String(item.date || "").startsWith(targetYear);
        })
      );
      els.summaryTotal.textContent = formatCurrency(total);
      els.summaryYearlyTotal.textContent = formatCurrency(yearlyFamilyTotal);
      els.summaryYearlyHusband.textContent = formatCurrency(yearlyHusbandTotal);
      els.summaryYearlyWife.textContent = formatCurrency(yearlyWifeTotal);
      els.summaryYearlyFamilyCard.textContent = formatCurrency(yearlyFamilyCardTotal);
      if (els.summaryYearlyTemporaryIncome) els.summaryYearlyTemporaryIncome.textContent = formatCurrency(yearlyTemporaryIncomeTotal);
      if (els.summaryYearlyTotalFormula) {
        els.summaryYearlyTotalFormula.textContent = `${formatCurrency(yearlyHusbandTotal)} + ${formatCurrency(yearlyWifeTotal)}`;
      }
      if (els.summaryYearlyFormulaHusband) els.summaryYearlyFormulaHusband.textContent = `夫 ${formatCurrency(yearlyHusbandTotal)}`;
      if (els.summaryYearlyFormulaWife) els.summaryYearlyFormulaWife.textContent = `妻 ${formatCurrency(yearlyWifeTotal)}`;
      if (els.summaryYearlyFormulaIncome) els.summaryYearlyFormulaIncome.textContent = `臨時入金（予算側） ${formatCurrency(yearlyTemporaryIncomeTotal)}`;
      if (els.summaryYearlyFormulaTotal) els.summaryYearlyFormulaTotal.textContent = `家計費合計 ${formatCurrency(yearlyFamilyTotal)}`;
      els.summaryHusband.textContent = formatCurrency(husbandTotal);
      els.summaryWife.textContent = formatCurrency(wifeTotal);
      els.summaryFamilyCard.textContent = formatCurrency(familyTotal);

    const byCategory = state.categories.map((category) => ({
      category,
      total: sumAmounts(items.filter((item) => item.category === category)),
    }));

    els.categorySummary.innerHTML = byCategory
      .map((item) => `<div class="summary-item"><span>${escapeHtml(item.category)}</span><strong>${formatCurrency(item.total)}</strong></div>`)
      .join("");

    renderCrossBurdenSummary(settlementYear);
    renderSettlementReport();
    renderRecentMonthsSummary();
  }

  function renderSummaryDataStatus() {
    const delegated = callSharedBootstrapFeature("renderSummaryDataStatus");
    if (delegated !== undefined) return delegated;
    if (!els.summaryDataStatus) return;
    els.summaryDataStatus.classList.add("hidden");
  }

  async function retrySharedBootstrap(options = {}) {
    const delegated = callSharedBootstrapFeature("retrySharedBootstrap", options);
    if (delegated !== undefined) return delegated;
    return false;
  }

  function getCrossBurdenYearSummary(year) {
    return state.expenses.reduce((summary, item) => {
      if (!String(item?.date || "").startsWith(year)) return summary;
      const amount = Number(item?.amount || 0);
      if (!amount) return summary;
      const personalExpense = item?.personalExpense || "family";
      const actualPayer = getActualPayerEstimated(item);
      if (actualPayer === "husband" && personalExpense === "wife") {
        summary.husbandPaidForWife += amount;
        summary.husbandPaidForWifeCount += 1;
        summary.husbandPaidForWifeItems.push(item);
      } else if (actualPayer === "wife" && personalExpense === "husband") {
        summary.wifePaidForHusband += amount;
        summary.wifePaidForHusbandCount += 1;
        summary.wifePaidForHusbandItems.push(item);
      }
      return summary;
    }, {
      husbandPaidForWife: 0,
      husbandPaidForWifeCount: 0,
      husbandPaidForWifeItems: [],
      wifePaidForHusband: 0,
      wifePaidForHusbandCount: 0,
      wifePaidForHusbandItems: [],
    });
  }

  function renderCrossBurdenSummary(year) {
    if (!els.summaryCrossBurden || !els.summaryCrossBurdenLabel) return;
    const rows = getCrossBurdenYearSummary(year);
    els.summaryCrossBurdenLabel.textContent = `${year}年の代理負担を集計しています。`;
    els.summaryCrossBurden.innerHTML = [
      `
        <button class="mini-summary-card mini-summary-button" type="button" data-cross-burden="husbandPaidForWife">
          <span>${escapeHtml(year)}年 夫が妻負担を支払い</span>
          <strong>${escapeHtml(formatCurrency(rows.husbandPaidForWife))}</strong>
          <small>${rows.husbandPaidForWifeCount}件</small>
        </button>
      `,
      `
        <button class="mini-summary-card mini-summary-button" type="button" data-cross-burden="wifePaidForHusband">
          <span>${escapeHtml(year)}年 妻が夫負担を支払い</span>
          <strong>${escapeHtml(formatCurrency(rows.wifePaidForHusband))}</strong>
          <small>${rows.wifePaidForHusbandCount}件</small>
        </button>
      `,
    ].join("");
    els.summaryCrossBurden.querySelectorAll("[data-cross-burden]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-cross-burden");
        if (key === "husbandPaidForWife") {
          openCrossBurdenModal(
            `${year}年 夫が妻負担を支払った明細`,
            `${rows.husbandPaidForWifeCount}件 / 合計 ${formatCurrency(rows.husbandPaidForWife)}`,
            rows.husbandPaidForWifeItems
          );
          return;
        }
        openCrossBurdenModal(
          `${year}年 妻が夫負担を支払った明細`,
          `${rows.wifePaidForHusbandCount}件 / 合計 ${formatCurrency(rows.wifePaidForHusband)}`,
          rows.wifePaidForHusbandItems
        );
      });
    });
  }

  function getSettlementPeriodRange() {
    const selectedYear = els.summarySettlementYear?.value || els.summaryYear?.value || currentYear();
    const normalizedStart = `${selectedYear}-01`;
    const normalizedEnd = `${selectedYear}-12`;
    return {
      startMonth: normalizedStart,
      endMonth: normalizedEnd,
      startDate: `${normalizedStart}-01`,
      endDate: `${normalizedEnd}-31`,
    };
  }

  function getMonthsInRange(startMonth, endMonth) {
    if (!/^\d{4}-\d{2}$/.test(startMonth || "") || !/^\d{4}-\d{2}$/.test(endMonth || "")) return [];
    const months = [];
    const start = new Date(`${startMonth}-01T00:00:00`);
    const end = new Date(`${endMonth}-01T00:00:00`);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  function getSettlementFamilyPayer(item, rules = state.settlementRules) {
    if (isFamilyCardExpense(item)) {
      return rules?.familyCardOwner === "wife" ? "wife" : "husband";
    }
    const actual = getActualPayerEstimated(item);
    if (actual === "wife" || actual === "husband") return actual;
    return item?.payer === "wife" ? "wife" : "husband";
  }

  function getSettlementPersonLabel(person) {
    return person === "wife" ? "妻" : "夫";
  }

  function getSettlementMonthlyPlanLabel(monthPlan) {
    if (monthPlan?.usedOverride) return "月別の上書き設定を優先";
    return "毎月分は1日、賞与分は10日に拠出した前提";
  }

  function getSettlementMonthlyDirectionLabel(balanceWifeToHusband) {
    const balance = Number(balanceWifeToHusband || 0);
    if (balance > 0) return `家計費だけなら 妻→夫 ${formatCurrency(Math.round(balance))}`;
    if (balance < 0) return `家計費だけなら 夫→妻 ${formatCurrency(Math.round(Math.abs(balance)))}`;
    return "家計費だけなら差額なし";
  }

  function buildSettlementMonthPlan(rules, monthKey) {
    const month = monthKey.slice(5, 7);
    const override = rules.monthlyOverrides?.[monthKey];
    const monthPlan = {
      monthKey,
      usedOverride: Boolean(override),
      monthlyContribution: {
        husband: Number(rules.monthlyContribution?.husband || 0),
        wife: Number(rules.monthlyContribution?.wife || 0),
      },
      bonusContribution: {
        husband: Number(rules.bonusContribution?.husband?.[month] || 0),
        wife: Number(rules.bonusContribution?.wife?.[month] || 0),
      },
      target: { husband: 0, wife: 0, total: 0 },
      directPayments: { husband: 0, wife: 0, total: 0 },
      householdDelta: { husband: 0, wife: 0, total: 0 },
      householdSettlement: {
        from: "",
        to: "",
        amount: 0,
        balanceWifeToHusband: 0,
      },
    };
    if (override) {
      monthPlan.target.husband = Number(override?.husband || 0);
      monthPlan.target.wife = Number(override?.wife || 0);
    } else {
      monthPlan.target.husband = monthPlan.monthlyContribution.husband + monthPlan.bonusContribution.husband;
      monthPlan.target.wife = monthPlan.monthlyContribution.wife + monthPlan.bonusContribution.wife;
    }
    monthPlan.target.total = monthPlan.target.husband + monthPlan.target.wife;
    return monthPlan;
  }

  function formatBalanceCurrency(value) {
    const amount = Number(value || 0);
    if (!amount) return formatCurrency(0);
    return amount < 0 ? `-${formatCurrency(Math.abs(amount))}` : formatCurrency(amount);
  }

  function getHouseholdPoolBalanceTone(value) {
    const amount = Number(value || 0);
    if (amount > 0) return "positive";
    if (amount < 0) return "negative";
    return "";
  }

  function getHouseholdPoolBalanceLabel(person, amount) {
    const label = getSettlementPersonLabel(person);
    const normalized = Number(amount || 0);
    if (normalized > 0) return `${label}預かり ${formatCurrency(normalized)}`;
    if (normalized < 0) return `${label}立替超過 ${formatCurrency(Math.abs(normalized))}`;
    return `${label}預かりなし`;
  }

  function getHouseholdPoolHolderSummary(balance = {}) {
    return [
      getHouseholdPoolBalanceLabel("husband", Number(balance.husband || 0)),
      getHouseholdPoolBalanceLabel("wife", Number(balance.wife || 0)),
    ].join(" / ");
  }

  function getSettlementFeatureContext() {
    return {
      state,
      els,
      currentYear,
      currentMonth,
      normalizeSettlementRules,
      normalizeHouseholdPoolConfig,
      getMonthsInRange,
      buildSettlementMonthPlan,
      getSettlementFamilyPayer,
      sumAmounts,
      formatCurrency,
      formatSignedCurrency,
      formatBalanceCurrency,
      getHouseholdPoolBalanceTone,
      getHouseholdPoolHolderSummary,
      getSettlementTransferDraft,
      getSettlementDirectionLabel,
      getTransferNetSummaryLabel,
      getSettlementPeriodRange,
      getCrossBurdenYearSummary,
      openSummaryDetailModal,
      setText,
      escapeHtml,
      switchTab,
      setSummaryViewMode,
      renderSummary,
      scrollToElementTop,
      todayISO,
      resetTransferForm,
      formatYearMonthLabel,
      showSyncToast,
    };
  }

  function buildSettlementReportForRange(startMonth, endMonth) {
    const feature = window.KakeiboSettlementFeature;
    if (feature?.buildSettlementReportForRange) {
      return feature.buildSettlementReportForRange(getSettlementFeatureContext(), startMonth, endMonth);
    }
    return null;
  }

  function buildSettlementReport() {
    const feature = window.KakeiboSettlementFeature;
    if (feature?.buildSettlementReport) {
      return feature.buildSettlementReport(getSettlementFeatureContext());
    }
    return null;
  }

  function buildSettlementProcessMarkup(report) {
    const feature = window.KakeiboSettlementFeature;
    if (feature?.buildSettlementProcessMarkup) {
      return feature.buildSettlementProcessMarkup(getSettlementFeatureContext(), report);
    }
    return "";
  }

  function renderSettlementReport() {
    const feature = window.KakeiboSettlementFeature;
    if (feature?.renderSettlementReport) {
      return feature.renderSettlementReport(getSettlementFeatureContext());
    }
  }

  function getMonthlyCloseRecord(monthKey) {
    const delegated = callMonthlyCloseFeature("getMonthlyCloseRecord", monthKey);
    if (delegated !== undefined) return delegated;
    return normalizeMonthlyCloseRecord(monthKey, {});
  }

  function buildMonthlyCloseContext(targetMonth) {
    const delegated = callMonthlyCloseFeature("buildMonthlyCloseContext", targetMonth);
    if (delegated !== undefined) return delegated;
    return {
      targetMonth,
      targetYear: String(targetMonth || currentMonth()).slice(0, 4) || currentYear(),
      status: "open",
      categoryIssues: [],
      unassignedIssues: [],
      settlementReport: null,
      settlementDraft: null,
      queueSummary: { categoryIssues: 0, unassignedBudgetIssues: 0, settlementOpen: false },
      snapshot: {
        coreVariableActual: 0,
        coreVariableForecast: 0,
        annualSpecialSpent: 0,
        settlementSuggestedDirection: "",
        settlementSuggestedAmount: 0,
      },
    };
  }

  function renderMonthlyCloseSection(targetMonth) {
    const delegated = callMonthlyCloseFeature("renderMonthlyCloseSection", targetMonth);
    if (delegated !== undefined) return delegated;
  }

  function collectMonthlyCloseNotesFromInputs() {
    const delegated = callMonthlyCloseFeature("collectMonthlyCloseNotesFromInputs");
    if (delegated !== undefined) return delegated;
    return { unexpectedItems: "", nextMonthActions: "", carryoverNotes: "" };
  }

  async function saveMonthlyCloseRecord() {
    const delegated = callMonthlyCloseFeature("saveMonthlyCloseRecord");
    if (delegated !== undefined) return delegated;
  }

  async function reopenMonthlyCloseRecord() {
    const delegated = callMonthlyCloseFeature("reopenMonthlyCloseRecord");
    if (delegated !== undefined) return delegated;
  }

  function openSettlementReportForMonth(monthKey) {
    const feature = window.KakeiboSettlementFeature;
    if (feature?.openSettlementReportForMonth) {
      return feature.openSettlementReportForMonth(getSettlementFeatureContext(), monthKey);
    }
  }

  function getSettlementTransferDraft(report) {
    const feature = window.KakeiboSettlementFeature;
    if (feature?.getSettlementTransferDraft) {
      return feature.getSettlementTransferDraft(report);
    }
    return null;
  }

  function getSettlementDirectionLabel(from, to) {
    if (!from || !to) return "差額なし";
    return `${from === "wife" ? "妻" : "夫"} → ${to === "wife" ? "妻" : "夫"}`;
  }

  function getTransferNetSummaryLabel(netTransferBalance) {
    if (netTransferBalance > 0) return `妻 → 夫 ${formatCurrency(Math.round(netTransferBalance))}`;
    if (netTransferBalance < 0) return `夫 → 妻 ${formatCurrency(Math.round(Math.abs(netTransferBalance)))}`;
    return "差額なし";
  }

  function applySettlementTransferDraftToForm() {
    const feature = window.KakeiboSettlementFeature;
    if (feature?.applySettlementTransferDraftToForm) {
      return feature.applySettlementTransferDraftToForm(getSettlementFeatureContext());
    }
  }

  function renderRecentMonthsSummary() {
    if (!els.listRecentMonthsSummary) return;
    const targetYear = els.summaryYear?.value || els.summaryMonth?.value?.slice(0, 4) || currentYear();
    if (hasSummaryDataRefreshError()) {
      els.listRecentMonthsSummary.innerHTML = `
        <div class="expense-card mini-summary-card">
          <span>年間の月次推移</span>
          <strong>要再読込</strong>
          <span class="muted small">${escapeHtml(state.sharedBootstrapError)}</span>
        </div>
      `;
      return;
    }
    if (isSummaryDataRefreshing()) {
      els.listRecentMonthsSummary.innerHTML = `
        <div class="expense-card mini-summary-card">
          <span>年間の月次推移</span>
          <strong>読込中</strong>
          <span class="muted small">${escapeHtml(getSummaryLoadingMessage())}</span>
        </div>
      `;
      return;
    }
    const majorGroupKeys = DASHBOARD_ANNUAL_MONTHLY_FOCUS_GROUP_KEYS.slice();
    const months = getYearMonthKeys(targetYear).map((monthKey) => {
      const monthItems = state.expensesLoaded
        ? state.expenses.filter((item) => String(item?.date || "").startsWith(monthKey) && isFamilySummaryExpense(item))
        : [];
      const actuals = buildDashboardGroupActuals(monthItems);
      return {
        month: monthKey,
        total: majorGroupKeys.reduce((sum, key) => sum + Number(actuals[key] || 0), 0),
      };
    });
    els.listRecentMonthsSummary.innerHTML = months.map((item) => {
      const monthKey = item.month;
      return `
        <button class="mini-summary-card mini-summary-button ${state.listMonthFilter === monthKey ? "active" : ""}" type="button" data-list-month="${escapeHtml(monthKey)}">
          <span>${escapeHtml(formatYearMonthLabel(monthKey))}</span>
          <strong>${escapeHtml(formatCurrency(item.total))}</strong>
        </button>
      `;
    }).join("");
    Array.from(els.listRecentMonthsSummary.querySelectorAll("[data-list-month]"))
      .forEach((button) => button.addEventListener("click", async () => {
        const monthKey = button.dataset.listMonth || "";
        if (!monthKey) return;
        await ensureAllExpensesLoaded({ silent: true });
        const monthItems = (Array.isArray(state.expenses) ? state.expenses : [])
          .filter(isFamilySummaryExpense)
          .filter((item) => String(item?.date || "").startsWith(monthKey))
          .filter((item) => majorGroupKeys.includes(getCategoryBudgetGroupKey(item?.category)));
        openSummaryDetailModal(
          `${formatYearMonthLabel(monthKey)} 主要項目の明細`,
          `${monthItems.length}件 / 合計 ${formatCurrency(sumAmounts(monthItems))}`,
          monthItems
        );
      }));
  }

  function clearListMonthFilter() {
    state.listMonthFilter = "";
    state.expenseListVisibleCount = EXPENSE_LIST_PAGE_SIZE;
    renderRecentMonthsSummary();
    loadExpenseListFromBackend({ reset: true, silent: true }).finally(() => renderExpenseList());
  }

  function getCategoryIntegrityScanItemsFromExpenses(expenses = state.expenses) {
    if (!Array.isArray(expenses) || !expenses.length) return [];
    const grouped = new Map();
    expenses.forEach((item) => {
      const rawCategory = String(item?.category || "").trim();
      if (!rawCategory) {
        const key = "__empty__";
        if (!grouped.has(key)) {
          grouped.set(key, {
            rawCategory: "",
            canonicalLabel: "未設定",
            count: 0,
            amount: 0,
            samples: [],
            records: [],
            reasons: new Set(["空欄"]),
            tone: "danger",
            recordType: "カテゴリ空欄",
          });
        }
        const row = grouped.get(key);
        row.count += 1;
        row.amount += getDashboardExpenseAmount(item);
        if (row.samples.length < 3) row.samples.push(item);
        row.records.push(item);
        return;
      }
      const normalizedLabel = normalizeCategoryLabel(rawCategory);
      const meta = getCategoryMetaByLabel(rawCategory) || getCategoryMetaByLabel(normalizedLabel);
      const canonicalLabel = meta?.label || normalizedLabel;
      const isLegacyAlias = normalizedLabel !== rawCategory;
      const isInactive = Boolean(meta && meta.active === false);
      const isUnknown = !meta;
      const hasNoBudgetGroup = Boolean(meta && !String(meta.budgetGroupKey || "").trim());
      const labelResolveFailed = !canonicalLabel || (canonicalLabel === rawCategory && !meta && !normalizedLabel);
      if (!isLegacyAlias && !isInactive && !isUnknown && !hasNoBudgetGroup && !labelResolveFailed) return;
      const key = `${canonicalLabel}__${rawCategory}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          rawCategory,
          canonicalLabel,
          count: 0,
          amount: 0,
          samples: [],
          records: [],
          reasons: new Set(),
          tone: isUnknown || labelResolveFailed ? "danger" : isInactive ? "watch" : "warning",
          recordType: isLegacyAlias
            ? "legacyカテゴリ"
            : isUnknown
              ? "カテゴリ未定義"
              : isInactive
                ? "legacyカテゴリ"
                : hasNoBudgetGroup
                  ? "予算グループ未接続"
                  : "表示解決失敗",
        });
      }
      const row = grouped.get(key);
      row.count += 1;
      row.amount += getDashboardExpenseAmount(item);
      if (row.samples.length < 3) row.samples.push(item);
      row.records.push(item);
      if (isLegacyAlias) row.reasons.add("旧表記");
      if (isInactive) row.reasons.add("非アクティブ");
      if (isUnknown) row.reasons.add("未登録");
      if (hasNoBudgetGroup) row.reasons.add("予算未設定");
      if (labelResolveFailed) row.reasons.add("表示失敗");
    });
    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        reasons: Array.from(row.reasons),
      }))
      .sort((a, b) => b.count - a.count || Math.abs(b.amount) - Math.abs(a.amount) || String(a.rawCategory || "").localeCompare(String(b.rawCategory || "")));
  }

  function getCategoryIntegrityScanItems() {
    if (!state.expensesLoaded) return [];
    return getCategoryIntegrityScanItemsFromExpenses(state.expenses);
  }

  function getCategoryIntegrityRecommendationText(item) {
    const rawCategory = String(item?.rawCategory || "");
    const canonicalLabel = String(item?.canonicalLabel || "");
    if (canonicalLabel === "日用品" && item?.recordType === "legacyカテゴリ") {
      return "日用品として再有効化し、選択肢に戻してください。";
    }
    if (rawCategory === "birth_medical_special" || rawCategory === "medical_birth_special" || rawCategory === "出産・妊婦健診医療" || rawCategory === "出産・妊婦健診系医療") {
      return "医療費へ統合してください（medical_regular）。";
    }
    switch (item?.recordType) {
      case "カテゴリ空欄":
        return "カテゴリを入力してください。";
      case "カテゴリ未定義":
        return "既存マスターのカテゴリへ置き換えるか、必要ならカテゴリマスターへ追加してください。";
      case "legacyカテゴリ":
        return "現行カテゴリへ置き換えると整合が取りやすくなります。";
      case "予算グループ未接続":
        return "categoryMasterConfig の budgetGroupKey を設定してください。";
      case "表示解決失敗":
        return "カテゴリ名またはコード表記を見直してください。";
      default:
        return "内容を確認してください。";
    }
  }

  function renderCategoryIntegrityScan() {
    if (!els.categoryIntegrityScanSummary || !els.categoryIntegrityScanResults) return;
    if (els.categoryIntegrityScanStatus && !state.categoryIntegrityScanStatus) {
      setCategoryIntegrityScanStatus("再スキャンすると、最新状態で件数を確認できます。", "idle");
    }
    if (!state.expensesLoaded) {
      els.categoryIntegrityScanSummary.innerHTML = `
        <span class="pill subtle">読み込み前</span>
        <span class="pill subtle">支出全件を読み込み中</span>
      `;
      els.categoryIntegrityScanResults.innerHTML = '<div class="expense-card"><span class="muted">カテゴリ不整合スキャンは、全期間の支出読み込み後に表示されます。</span></div>';
      return;
    }
    const issues = getCategoryIntegrityScanItems();
    state.categoryIntegrityScan = issues;
    state.categoryIntegrityScanSummary = `${state.expenses.length}件中 ${issues.length}カテゴリで不整合候補`;
    if (!issues.length) {
      els.categoryIntegrityScanSummary.innerHTML = `
        <span class="pill subtle">対象 ${escapeHtml(String(state.expenses.length))}件</span>
        <span class="pill subtle">不整合 0件</span>
      `;
      els.categoryIntegrityScanResults.innerHTML = '<div class="expense-card"><span class="muted">カテゴリ不整合は見つかりませんでした。</span></div>';
      return;
    }
    els.categoryIntegrityScanSummary.innerHTML = `
      <span class="pill subtle">対象 ${escapeHtml(String(state.expenses.length))}件</span>
      <span class="pill subtle">要確認 ${escapeHtml(String(issues.length))}カテゴリ</span>
    `;
    els.categoryIntegrityScanResults.innerHTML = issues.map((item) => {
      const targetCategory = item.canonicalLabel && state.categories.includes(item.canonicalLabel) ? item.canonicalLabel : "";
      const samples = item.samples.map((sample) => `
        <span class="pill subtle">${escapeHtml(sample.id || "")} / ${escapeHtml(sample.date || "")} / ${escapeHtml(sample.storeName || "")} / ${escapeHtml(formatCurrency(getDashboardExpenseAmount(sample)))}</span>
      `).join("");
      const allRecords = (item.records || []).map((record) => `
        <div class="search-integrity-record-row">
          <span class="search-integrity-record-id">${escapeHtml(record.id || "")}</span>
          <span>${escapeHtml(record.date || "")}</span>
          <span>${escapeHtml(record.storeName || "")}</span>
          <span>${escapeHtml(record.category || "未設定")}</span>
          <strong>${escapeHtml(formatCurrency(getDashboardExpenseAmount(record)))}</strong>
        </div>
      `).join("");
      const reasonLabel = item.reasons.length ? item.reasons.join("・") : "要確認";
      return `
        <article class="search-integrity-card">
          <div class="search-integrity-head">
            <div>
              <strong>${escapeHtml(item.recordType || "カテゴリ不整合")}</strong>
              <p class="muted small">${escapeHtml(item.rawCategory || "空欄")} → ${escapeHtml(item.canonicalLabel || "未設定")} / ${escapeHtml(reasonLabel)} / ${escapeHtml(formatCurrency(item.amount))}</p>
              <p class="muted small">推奨: ${escapeHtml(getCategoryIntegrityRecommendationText(item))}</p>
            </div>
            <span class="status-pill status-${escapeHtml(item.tone || "warning")}">${escapeHtml(item.recordType || (item.tone === "danger" ? "未登録" : item.tone === "watch" ? "非アクティブ" : "旧表記"))}</span>
          </div>
          <div class="search-integrity-samples">${samples}</div>
          <div class="expense-actions-row">
            <button class="ghost-button compact" type="button" data-scan-focus-category="${escapeHtml(targetCategory)}"${targetCategory ? "" : " disabled"}>検索で確認</button>
            <button class="ghost-button compact" type="button" data-scan-open-settings="true">設定を確認</button>
          </div>
          <div class="search-integrity-records">${allRecords}</div>
        </article>
      `;
    }).join("");
    els.categoryIntegrityScanResults.querySelectorAll("[data-scan-focus-category]").forEach((button) => {
      button.addEventListener("click", () => {
        const category = String(button.dataset.scanFocusCategory || "").trim();
        if (!category) return;
        openSearchTabForCategory(category);
      });
    });
    els.categoryIntegrityScanResults.querySelectorAll("[data-scan-open-settings]").forEach((button) => {
      button.addEventListener("click", () => switchTab("settings"));
    });
  }

  function bindExpenseCardEvents(container, items) {
    const delegated = callExpenseListFeature("bindExpenseCardEvents", container, items);
    if (delegated !== undefined) return delegated;
  }

  async function openReceiptStorageAsset(assetId) {
    const delegated = callExpenseListFeature("openReceiptStorageAsset", assetId);
    if (delegated !== undefined) return delegated;
  }

  function loadExpenseIntoForm(expense) {
    const delegated = callExpensesFeature("loadExpenseIntoForm", expense);
    if (delegated !== undefined) return delegated;
  }
  function renderExpenseCardHtml(item, options = {}) {
    const delegated = callExpenseListFeature("renderExpenseCardHtml", item, options);
    if (delegated !== undefined) return delegated;
    return "";
  }

  function paymentMethodLabel(item) {
    const delegated = callExpenseListFeature("paymentMethodLabel", item);
    if (delegated !== undefined) return delegated;
    return item?.paymentMethod || "";
  }

  function getPersonalExpenseLabel(code) {
    const delegated = callExpenseListFeature("getPersonalExpenseLabel", code);
    if (delegated !== undefined) return delegated;
    return PERSONAL_EXPENSE_LABELS[code || "family"] || PERSONAL_EXPENSE_LABELS.family;
  }

  function getNetAmountDisplayLabel(item) {
    const delegated = callExpenseListFeature("getNetAmountDisplayLabel", item);
    if (delegated !== undefined) return delegated;
    return "家計支出";
  }

  function getNetAmountBadgeClass(item) {
    const delegated = callExpenseListFeature("getNetAmountBadgeClass", item);
    if (delegated !== undefined) return delegated;
    return "";
  }

  function toYearMonth(date) {
    if (!date) return "";
    const text = String(date);
    return text.length >= 7 ? text.slice(0, 7) : text;
  }

  function makeStableCode(text, prefix) {
    const raw = String(text || "").trim().toLowerCase();
    const ascii = raw
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (ascii) return `${prefix}_${ascii}`;

    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = ((hash * 31) + raw.charCodeAt(i)) >>> 0;
    }
    return `${prefix}_${hash.toString(36) || "item"}`;
  }

  function getCategoryCode(category) {
    return getCategoryMetaByLabel(category)?.code || CATEGORY_CODE_MAP[category] || makeStableCode(category, "custom");
  }

  function getDashboardCategoryLabelByCode(code) {
    if (String(code || "") === "child_child_daily" || String(code || "") === "child_child_expense") return "日用品";
    if (String(code || "") === "birth_medical_special" || String(code || "") === "medical_birth_special") return "医療費";
    return getCategoryMetaByCode(code)?.label || CATEGORY_LABEL_BY_CODE[code] || code;
  }

  function getDashboardGroupLabel(groupKey) {
    return DASHBOARD_GROUP_LABELS[groupKey] || groupKey || "未設定";
  }

  function getDashboardMonthlyGroupKeys() {
    return DASHBOARD_MONTHLY_GROUP_DEFINITIONS.map((item) => item.key);
  }

  function getDashboardAnnualGroupKeys() {
    return DASHBOARD_ANNUAL_GROUP_DEFINITIONS.map((item) => item.key);
  }

  function getDashboardMonthlyFocusGroupKeys() {
    return DASHBOARD_MONTHLY_FOCUS_GROUP_KEYS.slice();
  }

  function getDashboardMonthlyReferenceGroupKeys() {
    const focus = new Set(DASHBOARD_MONTHLY_FOCUS_GROUP_KEYS);
    return getDashboardMonthlyGroupKeys().filter((key) => !focus.has(key));
  }

  function getDashboardExcludedAnnualGroupKeys() {
    return DASHBOARD_EXCLUDED_ANNUAL_GROUP_DEFINITIONS.map((item) => item.key);
  }

  function isFutureExpenseDate(dateValue) {
    const date = String(dateValue || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    return date > todayISO();
  }

  function getDashboardExpenseAmount(expense) {
    const netAmount = Number(expense?.netAmount);
    if (Number.isFinite(netAmount)) return netAmount;
    const amount = Number(expense?.amount);
    return Number.isFinite(amount) ? amount : 0;
  }

  function isFamilyDashboardExpense(expense) {
    const date = String(expense?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    if (isFutureExpenseDate(date)) return false;
    return String(expense?.personalExpense || "family") === "family";
  }

  function isFamilySummaryExpense(expense) {
    return String(expense?.personalExpense || "family") === "family";
  }

  function getDashboardBudgetConfig() {
    state.dashboardBudgetConfig = normalizeDashboardBudgetConfig(state.dashboardBudgetConfig);
    return state.dashboardBudgetConfig;
  }

  function getDashboardBudgetInputValue(element) {
    const rawValue = typeof element === "object" ? element?.value : element;
    const value = Number(rawValue);
    return Number.isFinite(value) ? Math.round(value) : 0;
  }

  function collectDashboardBudgetConfigFromInputs() {
    const currentConfig = getDashboardBudgetConfig();
    const monthlyBudgetGroups = {};
    const annualBudgetGroups = {};

    Array.from(els.dashboardBudgetMonthlyGroupList?.querySelectorAll("[data-budget-group-key]") || [])
      .forEach((input) => {
        const groupKey = String(input.dataset.budgetGroupKey || "").trim();
        if (!groupKey) return;
        monthlyBudgetGroups[groupKey] = getDashboardBudgetInputValue(input);
      });

    Array.from(els.dashboardBudgetAnnualGroupList?.querySelectorAll("[data-budget-group-key]") || [])
      .forEach((input) => {
        const groupKey = String(input.dataset.budgetGroupKey || "").trim();
        if (!groupKey) return;
        annualBudgetGroups[groupKey] = getDashboardBudgetInputValue(input);
      });

    return normalizeDashboardBudgetConfig({
      ...currentConfig,
      monthlyBudgetGroups,
      annualBudgetGroups,
    });
  }

  function renderDashboardBudgetForm() {
    const monthlyInputs = Array.from(els.dashboardBudgetMonthlyGroupList?.querySelectorAll("[data-budget-group-key]") || []);
    const annualInputs = Array.from(els.dashboardBudgetAnnualGroupList?.querySelectorAll("[data-budget-group-key]") || []);
    const shouldInitializeMonthly = Boolean(els.dashboardBudgetMonthlyGroupList)
      && (
        !monthlyInputs.length
        || monthlyInputs.length !== DASHBOARD_MONTHLY_GROUP_DEFINITIONS.length
        || monthlyInputs.some((input, index) => String(input.dataset.budgetGroupKey || "") !== String(DASHBOARD_MONTHLY_GROUP_DEFINITIONS[index]?.key || ""))
      );
    const shouldInitializeAnnual = Boolean(els.dashboardBudgetAnnualGroupList)
      && (
        !annualInputs.length
        || annualInputs.length !== DASHBOARD_ANNUAL_GROUP_DEFINITIONS.length
        || annualInputs.some((input, index) => String(input.dataset.budgetGroupKey || "") !== String(DASHBOARD_ANNUAL_GROUP_DEFINITIONS[index]?.key || ""))
      );

    if (shouldInitializeMonthly) {
      els.dashboardBudgetMonthlyGroupList.innerHTML = DASHBOARD_MONTHLY_GROUP_DEFINITIONS.map((group) => `
        <label class="input-group">
          <span>${escapeHtml(group.label)}</span>
          <input data-budget-group-key="${escapeHtml(group.key)}" type="number" min="-9999999" step="1" />
        </label>
      `).join("");
    }
    if (shouldInitializeAnnual) {
      els.dashboardBudgetAnnualGroupList.innerHTML = DASHBOARD_ANNUAL_GROUP_DEFINITIONS.map((group) => `
        <label class="input-group">
          <span>${escapeHtml(group.label)}</span>
          <input data-budget-group-key="${escapeHtml(group.key)}" type="number" min="-9999999" step="1" />
        </label>
      `).join("");
    }

    const configValue = (shouldInitializeMonthly || shouldInitializeAnnual)
      ? getDashboardBudgetConfig()
      : collectDashboardBudgetConfigFromInputs();

    if (els.dashboardBudgetExcludedList) {
      els.dashboardBudgetExcludedList.innerHTML = DASHBOARD_EXCLUDED_ANNUAL_GROUP_DEFINITIONS.length
        ? DASHBOARD_EXCLUDED_ANNUAL_GROUP_DEFINITIONS.map((group) => `
            <span class="pill subtle">${escapeHtml(group.label)}</span>
          `).join("")
        : "";
    }

    if (shouldInitializeMonthly) {
      Array.from(els.dashboardBudgetMonthlyGroupList?.querySelectorAll("[data-budget-group-key]") || [])
        .forEach((input) => {
          const groupKey = String(input.dataset.budgetGroupKey || "").trim();
          input.value = String(getDashboardBudgetGroupValue(configValue, "monthly", groupKey));
        });
    }

    if (shouldInitializeAnnual) {
      Array.from(els.dashboardBudgetAnnualGroupList?.querySelectorAll("[data-budget-group-key]") || [])
        .forEach((input) => {
          const groupKey = String(input.dataset.budgetGroupKey || "").trim();
          input.value = String(getDashboardBudgetGroupValue(configValue, "annual", groupKey));
        });
    }

    if (els.dashboardBudgetCoreTotal) {
      const monthlyTotal = getDashboardMonthlyGroupKeys()
        .reduce((sum, key) => sum + getDashboardBudgetGroupValue(configValue, "monthly", key), 0);
      els.dashboardBudgetCoreTotal.textContent = formatCurrency(monthlyTotal);
    }
    if (els.dashboardBudgetAnnualTotal) {
      const annualTotal = getDashboardAnnualGroupKeys()
        .reduce((sum, key) => sum + getDashboardBudgetGroupValue(configValue, "annual", key), 0);
      els.dashboardBudgetAnnualTotal.textContent = formatCurrency(annualTotal);
    }
    if (els.dashboardBudgetNote) {
      els.dashboardBudgetNote.textContent = "日用品は子供日常費を含む前提です。車ローンは契約返済額に合わせて、あとから手入力で上書きできます。";
    }
  }

  async function saveDashboardBudgetConfig() {
    const nextConfig = collectDashboardBudgetConfigFromInputs();
    state.dashboardBudgetConfig = nextConfig;
    renderDashboardBudgetForm();
    setText(els.dashboardBudgetMessage, "共有設定へ保存しています...");
    persist({ skipRemote: true });
    if (!canUseSharedStorage()) {
      setText(els.dashboardBudgetMessage, "ローカルに保存しました。Googleログイン後に共有設定へ反映できます。");
      renderSummary();
      return;
    }
    try {
      const result = await saveSharedSettingsFields({
        dashboardBudgetConfig: state.dashboardBudgetConfig,
      });
      if (!result?.ok) throw result?.error || new Error("shared settings save failed");
      setText(els.dashboardBudgetMessage, "共有設定を保存しました。");
      renderSummary();
    } catch (error) {
      console.error("Failed to save dashboard budget config", error);
      setText(els.dashboardBudgetMessage, "共有設定の保存に失敗しました。時間をおいてもう一度お試しください。");
    }
  }

  function getActualPayerEstimated(item) {
    const billingTarget = String(item?.billingTarget || "").trim();
    const paymentMethod = String(item?.paymentMethod || "").trim();
    if (billingTarget === "husband_card") return "husband";
    if (billingTarget === "wife_card") return "wife";
    if (billingTarget === "other") return "other";
    if (["husband_card", "husband_cash", "husband_other", "family_card"].includes(paymentMethod)) return "husband";
    if (["wife_card", "wife_cash", "wife_other"].includes(paymentMethod)) return "wife";
    if (paymentMethod === "other") return "other";
    return item?.payer || "";
  }

  function getSettlementBucket(item) {
    if (item.billingTarget === "other") return "exclude_other_billing";
    if (item.personalExpense === "husband") return "personal_husband";
    if (item.personalExpense === "wife") return "personal_wife";
    if (item.personalExpense === "child") return "child_child";
    return "family_shared";
  }

  function buildExpenseExportRows(expenses) {
    return [
      [
        "expense_id", "date", "year_month", "store_name", "amount",
        "category_label", "category_code", "payer_label", "payer_code",
        "payment_method_label", "payment_method_code", "billing_target_label",
        "billing_target_code", "is_family_card", "personal_expense_label",
        "personal_expense_code", "actual_payer_estimated", "settlement_bucket",
        "receipt_url", "receipt_file_id", "memo", "created_by", "created_at", "updated_at",
        "receipt_group_id", "receipt_line_index", "gross_amount", "point_credit", "net_amount", "serial_code",
        "source_type", "source_template_id", "source_template_label", "receipt_asset_count", "receipt_asset_urls", "receipt_asset_statuses",
      ],
      ...expenses.map((item) => {
        const receiptAssets = getReceiptAssets(item);
        return [
        item.id || "",
        item.date || "",
        toYearMonth(item.date),
        item.storeName || "",
        Number(item.amount) || 0,
        item.category || "",
        getCategoryCode(item.category),
        PAYER_LABELS[item.payer] || item.payer || "",
        item.payer || "",
        paymentMethodLabel(item),
        item.paymentMethod || "",
        BILLING_LABELS[item.billingTarget] || item.billingTarget || "",
        item.billingTarget || "",
        isFamilyCardExpense(item) ? "TRUE" : "FALSE",
        getPersonalExpenseLabel(item.personalExpense),
        item.personalExpense || "family",
        getActualPayerEstimated(item),
        getSettlementBucket(item),
        item.receiptUrl || "",
        item.receiptFileId || "",
        item.memo || "",
        item.createdBy || "",
        item.createdAt || "",
        item.updatedAt || "",
        item.receiptGroupId || "",
        item.receiptLineIndex || "",
        Number(item.grossAmount ?? item.amount) || 0,
        Number(item.pointCredit) || 0,
        Number(item.amount) || 0,
        item.serialCode || "",
        item.sourceType || "",
        item.sourceTemplateId || "",
        item.sourceTemplateLabel || "",
        receiptAssets.length,
        receiptAssets.map((asset) => asset.driveUrl || asset.storageUrl || "").filter(Boolean).join("\n"),
        receiptAssets.map((asset) => asset.status || "").filter(Boolean).join("\n"),
      ];
      }),
    ];
  }

  function buildCodebookRows(categories) {
    const rows = [["domain", "code", "label", "description"]];

    Object.entries(PAYER_LABELS).forEach(([code, label]) => {
      rows.push(["payer", code, label, "支払者コード"]);
    });
    PAYMENT_METHOD_CODEBOOK.forEach((item) => {
      rows.push(["payment_method", item.value, item.label, "支払い手段コード"]);
    });
    Object.entries(BILLING_LABELS).forEach(([code, label]) => {
      rows.push(["billing_target", code, label, "請求先コード"]);
    });
    Object.entries(PERSONAL_EXPENSE_LABELS).forEach(([code, label]) => {
      rows.push(["personal_expense", code, label, "負担区分コード"]);
    });
    Object.entries(TRANSFER_TYPE_LABELS).forEach(([code, label]) => {
      rows.push(["transfer_type", code, label, "送金種別"]);
    });
    Object.entries(TRANSFER_SETTLEMENT_SCOPE_LABELS).forEach(([code, label]) => {
      rows.push(["transfer_settlement_scope", code, label, "送金の扱い"]);
    });
    Object.entries(CHILD_KIND_LABELS).forEach(([code, label]) => {
      rows.push(["child_kind", code, label, "子供入出金種別"]);
    });
    getCategoryMasterEntries().forEach((entry) => {
      rows.push(["category", entry.code, entry.label, `bucket=${entry.bucket} / budget=${entry.budgetMode} / scope=${entry.settlementScope}`]);
    });
    [
      ["family_shared", "家計共通", "家計費として夫婦集計"],
      ["personal_husband", "夫個人", "夫個人費"],
      ["personal_wife", "妻個人", "妻個人費"],
      ["child_child", "子供", "子供向け別財布"],
      ["exclude_other_billing", "請求先その他除外", "請求先その他で精算対象外"],
    ].forEach(([code, label, description]) => {
      rows.push(["settlement_bucket", code, label, description]);
    });

    return rows;
  }

  function buildMonthlySummaryRows(expenses) {
    const summary = new Map();
    expenses.forEach((item) => {
      const yearMonth = toYearMonth(item.date);
      const actualPayer = getActualPayerEstimated(item);
      const bucket = getSettlementBucket(item);
      const key = `${yearMonth}__${actualPayer}__${bucket}`;
      if (!summary.has(key)) {
        summary.set(key, {
          yearMonth,
          actualPayerEstimated: actualPayer,
          settlementBucket: bucket,
          expenseCount: 0,
          amountTotal: 0,
        });
      }
      const entry = summary.get(key);
      entry.expenseCount += 1;
      entry.amountTotal += Number(item.amount) || 0;
    });

    const rows = [["year_month", "actual_payer_estimated", "settlement_bucket", "expense_count", "amount_total"]];
    return rows.concat(
      [...summary.values()]
        .sort((a, b) => {
          if (a.yearMonth !== b.yearMonth) return a.yearMonth.localeCompare(b.yearMonth);
          if (a.actualPayerEstimated !== b.actualPayerEstimated) return a.actualPayerEstimated.localeCompare(b.actualPayerEstimated);
          return a.settlementBucket.localeCompare(b.settlementBucket);
        })
        .map((entry) => [
          entry.yearMonth,
          entry.actualPayerEstimated,
          entry.settlementBucket,
          entry.expenseCount,
          entry.amountTotal,
        ])
    );
  }

  function buildSettlementRuleRows() {
    const rules = normalizeSettlementRules(state.settlementRules);
    return [
      ["section", "key", "value"],
      ["monthlyContribution", "husband", rules.monthlyContribution.husband],
      ["monthlyContribution", "wife", rules.monthlyContribution.wife],
      ["bonusContribution", "husband_06", rules.bonusContribution.husband["06"]],
      ["bonusContribution", "husband_12", rules.bonusContribution.husband["12"]],
      ["bonusContribution", "wife_06", rules.bonusContribution.wife["06"]],
      ["bonusContribution", "wife_12", rules.bonusContribution.wife["12"]],
      ...Object.entries(rules.monthlyOverrides || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([monthKey, row]) => ([
          ["monthlyOverride", `${monthKey}_husband`, Number(row?.husband || 0)],
          ["monthlyOverride", `${monthKey}_wife`, Number(row?.wife || 0)],
        ])),
      ["rule", "familyCardOwner", rules.familyCardOwner],
      ["rule", "includeTransfersInSettlement", rules.includeTransfersInSettlement ? "TRUE" : "FALSE"],
      ["rule", "notes", rules.notes || ""],
    ];
  }



  function buildSettlementReportRows() {
    const report = buildSettlementReport();
    return [
      ["section", "label", "value1", "value2", "value3", "value4", "value5"],
      ["household", "husband", report.summary.husband.target, report.summary.husband.directPayments, report.summary.husband.householdDelta, "", ""],
      ["household", "wife", report.summary.wife.target, report.summary.wife.directPayments, report.summary.wife.householdDelta, "", ""],
      ["pool", "husband", report.poolSummary.opening.husband, report.poolSummary.assumedContribution.husband, report.poolSummary.temporaryIncome.husband, report.poolSummary.directPayments.husband, report.poolSummary.currentBalance.husband],
      ["pool", "wife", report.poolSummary.opening.wife, report.poolSummary.assumedContribution.wife, report.poolSummary.temporaryIncome.wife, report.poolSummary.directPayments.wife, report.poolSummary.currentBalance.wife],
      ["pool", "total", report.poolSummary.opening.total, report.poolSummary.assumedContribution.total, report.poolSummary.temporaryIncome.total, report.poolSummary.directPayments.total, report.poolSummary.currentBalance.total],
      ["household_pool_transfer", "husband_to_wife_total", report.poolTransferSummary.husbandToWifeTotal, "", "", "", ""],
      ["household_pool_transfer", "wife_to_husband_total", report.poolTransferSummary.wifeToHusbandTotal, "", "", "", ""],
      ["household_pool_transfer", "net_transfer_balance", report.poolTransferSummary.netTransferBalance, "", "", "", ""],
      ["private_lending_transfer", "husband_to_wife_total", report.privateTransferSummary?.husbandToWifeTotal || 0, "", "", "", ""],
      ["private_lending_transfer", "wife_to_husband_total", report.privateTransferSummary?.wifeToHusbandTotal || 0, "", "", "", ""],
      ["private_lending_transfer", "net_transfer_balance", report.privateTransferSummary?.netTransferBalance || 0, "", "", "", ""],
      ["final", "direction", report.finalSettlement.from, report.finalSettlement.to, report.finalSettlement.amount, "", ""],
      [],
      ["meta", "start_month", report.startMonth],
      ["meta", "end_month", report.endMonth],
      ["meta", "family_expense_total", report.familyExpenseTotal],
      ["meta", "temporary_income_total", report.poolSummary.temporaryIncome.total],
      ["meta", "pool_holder_summary", getHouseholdPoolHolderSummary(report.poolSummary.currentBalance)],
      ["meta", "household_settlement_description", report.householdSettlement.description],
      ["meta", "final_recommendation", report.recommendation],
    ];
  }

  function buildTransferExportRows(transfers) {
    return [
      [
        "date", "from_person", "to_person", "amount", "memo",
        "transfer_type", "settlement_scope", "transfer_id", "created_by", "created_at", "updated_at", "serial_code",
      ],
      ...transfers.map((item) => [
        item.date || "",
        PAYER_LABELS[item.fromPerson] || item.fromPerson || "",
        PAYER_LABELS[item.toPerson] || item.toPerson || "",
        Number(item.amount) || 0,
        item.memo || "",
        item.type || "",
        normalizeTransferSettlementScope(item.settlementScope),
        item.id || "",
        item.createdBy || "",
        item.createdAt || "",
        item.updatedAt || "",
        item.serialCode || "",
      ]),
    ];
  }

  function buildChildTransactionExportRows(records) {
    return [
      [
        "child_transaction_id", "date", "kind_label", "kind_code", "source_or_from",
        "holder_label", "holder_code", "amount", "memo", "created_by", "created_at", "updated_at", "serial_code",
      ],
      ...records.map((item) => [
        item.id || "",
        item.date || "",
        CHILD_KIND_LABELS[item.kind] || item.kind || "",
        item.kind || "",
        item.sourceOrFrom || "",
        PAYER_LABELS[item.holder] || item.holder || "",
        item.holder || "",
        Number(item.amount) || 0,
        item.memo || "",
        item.createdBy || "",
        item.createdAt || "",
        item.updatedAt || "",
        item.serialCode || "",
      ]),
    ];
  }

  function buildHouseholdIncomeExportRows(records) {
    return [
      [
        "household_income_id", "date", "kind_label", "kind_code", "source_name",
        "holder_label", "holder_code", "amount", "memo", "created_by", "created_at", "updated_at", "serial_code",
      ],
      ...records.map((item) => [
        item.id || "",
        item.date || "",
        HOUSEHOLD_INCOME_KIND_LABELS[item.kind] || item.kind || "",
        item.kind || "",
        item.sourceName || "",
        PAYER_LABELS[item.holder] || item.holder || "",
        item.holder || "",
        Number(item.amount) || 0,
        item.memo || "",
        item.createdBy || "",
        item.createdAt || "",
        item.updatedAt || "",
        item.serialCode || "",
      ]),
    ];
  }

  function filterAuxiliaryRecordsByDate(records, startDate, endDate) {
    return (records || []).filter((item) => {
      if (startDate && item.date < startDate) return false;
      if (endDate && item.date > endDate) return false;
      return true;
    });
  }

  function filterRecordsByMonthRange(records, startMonth, endMonth) {
    return [...(records || [])]
      .filter((item) => {
        const recordMonth = String(item?.date || "").slice(0, 7);
        if (!recordMonth) return false;
        if (startMonth && recordMonth < startMonth) return false;
        if (endMonth && recordMonth > endMonth) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function getFilteredTransfers() {
    return filterRecordsByMonthRange(
      state.transfers,
      els.transferFilterStartMonth?.value || "",
      els.transferFilterEndMonth?.value || ""
    );
  }

  function getFilteredChildTransactions() {
    return filterRecordsByMonthRange(
      state.childTransactions,
      els.childFilterStartMonth?.value || "",
      els.childFilterEndMonth?.value || ""
    );
  }

  function buildRangeSummaryText(label, count, startMonth, endMonth) {
    if (!startMonth && !endMonth) {
      return `全期間の${label}を表示しています（${count}件）。`;
    }
    const startLabel = startMonth ? formatYearMonthLabel(startMonth) : "最初";
    const endLabel = endMonth ? formatYearMonthLabel(endMonth) : "最新";
    return `${startLabel}〜${endLabel}の${label}を表示しています（${count}件）。`;
  }

  function getTransferYearDirectionSummary(year, settlementScope = "") {
    const rows = {
      husbandToWife: 0,
      wifeToHusband: 0,
    };
    state.transfers.forEach((item) => {
      if (!String(item.date || "").startsWith(year)) return;
      if (settlementScope && normalizeTransferSettlementScope(item.settlementScope) !== settlementScope) return;
      const amount = Number(item.amount || 0);
      if (!amount) return;
      if (item.fromPerson === "husband" && item.toPerson === "wife") {
        rows.husbandToWife += amount;
      } else if (item.fromPerson === "wife" && item.toPerson === "husband") {
        rows.wifeToHusband += amount;
      }
    });
    return rows;
  }

  function buildMiniSummaryCard(title, values) {
    return `
      <div class="mini-summary-card">
        <span>${escapeHtml(title)}</span>
        <strong>夫→妻 ${escapeHtml(formatCurrency(values.husbandToWife || 0))}</strong>
        <small>妻→夫 ${escapeHtml(formatCurrency(values.wifeToHusband || 0))}</small>
      </div>
    `;
  }

  function getRecentMonthKeys(count) {
    const today = new Date();
    const keys = [];
    for (let index = count - 1; index >= 0; index -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
      keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    }
    return keys;
  }

  function getYearMonthKeys(year) {
    return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  }

  function formatYearMonthLabel(value) {
    if (!/^\d{4}-\d{2}$/.test(String(value || ""))) return String(value || "");
    const [year, month] = String(value).split("-");
    return `${year}年${Number(month)}月`;
  }

  function collectExportYears() {
    const years = new Set([currentYear()]);
    [...state.expenses, ...state.transfers, ...state.childTransactions, ...state.householdIncomes].forEach((item) => {
      const date = String(item?.date || "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) years.add(date.slice(0, 4));
    });
    return [...years].sort((a, b) => b.localeCompare(a));
  }

  function renderSummaryYearOptions() {
    if (!els.summaryYear) return;
    const current = els.summaryYear.value;
    const years = collectTimelineYears();
    applySummaryMonthBounds(years);
    els.summaryYear.innerHTML = years
      .map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}年</option>`)
      .join("");
    if (current && years.includes(current)) {
      els.summaryYear.value = current;
    } else if (els.summaryMonth?.value && years.includes(els.summaryMonth.value.slice(0, 4))) {
      els.summaryYear.value = els.summaryMonth.value.slice(0, 4);
    } else if (years.includes(currentYear())) {
      els.summaryYear.value = currentYear();
    } else if (years.length) {
      els.summaryYear.value = years[0];
    }
  }

  function collectTimelineYears() {
    const years = new Set([currentYear()]);
    const addDateYear = (date) => {
      const value = String(date || "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) years.add(value.slice(0, 4));
    };
    (Array.isArray(state.expenses) ? state.expenses : []).forEach((item) => addDateYear(item?.date));
    (Array.isArray(state.transfers) ? state.transfers : []).forEach((item) => addDateYear(item?.date));
    (Array.isArray(state.householdIncomes) ? state.householdIncomes : []).forEach((item) => addDateYear(item?.date));
    const openingBalances = state.householdPoolConfig?.openingBalances || {};
    Object.keys(openingBalances).forEach((year) => {
      if (/^\d{4}$/.test(String(year || ""))) years.add(String(year));
    });
    const monthlyOverrides = state.settlementRules?.monthlyOverrides || {};
    Object.keys(monthlyOverrides).forEach((monthKey) => {
      if (/^\d{4}-\d{2}$/.test(String(monthKey || ""))) years.add(String(monthKey).slice(0, 4));
    });
    return [...years]
      .filter((year) => /^\d{4}$/.test(String(year || "")))
      .sort((a, b) => b.localeCompare(a));
  }

  function applySummaryMonthBounds(years = collectTimelineYears()) {
    if (!els.summaryMonth || !Array.isArray(years) || !years.length) return;
    const sorted = [...years].sort((a, b) => a.localeCompare(b));
    const minYear = sorted[0] || currentYear();
    const maxYear = sorted[sorted.length - 1] || currentYear();
    els.summaryMonth.min = `${minYear}-01`;
    els.summaryMonth.max = `${maxYear}-12`;
  }

  function getYearRange(year) {
    if (!year) return { startDate: "", endDate: "" };
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };
  }

  async function exportSelectedYearToXlsx() {
    if (canUseSharedStorage() && !state.expensesLoaded) {
      const loaded = await ensureAllExpensesLoaded({ silent: true });
      if (!loaded) {
        setMessageState(els.exportMessage, "XLSX出力用の全期間データ取得に失敗しました。", "error");
        return;
      }
      renderExportYearOptions();
    }
    // プルダウンの選択に関わらず、常に全期間（全データ）のエクスポートを行う
    const expenses = state.expenses || [];
    exportExpensesToXlsx(expenses, makeExportFileName("all"), { startDate: "", endDate: "" });
    if (els.exportMessage) {
      setMessageState(els.exportMessage, "全期間のXLSXを出力しました。", "success");
    }
  }

  function filterExpenses() {
    return [...state.expenses].filter((item) => {
      const keyword = els.filterKeyword?.value?.trim().toLowerCase() || "";
      if (keyword) {
        const haystack = [
          item.storeName,
          item.memo,
          item.category,
          item.otherPaymentMethod,
          paymentMethodLabel(item),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      if (els.filterStartDate.value && item.date < els.filterStartDate.value) return false;
      if (els.filterEndDate.value && item.date > els.filterEndDate.value) return false;
      if (els.filterStore.value && !item.storeName.toLowerCase().includes(els.filterStore.value.toLowerCase())) return false;
      if (els.filterCategory.value && !doesExpenseCategoryMatchFilter(item, els.filterCategory.value)) return false;
      if (els.filterPayer.value && item.payer !== els.filterPayer.value) return false;
      if (els.filterPaymentMethod.value && item.paymentMethod !== els.filterPaymentMethod.value) return false;
      if (els.filterFamilyCard.value) {
        const expected = els.filterFamilyCard.value === "true";
        if (isFamilyCardExpense(item) !== expected) return false;
      }
      return true;
    }).sort(compareExpensesForDisplay);
  }

  function doesExpenseCategoryMatchFilter(item, selectedCategory) {
    const selectedLabel = normalizeCategoryLabel(selectedCategory);
    const itemLabel = normalizeCategoryLabel(item?.category);
    if (!selectedLabel) return true;
    if (itemLabel === selectedLabel) return true;
    const selectedMeta = getCategoryMetaByLabel(selectedLabel) || getCategoryMetaByCode(selectedLabel);
    const itemMeta = getCategoryMetaByLabel(itemLabel) || getCategoryMetaByCode(itemLabel);
    const selectedCode = selectedMeta?.code || normalizeCategoryCode(selectedCategory, selectedLabel);
    const itemCode = item?.categoryCode || itemMeta?.code || normalizeCategoryCode(item?.category, itemLabel);
    if (selectedCode && itemCode && selectedCode === itemCode) return true;
    const selectedGroup = selectedMeta?.budgetGroupKey || "";
    const itemGroup = item?.budgetGroupKey || itemMeta?.budgetGroupKey || "";
    return Boolean(selectedGroup && itemGroup && selectedGroup === itemGroup);
  }

  function exportExpensesToXlsx(expenses, fileName, options = {}) {
    // 支出を含むすべてのシートで、年指定で絞り込まず常に全期間（stateの全件）を出力してデータ全量を保証する
    const allExpenses = state.expenses || [];
    const transfers = state.transfers || [];
    const childTransactions = state.childTransactions || [];
    const householdIncomes = state.householdIncomes || [];
    const blob = buildXlsxBlob([
      { name: "expenses_import", rows: buildExpenseExportRows(allExpenses) },
      { name: "codebook", rows: buildCodebookRows(state.categories) },
      { name: "summary_monthly", rows: buildMonthlySummaryRows(allExpenses) },
      { name: "settlement_rules", rows: buildSettlementRuleRows() },
      { name: "settlement_report", rows: buildSettlementReportRows() },
      { name: "txn_transfers", rows: buildTransferExportRows(transfers) },
      { name: "household_incomes", rows: buildHouseholdIncomeExportRows(householdIncomes) },
      { name: "child_transactions", rows: buildChildTransactionExportRows(childTransactions) },
    ]);
    downloadBlob(blob, fileName);
  }

  async function exportAllDataToCsvZip() {
    if (canUseSharedStorage() && !state.expensesLoaded) {
      const loaded = await ensureAllExpensesLoaded({ silent: true });
      if (!loaded) {
        setMessageState(els.exportMessage, "CSV ZIP出力用の全期間データ取得に失敗しました。", "error");
        return;
      }
      renderExportYearOptions();
    }
    const allExpenses = state.expenses || [];
    const transfers = state.transfers || [];
    const childTransactions = state.childTransactions || [];
    const householdIncomes = state.householdIncomes || [];

    const sheets = [
      { name: "expenses_import", rows: buildExpenseExportRows(allExpenses) },
      { name: "codebook", rows: buildCodebookRows(state.categories) },
      { name: "summary_monthly", rows: buildMonthlySummaryRows(allExpenses) },
      { name: "settlement_rules", rows: buildSettlementRuleRows() },
      { name: "settlement_report", rows: buildSettlementReportRows() },
      { name: "txn_transfers", rows: buildTransferExportRows(transfers) },
      { name: "household_incomes", rows: buildHouseholdIncomeExportRows(householdIncomes) },
      { name: "child_transactions", rows: buildChildTransactionExportRows(childTransactions) },
    ];

    const files = sheets.map(sheet => {
      const csvContent = convertRowsToCsvString(sheet.rows);
      return {
        name: `${sheet.name}.csv`,
        content: csvContent
      };
    });

    const blob = createCsvZipBlob(files);
    const fileName = makeExportFileName("csv-all").replace(".xlsx", ".zip");
    downloadBlob(blob, fileName);

    if (els.exportMessage) {
      setMessageState(els.exportMessage, "全データCSV ZIPを出力しました。", "success");
    }
  }

  function convertRowsToCsvString(rows) {
    const csvRows = rows.map((row) => {
      return row.map((val) => {
        const text = (val === null || val === undefined) ? "" : String(val);
        const escaped = text.replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(",");
    });
    // BOM付きのCSV文字列とするために、UnicodeのBOM文字「\uFEFF」を先頭に付加
    return "\uFEFF" + csvRows.join("\r\n");
  }

  function createCsvZipBlob(files) {
    const encoder = new TextEncoder();
    const crcTable = makeCrcTable();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const contentBytes = encoder.encode(file.content);
      const crc = crc32(contentBytes, crcTable);
      const localHeader = createLocalHeader(nameBytes, crc, contentBytes.length);
      const centralHeader = createCentralHeader(nameBytes, crc, contentBytes.length, offset);

      localParts.push(localHeader, nameBytes, contentBytes);
      centralParts.push(centralHeader, nameBytes);
      offset += localHeader.length + nameBytes.length + contentBytes.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endRecord = createEndRecord(files.length, centralSize, offset);
    return new Blob([...localParts, ...centralParts, endRecord], {
      type: "application/zip",
    });
  }

  function buildXlsxBlob(sheets) {
    const safeSheets = sheets.map((sheet, index) => ({
      name: sanitizeWorksheetName(sheet?.name || `sheet${index + 1}`),
      rows: Array.isArray(sheet?.rows) && sheet.rows.length ? sheet.rows : [[""]],
    }));
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${safeSheets.map((sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n  ")}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${safeSheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`;

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${safeSheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("\n  ")}
  <Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Yu Gothic"/></font>
    <font><b/><sz val="11"/><name val="Yu Gothic"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    const now = new Date().toISOString();
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;

    const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Household Ledger</Application>
  <TitlesOfParts>
    <vt:vector size="${safeSheets.length}" baseType="lpstr">
      ${safeSheets.map((sheet) => `<vt:lpstr>${escapeXml(sheet.name)}</vt:lpstr>`).join("")}
    </vt:vector>
  </TitlesOfParts>
</Properties>`;

    const sheetFiles = safeSheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: buildWorksheetXml(sheet.rows),
    }));
    return createZipBlob([
      { name: "[Content_Types].xml", content: contentTypes },
      { name: "_rels/.rels", content: rels },
      { name: "docProps/core.xml", content: core },
      { name: "docProps/app.xml", content: app },
      { name: "xl/workbook.xml", content: workbook },
      { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
      { name: "xl/styles.xml", content: styles },
      ...sheetFiles,
    ]);
  }

  function buildWorksheetXml(rows) {
    const normalizedRows = rows.length ? rows : [[""]];
    const cols = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0) || 1;
    const widths = Array.from({ length: cols }, (_, index) => {
      const longest = normalizedRows.reduce((max, row) => {
        const value = row[index];
        return Math.max(max, String(value ?? "").length);
      }, 0);
      return Math.min(Math.max(longest + 2, 12), 36);
    });
    const colDefs = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const rowXml = normalizedRows.map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const ref = `${columnLetter(columnIndex + 1)}${rowIndex + 1}`;
        const style = rowIndex === 0 ? " s=\"1\"" : "";
        if (typeof value === "number") {
          return `<c r="${ref}"${style}><v>${value}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${colDefs}</cols>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
  }

  function sanitizeWorksheetName(name) {
    const safe = String(name || "")
      .replace(/[\\/*?:\[\]]/g, "_")
      .slice(0, 31)
      .trim();
    return safe || "sheet";
  }
  function createZipBlob(files) {
    const encoder = new TextEncoder();
    const crcTable = makeCrcTable();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const contentBytes = encoder.encode(file.content);
      const crc = crc32(contentBytes, crcTable);
      const localHeader = createLocalHeader(nameBytes, crc, contentBytes.length);
      const centralHeader = createCentralHeader(nameBytes, crc, contentBytes.length, offset);

      localParts.push(localHeader, nameBytes, contentBytes);
      centralParts.push(centralHeader, nameBytes);
      offset += localHeader.length + nameBytes.length + contentBytes.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endRecord = createEndRecord(files.length, centralSize, offset);
    return new Blob([...localParts, ...centralParts, endRecord], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  function createLocalHeader(nameBytes, crc, size) {
    const buffer = new ArrayBuffer(30);
    const view = new DataView(buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    return new Uint8Array(buffer);
  }

  function createCentralHeader(nameBytes, crc, size, offset) {
    const buffer = new ArrayBuffer(46);
    const view = new DataView(buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset, true);
    return new Uint8Array(buffer);
  }

  function createEndRecord(count, centralSize, centralOffset) {
    const buffer = new ArrayBuffer(22);
    const view = new DataView(buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, count, true);
    view.setUint16(10, count, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true);
    return new Uint8Array(buffer);
  }

  function makeCrcTable() {
    const table = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  }

  function crc32(bytes, table) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < bytes.length; i += 1) {
      crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function makeExportFileName(suffix) {
    return `household-ledger-${suffix}-${todayCompact()}.xlsx`;
  }

  function sumAmounts(items) {
    return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  function formatCurrency(value) {
    return window.KakeiboCore.formatCurrency(value);
  }

  function formatSignedCurrency(value) {
    return window.KakeiboCore.formatSignedCurrency(value);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。ファイルが壊れているか、対応していない形式の可能性があります。"));
      reader.readAsDataURL(file);
    });
  }

  function currentMonth() {
    return window.KakeiboCore.currentMonth();
  }

  function currentYear() {
    return window.KakeiboCore.currentYear();
  }

  function previousYear() {
    return window.KakeiboCore.previousYear();
  }

  function nextYear() {
    return window.KakeiboCore.nextYear();
  }

  function todayISO() {
    return window.KakeiboCore.todayISO();
  }

  function todayCompact() {
    return window.KakeiboCore.todayCompact();
  }

  function getTokyoDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      isoDate: `${values.year}-${values.month}-${values.day}`,
      compactDate: `${values.year}${values.month}${values.day}`,
    };
  }

  function columnLetter(index) {
    let value = "";
    let current = index;
    while (current > 0) {
      const mod = (current - 1) % 26;
      value = String.fromCharCode(65 + mod) + value;
      current = Math.floor((current - mod) / 26);
    }
    return value;
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeXml(text) {
    return escapeHtml(text)
      .replaceAll("\n", "&#10;")
      .replaceAll("\r", "&#13;");
  }

  function setText(element, text) {
    if (!element) return;
    if (element.classList?.contains("message")) {
      element.classList.remove("is-pending", "is-success", "is-warning", "is-error", "is-muted");
    }
    element.textContent = text;
  }

  function setMessageState(element, text, tone = "info") {
    if (!element) return;
    setText(element, text);
    element.classList.remove("is-pending", "is-success", "is-warning", "is-error", "is-muted");
    if (!String(text || "").trim()) return;
    const normalizedTone = ["pending", "success", "warning", "error", "muted"].includes(tone) ? tone : "";
    if (normalizedTone) {
      element.classList.add(`is-${normalizedTone}`);
    }
  }

  function markAiField(field) {
    const group = field?.closest(".input-group");
    if (group) group.classList.add("ai-highlight");
  }

  function clearAiHighlights() {
    document.querySelectorAll(".input-group.ai-highlight").forEach((group) => {
      group.classList.remove("ai-highlight");
    });
  }

  function clearAiHighlightFromEvent(event) {
    const group = event.target?.closest(".input-group");
    if (group?.classList.contains("ai-highlight")) {
      group.classList.remove("ai-highlight");
    }
  }

  function truncateText(text, maxLength = 30) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength)}...`;
  }

  function loadReceiptQueueItem(idx, options = {}) {
    if (idx < 0 || idx >= state.receiptQueue.length) return;
    const file = state.receiptQueue[idx];
    const isPdf = String(file?.type || "").toLowerCase().includes("pdf") || /\.pdf$/i.test(String(file?.name || ""));
    const previewHint = els.receiptPreviewContainer?.querySelector("p");
    state.receiptQueueIndex = idx;
      state.receiptDraft.file = file;
      state.receiptDraft.previewUrl = "";
      state.receiptDraft.aiResult = null;
      state.receiptDraft.aiSource = "";
      state.receiptDraft.storageAssetId = "";
      state.receiptDraft.storageUploadedAt = "";
      state.receiptDraft.storageStatus = "";
      state.receiptDraft.driveFileId = "";
    state.receiptDraft.driveUrl = "";
    state.receiptDraft.uploaderName = "";
    state.receiptDraft.uploadedAt = "";
    state.receiptDraft.uploadStatus = "";
    const reader = new FileReader();
    reader.onload = (e) => {
      state.receiptDraft.previewUrl = isPdf ? "" : e.target.result;
      if (isPdf) {
        els.receiptPreview.removeAttribute("src");
        els.receiptPreview.classList.add("hidden");
        if (previewHint) previewHint.textContent = `${file.name || "PDF"} を読み込みました。内容を読み取るには「Gemini AI解析」を押してください。`;
      } else {
        if (previewHint) previewHint.textContent = "";
        els.receiptPreview.src = state.receiptDraft.previewUrl;
        els.receiptPreview.classList.remove("hidden");
      }
      els.receiptPreviewContainer.classList.remove("hidden");
      els.receiptPreviewContainer.classList.remove("empty");
      renderReceiptQueue();
      renderReceiptLinkedInfo();
      if (options.autoAnalyze === true) {
        startReceiptImageAutomation({
          message: isPdf
            ? "PDFを読み込みました。内容を読み取っています。"
            : "画像を読み込みました。内容を読み取っています。",
        });
      }
    };
    reader.readAsDataURL(file);
    setText(els.receiptMessage, "");
    els.aiSuggestionBox.classList.add("hidden");
  }

  function renderReceiptQueue() {
    const el = document.getElementById("receiptQueueContainer");
    if (!el) return;
    if (state.receiptQueue.length <= 1) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const chips = state.receiptQueue.map((f, i) => {
      const cls = i === state.receiptQueueIndex ? " active" : "";
      return '<button type="button" class="queue-chip' + cls + '" data-qi="' + i + '">' + (i + 1) + '</button>';
    }).join("");
    el.innerHTML = '<div class="queue-bar"><span class="queue-label">📎 ' + (state.receiptQueueIndex + 1) + ' / ' + state.receiptQueue.length + '</span>' + chips + '</div>';
    el.querySelectorAll(".queue-chip").forEach(function(btn) {
      btn.addEventListener("click", function() { loadReceiptQueueItem(Number(btn.dataset.qi), { autoAnalyze: false }); });
    });
  }

})();

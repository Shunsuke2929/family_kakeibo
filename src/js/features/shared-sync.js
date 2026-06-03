(function registerKakeiboSharedSyncFeature(global) {
  function getRecordConflictMessage(collectionKey, action) {
    const label = collectionKey === "expenses"
      ? "支出"
      : collectionKey === "transfers"
        ? "送金"
        : collectionKey === "childTransactions"
          ? "子供入出金"
          : collectionKey === "householdIncomes"
            ? "家計臨時入金"
            : "データ";
    const actionLabel = action === "delete" ? "削除" : "上書き保存";
    return `他の端末でこの${label}が更新されています。最新状態を確認せずに${actionLabel}しますか？`;
  }

  function getSharedSettingsConflictMessage(fields = {}) {
    const keys = Object.keys(fields || {});
    const label = keys.includes("categoryMasterConfig")
      ? "カテゴリ設定"
      : keys.includes("dashboardBudgetConfig")
        ? "予算設定"
        : keys.includes("settlementRules") || keys.includes("householdPoolConfig")
          ? "家計財布ルール"
          : keys.includes("recurringTemplateConfig")
            ? "固定費テンプレ"
            : keys.includes("monthlyCloseConfig")
              ? "月次クローズ設定"
              : "設定";
    return `他の端末で${label}が更新されています。最新状態を確認せずに今回の設定を上書きしますか？`;
  }

  function formatConflictTimestamp(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
  }

  function formatConflictActor(ctx, email) {
    const value = String(email || "").trim();
    if (!value) return "";
    return ctx.userLabels?.[value] || value;
  }

  function buildSharedSettingsConflictPrompt(ctx, fields, currentSettings) {
    const base = getSharedSettingsConflictMessage(fields);
    const actor = formatConflictActor(ctx, currentSettings?.updatedBy || "");
    const when = formatConflictTimestamp(currentSettings?.updatedAt || "");
    if (!actor && !when) return base;
    return `${base}\n\n最新は ${actor || "他端末"}${when ? ` が ${when} に` : ""}更新した設定です。`;
  }

  function buildRecordConflictPrompt(ctx, collectionKey, action, currentRecord) {
    const base = getRecordConflictMessage(collectionKey, action);
    const actor = formatConflictActor(ctx, currentRecord?.updatedBy || currentRecord?.createdBy || "");
    const when = formatConflictTimestamp(currentRecord?.updatedAt || currentRecord?.createdAt || "");
    const serial = String(currentRecord?.serialCode || "").trim();
    const lines = [];
    if (actor || when) lines.push(`最新は ${actor || "他端末"}${when ? ` が ${when} に` : ""}更新した内容です。`);
    if (serial) lines.push(`対象コード: ${serial}`);
    return lines.length ? `${base}\n\n${lines.join("\n")}` : base;
  }

  async function saveSharedSettingsFields(ctx, fields, options = {}) {
    const {
      state,
      canUseSharedStorage,
      fetchSharedApi,
      getSharedSettingsEndpoint,
      applySharedStateSnapshot,
    } = ctx;
    if (!canUseSharedStorage()) {
      return { ok: false, error: new Error("shared settings unavailable") };
    }
    const sanitizedFields = fields && typeof fields === "object" ? fields : {};
    try {
      if (!options.force && !String(options.expectedUpdatedAt || state.sharedSettingsUpdatedAt || "").trim()) {
        const latestSettingsPayload = await fetchSharedApi(getSharedSettingsEndpoint(), "GET");
        const latestSettings = latestSettingsPayload?.settings || {};
        state.sharedSettingsUpdatedAt = String(latestSettings.updatedAt || state.sharedSettingsUpdatedAt || "").trim();
        state.sharedSettingsUpdatedBy = String(latestSettings.updatedBy || state.sharedSettingsUpdatedBy || "").trim();
      }
      const payload = await fetchSharedApi(getSharedSettingsEndpoint(), "PATCH", {
        fields: sanitizedFields,
        expectedUpdatedAt: String(options.expectedUpdatedAt || state.sharedSettingsUpdatedAt || "").trim(),
        force: Boolean(options.force),
      });
      applySharedStateSnapshot(payload.state || {}, { storageMode: "firestore", preserveForms: true });
      state.lastSharedSyncError = null;
      return { ok: true, state: payload.state || {} };
    } catch (error) {
      if (error.status === 409 && options.allowConflictRetry !== false) {
        const currentSettings = error.payload?.currentSettings;
        if (currentSettings && typeof currentSettings === "object") {
          state.sharedSettingsUpdatedAt = String(currentSettings.updatedAt || state.sharedSettingsUpdatedAt || "").trim();
          state.sharedSettingsUpdatedBy = String(currentSettings.updatedBy || state.sharedSettingsUpdatedBy || "").trim();
        } else {
          try {
            const latestSettingsPayload = await fetchSharedApi(getSharedSettingsEndpoint(), "GET", null, { allowAuthRetry: true });
            const latestSettings = latestSettingsPayload?.settings || {};
            state.sharedSettingsUpdatedAt = String(latestSettings.updatedAt || state.sharedSettingsUpdatedAt || "").trim();
            state.sharedSettingsUpdatedBy = String(latestSettings.updatedBy || state.sharedSettingsUpdatedBy || "").trim();
          } catch (refreshError) {
            console.warn("Failed to refresh latest shared settings before conflict prompt", refreshError);
          }
        }
        if (typeof ctx.onSharedSettingsConflictRefreshed === "function") {
          ctx.onSharedSettingsConflictRefreshed(sanitizedFields);
        }
        const latestConflictSettings = currentSettings && typeof currentSettings === "object" ? currentSettings : { updatedAt: state.sharedSettingsUpdatedAt, updatedBy: state.sharedSettingsUpdatedBy };
        const shouldForce = window.confirm(buildSharedSettingsConflictPrompt(ctx, sanitizedFields, latestConflictSettings));
        if (shouldForce) {
          return saveSharedSettingsFields(ctx, fields, {
            ...options,
            force: true,
            allowConflictRetry: false,
          });
        }
      }
      state.lastSharedSyncError = error;
      return { ok: false, error };
    }
  }

  async function saveSharedRecord(ctx, collectionKey, record, options = {}) {
    const {
      state,
      fetchSharedApi,
      getSharedRecordEndpoint,
      upsertStateRecord,
      prependActivityLog,
      normalizeSerialCounters,
      persist,
      loadSharedRecord,
    } = ctx;
    const hasExisting = (Array.isArray(state[collectionKey]) ? state[collectionKey] : []).some((item) => item.id === record.id);
    const endpoint = hasExisting
      ? getSharedRecordEndpoint(collectionKey, record.id)
      : getSharedRecordEndpoint(collectionKey);
    const method = hasExisting ? "PUT" : "POST";
    const expectedUpdatedAt = String(options.expectedUpdatedAt || "").trim();
    try {
      const payload = await fetchSharedApi(endpoint, method, {
        record,
        expectedUpdatedAt,
        force: Boolean(options.force),
      });
      const savedRecord = upsertStateRecord(collectionKey, payload.record || record);
      if (payload.activityLog) prependActivityLog(payload.activityLog);
      state.serialCounters = normalizeSerialCounters(payload.serialCounters || state.serialCounters);
      state.lastSharedSyncError = null;
      persist({ skipRemote: true });
      return { ok: true, record: savedRecord };
    } catch (error) {
      if (error.status === 409 && options.allowConflictRetry !== false) {
        let currentRecord = error.payload?.currentRecord;
        if (!currentRecord && record?.id) {
          try {
            currentRecord = await loadSharedRecord(collectionKey, record.id);
          } catch (refreshError) {
            console.warn(`Failed to refresh latest ${collectionKey} record before conflict prompt`, refreshError);
          }
        }
        if (currentRecord) {
          upsertStateRecord(collectionKey, currentRecord);
          persist({ skipRemote: true });
          if (typeof ctx.onSharedRecordConflictRefreshed === "function") {
            ctx.onSharedRecordConflictRefreshed(collectionKey, currentRecord, options.action || "save");
          }
        }
        const shouldForce = window.confirm(buildRecordConflictPrompt(ctx, collectionKey, options.action || "save", currentRecord));
        if (shouldForce) {
          return saveSharedRecord(ctx, collectionKey, record, {
            ...options,
            force: true,
            allowConflictRetry: false,
          });
        }
      }
      state.lastSharedSyncError = error;
      return { ok: false, error };
    }
  }

  async function deleteSharedRecord(ctx, collectionKey, recordId, options = {}) {
    const {
      state,
      fetchSharedApi,
      getSharedRecordEndpoint,
      removeStateRecord,
      prependActivityLog,
      upsertStateRecord,
      persist,
      loadSharedRecord,
    } = ctx;
    try {
      const payload = await fetchSharedApi(getSharedRecordEndpoint(collectionKey, recordId), "DELETE", {
        expectedUpdatedAt: String(options.expectedUpdatedAt || "").trim(),
        force: Boolean(options.force),
      });
      if (payload.deleted) {
        removeStateRecord(collectionKey, recordId);
        if (payload.activityLog) prependActivityLog(payload.activityLog);
        state.lastSharedSyncError = null;
        persist({ skipRemote: true });
      }
      return { ok: Boolean(payload.deleted), payload };
    } catch (error) {
      if (error.status === 409 && options.allowConflictRetry !== false) {
        let currentRecord = error.payload?.currentRecord;
        if (!currentRecord && recordId) {
          try {
            currentRecord = await loadSharedRecord(collectionKey, recordId);
          } catch (refreshError) {
            console.warn(`Failed to refresh latest ${collectionKey} record before delete conflict prompt`, refreshError);
          }
        }
        if (currentRecord) {
          upsertStateRecord(collectionKey, currentRecord);
          persist({ skipRemote: true });
          if (typeof ctx.onSharedRecordConflictRefreshed === "function") {
            ctx.onSharedRecordConflictRefreshed(collectionKey, currentRecord, "delete");
          }
        }
        const shouldForce = window.confirm(buildRecordConflictPrompt(ctx, collectionKey, "delete", currentRecord));
        if (shouldForce) {
          return deleteSharedRecord(ctx, collectionKey, recordId, {
            ...options,
            force: true,
            allowConflictRetry: false,
          });
        }
      }
      state.lastSharedSyncError = error;
      return { ok: false, error };
    }
  }

  async function loadExpenseOverviewFromBackend(ctx, options = {}) {
    const {
      state,
      canUseSharedStorage,
      currentMonth,
      currentYear,
      sumAmounts,
      getRecentMonthKeys,
      fetchSharedApi,
      getExpenseOverviewEndpoint,
      isFamilySummaryExpense,
      showSyncToast,
    } = ctx;
    if (!canUseSharedStorage()) {
      state.expenseOverview = {
        currentMonth: currentMonth(),
        currentYear: currentYear(),
        monthlyTotal: sumAmounts(state.expenses.filter((item) => String(item?.date || "").startsWith(currentMonth()))),
        yearlyTotal: sumAmounts(state.expenses.filter((item) => String(item?.date || "").startsWith(currentYear()))),
        recentMonths: getRecentMonthKeys(6).map((month) => ({
          month,
          total: sumAmounts(state.expenses.filter((item) => String(item?.date || "").startsWith(month) && isFamilySummaryExpense(item))),
        })),
      };
      return false;
    }
    try {
      const payload = await fetchSharedApi(getExpenseOverviewEndpoint(), "GET", null, { cacheBust: true });
      const overview = payload?.overview || {};
      state.expenseOverview = {
        currentMonth: String(overview.currentMonth || currentMonth()),
        currentYear: String(overview.currentYear || currentYear()),
        monthlyTotal: Number(overview.monthlyTotal || 0),
        yearlyTotal: Number(overview.yearlyTotal || 0),
        recentMonths: Array.isArray(overview.recentMonths)
          ? overview.recentMonths.map((item) => ({
            month: String(item?.month || ""),
            total: Number(item?.total || 0),
          }))
          : [],
      };
      return true;
    } catch (error) {
      console.error("loadExpenseOverviewFromBackend failed", error);
      if (!options.silent) {
        showSyncToast("支出概要の取得に失敗しました。", "error", { duration: 2500 });
      }
      return false;
    }
  }

  async function loadExpenseListFromBackend(ctx, options = {}) {
    const {
      state,
      canUseSharedStorage,
      fetchSharedApi,
      getExpenseListEndpoint,
      normalizeExpense,
      compareExpensesForDisplay,
      recoverStoredReceiptUploadJobsFromRecords,
      expenseListPageSize,
      showSyncToast,
    } = ctx;
    if (!canUseSharedStorage()) return false;
    if (state.expenseListLoading) return false;
    state.expenseListLoading = true;
    try {
      const endpoint = getExpenseListEndpoint({
        limit: expenseListPageSize,
        cursor: options.reset ? "" : state.expenseListCursor,
        month: state.listMonthFilter,
      });
      const payload = await fetchSharedApi(endpoint, "GET", null, { cacheBust: true });
      const records = Array.isArray(payload?.records) ? payload.records.map(normalizeExpense) : [];
      const merged = new Map();
      if (!options.reset) {
        (Array.isArray(state.expenseListItems) ? state.expenseListItems : []).forEach((item) => {
          if (item?.id) merged.set(String(item.id), item);
        });
      }
      records.forEach((item) => {
        if (item?.id) merged.set(String(item.id), item);
      });
      state.expenseListItems = [...merged.values()].sort(compareExpensesForDisplay);
      state.expenseListCursor = String(payload?.nextCursor || "");
      state.expenseListHasMore = Boolean(payload?.hasMore);
      recoverStoredReceiptUploadJobsFromRecords({ records, autoStart: true, silent: true });
      return true;
    } catch (error) {
      console.error("loadExpenseListFromBackend failed", error);
      if (!options.silent) {
        showSyncToast("支出一覧の取得に失敗しました。", "error", { duration: 2500 });
      }
      return false;
    } finally {
      state.expenseListLoading = false;
    }
  }

  async function ensureAllExpensesLoaded(ctx, options = {}) {
    const {
      state,
      canUseSharedStorage,
      fetchSharedApi,
      getAllExpensesEndpoint,
      normalizeExpense,
      ensureExpenseListHydratedFromExpenses,
      compareExpensesForDisplay,
      persist,
      recoverStoredReceiptUploadJobsFromRecords,
      ensureSharedStateLoaded,
      showSyncToast,
      renderAll,
    } = ctx;
    const forceRefresh = Boolean(options.forceRefresh);
    if (state.expensesLoaded && !forceRefresh) return true;
    if (!canUseSharedStorage()) {
      state.expensesLoaded = true;
      return true;
    }
    if (state.expensesLoadingPromise) return state.expensesLoadingPromise;
    state.expensesLoading = true;
    state.expensesLoadingPromise = (async () => {
      try {
        const payload = await fetchSharedApi(getAllExpensesEndpoint(), "GET", null, { cacheBust: true });
        state.expenses = Array.isArray(payload?.expenses) ? payload.expenses.map(normalizeExpense) : [];
        state.expensesLoaded = true;
        state.expensesLastLoadedAt = Date.now();
        ensureExpenseListHydratedFromExpenses({ force: forceRefresh });
        persist({ skipRemote: true });
        recoverStoredReceiptUploadJobsFromRecords({ records: state.expenses, autoStart: true, silent: true });
        if (!state.sharedStateLoaded) {
          ensureSharedStateLoaded({ silent: true }).catch((error) => {
            console.warn("ensureSharedStateLoaded after expenses load failed", error);
          });
        }
        return true;
      } catch (error) {
        console.error("ensureAllExpensesLoaded failed", error);
        if (!options.silent) {
          showSyncToast("検索用の支出履歴取得に失敗しました。", "error", { duration: 2500 });
        }
        return false;
      } finally {
        state.expensesLoading = false;
        state.expensesLoadingPromise = null;
        renderAll();
      }
    })();
    return state.expensesLoadingPromise;
  }

  async function loadSharedStateFromBackend(ctx, options = {}) {
    const {
      state,
      canUseSharedStorage,
      fetchSharedState,
      applySharedStateSnapshot,
      hasMissingSharedSerialMetadata,
      syncSharedStateToBackend,
      hasLegacyCategoryData,
      hasLegacyDashboardBudgetData,
      hasLocallyUsableSharedState,
      setText,
      els,
    } = ctx;
    if (!canUseSharedStorage()) {
      state.sharedStateLoaded = false;
      state.storageMode = "local";
      state.activityLogsLoaded = false;
      state.activityLogsLoading = false;
      state.sharedStateLoadingPromise = null;
      return false;
    }
    state.sharedStateLoading = true;
    try {
      const payload = await fetchSharedState("GET");
      const remoteState = payload.state || {};
      applySharedStateSnapshot(remoteState, { storageMode: "firestore", preserveForms: true });
      try {
        const needsSerialBootstrap = hasMissingSharedSerialMetadata(remoteState);
        const needsLegacyNormalize = !needsSerialBootstrap && (hasLegacyCategoryData(remoteState) || hasLegacyDashboardBudgetData(remoteState));
        if (needsSerialBootstrap || needsLegacyNormalize) {
          if (!state.sharedStateMaintenancePromise) {
            state.sharedStateMaintenancePromise = (async () => {
              try {
                if (needsSerialBootstrap) {
                  await syncSharedStateToBackend("serial-bootstrap", { force: true });
                } else if (needsLegacyNormalize) {
                  await syncSharedStateToBackend("category-normalize", { force: true });
                }
              } finally {
                state.sharedStateMaintenancePromise = null;
              }
            })();
          }
          await state.sharedStateMaintenancePromise;
        }
      } catch (maintenanceError) {
        console.warn("shared state maintenance sync skipped after successful load", maintenanceError);
      }
      return true;
    } catch (error) {
      console.error("loadSharedStateFromBackend failed", error);
      state.sharedStateLoaded = hasLocallyUsableSharedState();
      state.storageMode = "local";
      state.activityLogsLoading = false;
      if (!options.silent) {
        setText(els.loginMessage, `共有データの読込に失敗しました: ${error.message || error}`);
      }
      return false;
    } finally {
      state.sharedStateLoading = false;
      state.sharedStateLoadingPromise = null;
    }
  }

  global.KakeiboSharedSyncFeature = {
    getRecordConflictMessage,
    getSharedSettingsConflictMessage,
    saveSharedSettingsFields,
    saveSharedRecord,
    deleteSharedRecord,
    loadExpenseOverviewFromBackend,
    loadExpenseListFromBackend,
    ensureAllExpensesLoaded,
    loadSharedStateFromBackend,
  };
})(window);

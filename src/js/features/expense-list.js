(function registerKakeiboExpenseListFeature(global) {
  function paymentMethodLabel(ctx, item) {
    const { paymentMethods, isOtherPaymentMethod } = ctx;
    if (isOtherPaymentMethod(item.paymentMethod) && item.otherPaymentMethod) {
      const baseLabel = paymentMethods.find((method) => method.value === item.paymentMethod)?.label || item.paymentMethod;
      return `${baseLabel}(${item.otherPaymentMethod})`;
    }
    return paymentMethods.find((method) => method.value === item.paymentMethod)?.label || item.paymentMethod;
  }

  function getPersonalExpenseLabel(ctx, code) {
    return ctx.personalExpenseLabels[code || "family"] || ctx.personalExpenseLabels.family;
  }

  function getNetAmountDisplayLabel(_ctx, item) {
    const personalExpense = item?.personalExpense || "family";
    if (personalExpense === "husband") return "夫負担";
    if (personalExpense === "wife") return "妻負担";
    if (personalExpense === "child") return "子供負担";
    return "家計支出";
  }

  function getNetAmountBadgeClass(_ctx, item) {
    return (item?.personalExpense || "family") === "family" ? "" : "badge-danger";
  }

  function getExpenseCreatedOrderValue(_ctx, item) {
    return String(item?.createdAt || item?.updatedAt || item?.id || "");
  }

  function compareExpensesByRegisteredOrder(ctx, a, b) {
    const createdDiff = getExpenseCreatedOrderValue(ctx, b).localeCompare(getExpenseCreatedOrderValue(ctx, a));
    if (createdDiff !== 0) return createdDiff;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  }

  function compareExpensesForDisplay(ctx, a, b) {
    const dateDiff = String(b?.date || "").localeCompare(String(a?.date || ""));
    if (dateDiff !== 0) return dateDiff;
    const createdDiff = getExpenseCreatedOrderValue(ctx, b).localeCompare(getExpenseCreatedOrderValue(ctx, a));
    if (createdDiff !== 0) return createdDiff;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  }

  function shouldIncludeExpenseInCurrentList(ctx, record) {
    const { state } = ctx;
    if (!record?.id) return false;
    if (state.listMonthFilter) {
      return String(record?.date || "").startsWith(state.listMonthFilter);
    }
    return true;
  }

  function upsertExpenseListRecord(ctx, record) {
    const { state, normalizeExpense } = ctx;
    const normalized = normalizeExpense(record);
    if (!shouldIncludeExpenseInCurrentList(ctx, normalized)) return;
    const rows = [...(Array.isArray(state.expenseListItems) ? state.expenseListItems : [])];
    const existingIndex = rows.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      rows[existingIndex] = normalized;
    } else {
      rows.unshift(normalized);
    }
    state.expenseListItems = rows.sort((left, right) => compareExpensesForDisplay(ctx, left, right));
  }

  function ensureExpenseListHydratedFromExpenses(ctx, options = {}) {
    const { state } = ctx;
    if (state.listMonthFilter) return false;
    if (!options.force && Array.isArray(state.expenseListItems) && state.expenseListItems.length) return false;
    if (!state.expensesLoaded || !Array.isArray(state.expenses) || !state.expenses.length) return false;
    state.expenseListItems = [...state.expenses].sort((left, right) => compareExpensesForDisplay(ctx, left, right));
    state.expenseListCursor = "";
    state.expenseListHasMore = false;
    return true;
  }

  function removeExpenseListRecord(ctx, recordId) {
    const { state } = ctx;
    state.expenseListItems = (Array.isArray(state.expenseListItems) ? state.expenseListItems : []).filter((item) => item.id !== recordId);
  }

  function getKnownExpensesForList(ctx) {
    const { state } = ctx;
    const merged = new Map();
    (Array.isArray(state.expenseListItems) ? state.expenseListItems : []).forEach((item) => {
      if (!item?.id) return;
      merged.set(String(item.id), item);
    });
    (Array.isArray(state.expenses) ? state.expenses : []).forEach((item) => {
      if (!item?.id) return;
      merged.set(String(item.id), item);
    });
    return [...merged.values()];
  }

  function getListFilteredExpenses(ctx) {
    const { state } = ctx;
    const items = getKnownExpensesForList(ctx);
    if (!state.listMonthFilter) return items;
    return items.filter((item) => String(item?.date || "").startsWith(state.listMonthFilter));
  }

  async function openReceiptStorageAsset(ctx, assetId) {
    const { getReceiptStorageAssetUrl, getAuthHeaders, markAuthSessionExpired } = ctx;
    const url = getReceiptStorageAssetUrl(assetId);
    if (!url) throw new Error("レシート画像の保存先が見つかりません。");
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
      throw new Error(payload?.error || `レシート画像の取得に失敗しました (${response.status})`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const opened = window.open(objectUrl, "_blank", "noopener");
    if (!opened) {
      URL.revokeObjectURL(objectUrl);
      throw new Error("ポップアップがブロックされました。ブラウザ設定を確認してください。");
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  function renderExpenseCardHtml(ctx, item, options = {}) {
    const {
      escapeHtml,
      formatCurrency,
      getExpenseAttentionMeta,
      getReceiptAssets,
      truncateText,
      isDriveReceiptUrl,
      isFamilyCardExpense,
      userLabels,
      payerLabels,
    } = ctx;
    const attentionMeta = getExpenseAttentionMeta(item, options.attentionState);
    const amountClass = Number(item.amount) < 0 ? "expense-amount-negative" : "";
    const netLabel = getNetAmountDisplayLabel(ctx, item);
    const netLabelBadgeClass = getNetAmountBadgeClass(ctx, item);
    const registrantLabel = userLabels[item.createdBy] || item.createdBy || "不明";
    const memoPreview = truncateText(item.memo, 30);
    const receiptAssets = typeof getReceiptAssets === "function" ? getReceiptAssets(item) : [];
    const receiptDriveUrl = item.receiptDriveUrl || (isDriveReceiptUrl(item.receiptUrl) ? item.receiptUrl : "");
    const receiptStorageAssetId = String(item.receiptStorageAssetId || "").trim();
    const receiptFallbackUrl = item.receiptUrl && !receiptStorageAssetId ? item.receiptUrl : "";
    const secondaryBits = [
      `【日付】${escapeHtml(item.date)}`,
      `【カテゴリ】${escapeHtml(item.category)}`,
      `【支払者】${escapeHtml(payerLabels[item.payer] || item.payer)}`,
      `【支払い手段】${escapeHtml(paymentMethodLabel(ctx, item))}`,
    ];
    const compactBadges = [
      { text: escapeHtml(item.serialCode || "未採番"), className: "" },
      { text: `${escapeHtml(netLabel)} ${escapeHtml(formatCurrency(item.amount))}`, className: netLabelBadgeClass },
      { text: `支出額 ${escapeHtml(formatCurrency(item.grossAmount ?? item.amount))}`, className: "" },
    ];
    if (Number(item.pointCredit || 0) > 0) compactBadges.push(`還元 ${escapeHtml(formatCurrency(item.pointCredit || 0))}`);
    if (item.receiptGroupId) compactBadges.push(`分割 ${item.receiptLineIndex || "1"}/${item.receiptLineCount || "?"}`);
    if (isFamilyCardExpense(item)) compactBadges.push("家族カード");
    if (Number(item.amount) < 0) compactBadges.push("返金/調整");
    if (attentionMeta.duplicateCount > 0) {
      compactBadges.push({
        text: `重複疑い ${escapeHtml(String(attentionMeta.duplicateCount))}件`,
        className: "badge-attention",
      });
    }
    if (attentionMeta.hasPendingReceipt) {
      compactBadges.push({
        text: "レシート未保存",
        className: "badge-receipt-pending",
      });
    }
    if (attentionMeta.needsDriveSync) {
      compactBadges.push({
        text: "Drive未反映",
        className: "badge-receipt-pending",
      });
    }
    if (receiptAssets.length > 1) {
      const driveCount = receiptAssets.filter((asset) => asset.driveUrl || asset.driveFileId).length;
      compactBadges.push({
        text: `レシート ${escapeHtml(String(receiptAssets.length))}件${driveCount ? ` / Drive ${escapeHtml(String(driveCount))}件` : ""}`,
        className: "badge-template-source",
      });
    }
    if (String(item.sourceType || "").trim() === "recurring_template" || String(item.sourceTemplateLabel || "").trim()) {
      compactBadges.push({
        text: `固定費 ${escapeHtml(truncateText(String(item.sourceTemplateLabel || "テンプレ由来"), 18))}`,
        className: "badge-template-source",
      });
    }
    const badgeHtml = compactBadges.map((badge) => {
      if (typeof badge === "string") return `<span class="badge">${badge}</span>`;
      const className = badge.className ? ` ${badge.className}` : "";
      return `<span class="badge${className}">${badge.text}</span>`;
    }).join("");
    const receiptActions = receiptAssets.length
      ? receiptAssets.map((asset, index) => {
        const label = receiptAssets.length > 1 ? `レシート${index + 1}` : "レシート画像";
        if (asset.driveUrl) return `<a class="secondary-button compact receipt-link-button" href="${escapeHtml(asset.driveUrl)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
        if (asset.storageAssetId) return `<button class="secondary-button compact receipt-link-button" type="button" data-open-receipt-asset="${escapeHtml(asset.storageAssetId)}">${escapeHtml(label)}</button>`;
        if (asset.storageUrl) return `<a class="secondary-button compact receipt-link-button" href="${escapeHtml(asset.storageUrl)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
        return "";
      }).join("")
      : [
        receiptDriveUrl ? `<a class="secondary-button compact receipt-link-button" href="${escapeHtml(receiptDriveUrl)}" target="_blank" rel="noreferrer">レシート画像</a>` : "",
        !receiptDriveUrl && receiptStorageAssetId ? `<button class="secondary-button compact receipt-link-button" type="button" data-open-receipt-asset="${escapeHtml(receiptStorageAssetId)}">レシート画像</button>` : "",
        !receiptDriveUrl && !receiptStorageAssetId && receiptFallbackUrl ? `<a class="secondary-button compact receipt-link-button" href="${escapeHtml(receiptFallbackUrl)}" target="_blank" rel="noreferrer">レシート画像</a>` : "",
      ].join("");
    return `
      <article class="expense-card${attentionMeta.hasAttention ? " has-attention" : ""}">
        <div class="expense-topline">
          <div class="expense-mainline">
            <div class="expense-title-row">
              <div class="expense-store">${escapeHtml(item.storeName)}</div>
              <span class="expense-registrant">登録者 ${escapeHtml(registrantLabel)}</span>
            </div>
            <div class="expense-subline">${secondaryBits.join(" / ")}</div>
          </div>
          <strong class="${amountClass}">${formatCurrency(item.amount)}</strong>
        </div>
        ${memoPreview ? `<div class="expense-memo-preview">メモ ${escapeHtml(memoPreview)}</div>` : ""}
        <div class="badge-row">
          ${badgeHtml}
        </div>
        <div class="expense-actions-row">
          <button class="ghost-button compact" type="button" data-edit-id="${item.id}">編集</button>
          ${item.receiptGroupId ? `<button class="ghost-button compact" type="button" data-edit-group-id="${escapeHtml(item.receiptGroupId)}">まとめて編集</button>` : ""}
          ${receiptActions}
        </div>
      </article>
    `;
  }

  function bindExpenseCardEvents(ctx, container, items) {
    const { getActiveTabName, openExpenseEditModal, openExpenseGroupEditModal, showSyncToast } = ctx;
    container.querySelectorAll("[data-edit-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const expense = items.find((item) => item.id === button.dataset.editId);
        if (!expense) return;
        const activeTab = getActiveTabName();
        openExpenseEditModal(expense, activeTab);
      });
    });
    container.querySelectorAll("[data-edit-group-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const activeTab = getActiveTabName();
        try {
          await openExpenseGroupEditModal(button.dataset.editGroupId, activeTab);
        } catch (error) {
          console.error("openExpenseGroupEditModal failed", error);
          showSyncToast("分割レシートの読込に失敗しました。", "error", { duration: 3200 });
        }
      });
    });
    container.querySelectorAll("[data-open-receipt-asset]").forEach((button) => {
      button.addEventListener("click", () => {
        openReceiptStorageAsset(ctx, button.dataset.openReceiptAsset).catch((error) => {
          console.error("openReceiptStorageAsset failed", error);
          showSyncToast(error?.message || "レシート画像を開けませんでした。", "error", { duration: 3200 });
        });
      });
    });
  }

  function renderExpenseList(ctx) {
    const {
      state,
      els,
      escapeHtml,
      formatCurrency,
      formatYearMonthLabel,
      sumAmounts,
      isSharedDataPendingAuthentication,
      canUseSharedStorage,
      buildExpenseAttentionState,
      compareExpensesByRegisteredOrder,
      buildLoadMoreButtonHtml,
      buildPagedLoadMoreButtonHtml,
      expenseListPageSize,
      clearListMonthFilter,
      loadExpenseListFromBackend,
    } = ctx;
    const items = getListFilteredExpenses(ctx);
    if (els.listMonthFilterInfo) {
      if (state.listMonthFilter) {
        els.listMonthFilterInfo.innerHTML = `
          <span>${escapeHtml(formatYearMonthLabel(state.listMonthFilter))}の支出を表示中 (${items.length}件 / 合計 ${escapeHtml(formatCurrency(sumAmounts(items)))})</span>
          <div class="inline-actions">
            <button id="clearListMonthFilterButton" class="ghost-button compact" type="button">絞り込み解除</button>
          </div>
        `;
        els.listMonthFilterInfo.classList.remove("hidden");
        els.listMonthFilterInfo.querySelector("#clearListMonthFilterButton")?.addEventListener("click", clearListMonthFilter);
      } else {
        els.listMonthFilterInfo.innerHTML = "";
        els.listMonthFilterInfo.classList.add("hidden");
      }
    }
    if (!items.length) {
      const message = state.listMonthFilter
        ? `${formatYearMonthLabel(state.listMonthFilter)}の支出はありません。`
        : isSharedDataPendingAuthentication()
          ? "Google接続の確認後に共有の支出一覧を読み込みます。"
          : (!canUseSharedStorage() && (state.lastGoogleUser || state.googleReady))
            ? "Googleログイン後に共有の支出一覧を読み込みます。"
            : (state.expenseListLoading ? "支出一覧を読み込んでいます..." : "まだ支出が登録されていません。");
      els.expenseList.innerHTML = `<div class="expense-card"><span class="muted">${escapeHtml(message)}</span></div>`;
      return;
    }
    const sorted = [...items].sort(compareExpensesByRegisteredOrder);
    const attentionState = buildExpenseAttentionState();
    const loadMoreHtml = state.listMonthFilter
      ? buildLoadMoreButtonHtml("expenseListLoadMoreButton", state.expenseListVisibleCount, sorted.length, expenseListPageSize)
      : buildPagedLoadMoreButtonHtml("expenseListLoadMoreButton", state.expenseListHasMore, state.expenseListLoading);
    const visibleItems = state.listMonthFilter ? sorted.slice(0, state.expenseListVisibleCount) : sorted;
    els.expenseList.innerHTML = visibleItems.map((item) => renderExpenseCardHtml(ctx, item, { attentionState })).join("") + loadMoreHtml;
    bindExpenseCardEvents(ctx, els.expenseList, visibleItems);
    els.expenseList.querySelector("#expenseListLoadMoreButton")?.addEventListener("click", async () => {
      if (state.listMonthFilter) {
        state.expenseListVisibleCount += expenseListPageSize;
        renderExpenseList(ctx);
        return;
      }
      await loadExpenseListFromBackend({ silent: false });
      renderExpenseList(ctx);
    });
  }

  global.KakeiboExpenseListFeature = {
    paymentMethodLabel,
    getPersonalExpenseLabel,
    getNetAmountDisplayLabel,
    getNetAmountBadgeClass,
    getExpenseCreatedOrderValue,
    compareExpensesByRegisteredOrder,
    compareExpensesForDisplay,
    upsertExpenseListRecord,
    ensureExpenseListHydratedFromExpenses,
    removeExpenseListRecord,
    getKnownExpensesForList,
    getListFilteredExpenses,
    openReceiptStorageAsset,
    renderExpenseCardHtml,
    bindExpenseCardEvents,
    renderExpenseList,
  };
})(window);

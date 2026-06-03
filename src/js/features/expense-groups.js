(function registerKakeiboExpenseGroupsFeature(global) {
  function getExpenseGroupItems(ctx, receiptGroupId) {
    const { state } = ctx;
    const groupId = String(receiptGroupId || "").trim();
    if (!groupId) return [];
    return (Array.isArray(state.expenses) ? state.expenses : [])
      .filter((item) => String(item?.receiptGroupId || "").trim() === groupId)
      .sort((a, b) => Number(a.receiptLineIndex || 0) - Number(b.receiptLineIndex || 0));
  }

  function getNextLineNumber(items = []) {
    return items.reduce((max, item) => Math.max(max, Number(item?.receiptLineIndex || 0)), 0) + 1;
  }

  function buildExpenseGroupBaseItem(ctx, existingItems = []) {
    const seed = existingItems[0] || {};
    const nextLine = getNextLineNumber(existingItems);
    const payer = ctx.normalizePayerCode(seed.payer || "husband");
    const paymentMethod = ctx.normalizePaymentMethodCode(seed.paymentMethod || "cash", payer);
    return ctx.normalizeExpense({
      ...seed,
      id: "",
      updatedAt: "",
      createdAt: "",
      date: String(seed.date || ctx.todayISO()).trim() || ctx.todayISO(),
      storeName: String(seed.storeName || "").trim(),
      amount: 0,
      grossAmount: 0,
      category: ctx.normalizeCategoryLabel(seed.category) || ctx.getPreferredCategoryFallback(),
      payer,
      paymentMethod,
      otherPaymentMethod: ctx.isOtherPaymentMethod(paymentMethod)
        ? ctx.normalizeOtherPaymentMethodLabel(seed.otherPaymentMethod || ctx.getDefaultOtherPaymentMethod())
        : "",
      billingTarget: ctx.shouldShowFamilyCardWarning(payer, paymentMethod)
        ? "husband_card"
        : ctx.getBillingTargetFromPaymentMethod(paymentMethod),
      isFamilyCard: ctx.shouldShowFamilyCardWarning(payer, paymentMethod),
      memo: String(seed.memo || "").trim(),
      personalExpense: ["family", "husband", "wife", "child"].includes(seed.personalExpense) ? seed.personalExpense : "family",
      receiptGroupId: String(seed.receiptGroupId || "").trim(),
      receiptLineIndex: nextLine,
      receiptLineCount: Math.max(existingItems.length + 1, 1),
      receiptTotalAmount: Number(seed.receiptTotalAmount || existingItems.reduce((sum, item) => sum + Number(item?.amount || 0), 0) || 0),
      receiptStoreName: String(seed.receiptStoreName || seed.storeName || "").trim(),
      receiptImageUrl: String(seed.receiptImageUrl || "").trim(),
      receiptFileId: String(seed.receiptFileId || "").trim(),
      receiptDriveUrl: String(seed.receiptDriveUrl || "").trim(),
      receiptDriveFileId: String(seed.receiptDriveFileId || "").trim(),
      receiptUploadStatus: String(seed.receiptUploadStatus || "").trim(),
      receiptUploaderName: String(seed.receiptUploaderName || "").trim(),
      receiptStorageAssetId: String(seed.receiptStorageAssetId || "").trim(),
      receiptStorageUploadedAt: String(seed.receiptStorageUploadedAt || "").trim(),
      receiptStorageStatus: String(seed.receiptStorageStatus || "").trim(),
      serialCode: "",
    });
  }

  function buildExpenseGroupEditRowTemplate(ctx, item, index) {
    const paymentMethodLabels = Object.fromEntries(ctx.paymentMethods.map((method) => [method.value, method.label]));
    const rowId = String(item.id || `new-${index}`);
    const showOther = ctx.isOtherPaymentMethod(item.paymentMethod);
    const showFamilyWarning = ctx.shouldShowFamilyCardWarning(item.payer, item.paymentMethod);
    const lineLabel = String(item.receiptLineIndex || index + 1);
    return `
      <article class="expense-group-edit-card" data-group-edit-row="${ctx.escapeHtml(rowId)}" data-group-edit-existing-id="${ctx.escapeHtml(String(item.id || ""))}">
        <div class="expense-group-edit-head">
          <strong>明細 ${ctx.escapeHtml(lineLabel)}</strong>
          <span class="badge">${ctx.escapeHtml(ctx.getPersonalExpenseLabel(item.personalExpense || "family"))}</span>
        </div>
        <div class="button-row wrap">
          <button class="secondary-button compact" type="button" data-group-remove-row="${ctx.escapeHtml(rowId)}">この明細を削除</button>
        </div>
        <div class="form-grid">
          <label class="input-group">
            <span>日付</span>
            <input type="date" data-group-field="date" value="${ctx.escapeHtml(item.date || ctx.todayISO())}" />
          </label>
          <label class="input-group">
            <span>購入店 *</span>
            <input type="text" maxlength="100" data-group-field="storeName" value="${ctx.escapeHtml(item.storeName || "")}" />
          </label>
          <label class="input-group">
            <span>金額 *</span>
            <input type="number" step="1" data-group-field="amount" value="${ctx.escapeHtml(String(Number(item.amount || 0)))}" />
          </label>
          <label class="input-group">
            <span>カテゴリ *</span>
            <select data-group-field="category">${ctx.buildSplitSelectOptions(ctx.getSelectableCategoryLabels(), ctx.normalizeCategoryLabel(item.category) || ctx.getPreferredCategoryFallback())}</select>
          </label>
          <label class="input-group">
            <span>支払者 *</span>
            <select data-group-field="payer">${ctx.buildSplitSelectOptions(Object.keys(ctx.payerLabels), item.payer, ctx.payerLabels)}</select>
          </label>
          <label class="input-group">
            <span>支払い手段 *</span>
            <select data-group-field="paymentMethod">${ctx.buildSplitSelectOptions(ctx.paymentMethods.map((method) => method.value), item.paymentMethod, paymentMethodLabels)}</select>
          </label>
          <label class="input-group ${showOther ? "" : "hidden"}" data-group-other-wrapper>
            <span>その他支払い手段</span>
            <select data-group-field="otherPaymentMethod">${ctx.buildSplitSelectOptions(ctx.state.otherPaymentMethods, item.otherPaymentMethod || ctx.getDefaultOtherPaymentMethod())}</select>
          </label>
          <label class="input-group">
            <span>負担区分</span>
            <select data-group-field="personalExpense">${ctx.buildSplitSelectOptions(Object.keys(ctx.personalExpenseLabels), item.personalExpense || "family", ctx.personalExpenseLabels)}</select>
          </label>
        </div>
        ${showFamilyWarning ? '<p class="inline-warning">家族カードの利用です</p>' : ""}
        <label class="input-group">
          <span>メモ</span>
          <textarea rows="2" maxlength="${ctx.memoMaxLength}" data-group-field="memo">${ctx.escapeHtml(item.memo || "")}</textarea>
        </label>
      </article>
    `;
  }

  function bindExpenseGroupEditModalEvents(ctx) {
    const { els } = ctx;
    els.expenseGroupEditModalContent?.querySelectorAll("[data-group-field='paymentMethod']").forEach((select) => {
      if (select.dataset.groupBound === "true") return;
      select.dataset.groupBound = "true";
      select.addEventListener("change", () => {
        const row = select.closest("[data-group-edit-row]");
        if (!row) return;
        const paymentMethod = ctx.normalizePaymentMethodCode(select.value);
        const otherWrapper = row.querySelector("[data-group-other-wrapper]");
        const otherSelect = row.querySelector("[data-group-field='otherPaymentMethod']");
        const isOther = ctx.isOtherPaymentMethod(paymentMethod);
        otherWrapper?.classList.toggle("hidden", !isOther);
        if (!isOther && otherSelect) otherSelect.value = "";
      });
    });
    els.expenseGroupEditModalContent?.querySelectorAll("[data-group-field='amount']").forEach((input) => {
      if (input.dataset.groupBound === "true") return;
      input.dataset.groupBound = "true";
      input.addEventListener("input", () => updateExpenseGroupEditSummary(ctx));
    });
    els.expenseGroupEditModalContent?.querySelectorAll("[data-group-remove-row]").forEach((button) => {
      if (button.dataset.groupBound === "true") return;
      button.dataset.groupBound = "true";
      button.addEventListener("click", () => {
        const rowId = String(button.getAttribute("data-group-remove-row") || "").trim();
        removeExpenseGroupEditRow(ctx, rowId);
      });
    });
    const addButton = els.expenseGroupEditModalContent?.querySelector("[data-group-add-row]");
    if (addButton && addButton.dataset.groupBound !== "true") {
      addButton.dataset.groupBound = "true";
      addButton.addEventListener("click", () => {
        addExpenseGroupEditRow(ctx);
      });
    }
  }

  function renderExpenseGroupEditModal(ctx, groupId) {
    const { els, formatCurrency } = ctx;
    if (!els.expenseGroupEditModalContent) return;
    const items = getExpenseGroupItems(ctx, groupId);
    if (!items.length) {
      els.expenseGroupEditModalContent.innerHTML = '<p class="muted">分割済み明細が見つかりませんでした。</p>';
      return;
    }
    const receiptTotal = Number(items[0]?.receiptTotalAmount || 0);
    const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const difference = receiptTotal ? receiptTotal - total : 0;
    els.expenseGroupEditModalContent.innerHTML = `
      <article class="card expense-group-summary-card stack gap-md">
        <div class="summary-cards mini-summary-grid">
          <section class="mini-summary-card">
            <span>レシート合計</span>
            <strong data-expense-group-receipt-total="${ctx.escapeHtml(String(receiptTotal || total))}">${formatCurrency(receiptTotal || total)}</strong>
          </section>
          <section class="mini-summary-card">
            <span>現在の分割合計</span>
            <strong data-expense-group-current-total>${formatCurrency(total)}</strong>
          </section>
          <section class="mini-summary-card ${difference === 0 ? "" : "warning"}" data-expense-group-difference-card>
            <span>差額</span>
            <strong data-expense-group-difference>${formatCurrency(difference)}</strong>
          </section>
        </div>
        <p class="muted small">このレシートにひもづく ${items.length}件をまとめて直せます。重複登録の可能性があるので、保存前に合計も確認してください。</p>
        <p class="message" data-expense-group-message>${difference === 0 ? "分割合計はレシート合計と一致しています。" : "分割合計とレシート合計に差があります。保存前に確認してください。"}</p>
        <div class="button-row wrap">
          <button class="secondary-button" type="button" data-group-add-row>明細を追加</button>
        </div>
      </article>
      <div class="expense-group-edit-list">
        ${items.map((item, index) => buildExpenseGroupEditRowTemplate(ctx, item, index)).join("")}
      </div>
    `;
    bindExpenseGroupEditModalEvents(ctx);
    updateExpenseGroupEditSummary(ctx);
  }

  function updateExpenseGroupEditSummary(ctx) {
    const { els, formatCurrency } = ctx;
    if (!els.expenseGroupEditModalContent) return;
    const receiptTotal = Number(els.expenseGroupEditModalContent.querySelector("[data-expense-group-receipt-total]")?.getAttribute("data-expense-group-receipt-total") || 0);
    const total = Array.from(els.expenseGroupEditModalContent.querySelectorAll("[data-group-field='amount']"))
      .reduce((sum, input) => sum + (Number(input.value || 0) || 0), 0);
    const difference = receiptTotal ? receiptTotal - total : 0;
    const currentTotalEl = els.expenseGroupEditModalContent.querySelector("[data-expense-group-current-total]");
    const differenceEl = els.expenseGroupEditModalContent.querySelector("[data-expense-group-difference]");
    const differenceCard = els.expenseGroupEditModalContent.querySelector("[data-expense-group-difference-card]");
    const messageEl = els.expenseGroupEditModalContent.querySelector("[data-expense-group-message]");
    if (currentTotalEl) currentTotalEl.textContent = formatCurrency(total);
    if (differenceEl) differenceEl.textContent = formatCurrency(difference);
    differenceCard?.classList.toggle("warning", difference !== 0);
    if (messageEl) {
      messageEl.textContent = difference === 0
        ? "分割合計はレシート合計と一致しています。"
        : "分割合計とレシート合計に差があります。保存前に確認してください。";
    }
  }

  function addExpenseGroupEditRow(ctx) {
    const { state, els } = ctx;
    const groupId = String(state.expenseGroupEditGroupId || "").trim();
    if (!groupId || !els.expenseGroupEditModalContent) return;
    const items = getExpenseGroupItems(ctx, groupId);
    const baseItem = buildExpenseGroupBaseItem(ctx, items);
    const nextRowHtml = buildExpenseGroupEditRowTemplate(ctx, baseItem, items.length);
    const list = els.expenseGroupEditModalContent.querySelector(".expense-group-edit-list");
    list?.insertAdjacentHTML("beforeend", nextRowHtml);
    bindExpenseGroupEditModalEvents(ctx);
    updateExpenseGroupEditSummary(ctx);
  }

  function removeExpenseGroupEditRow(ctx, rowId) {
    const { els, showSyncToast } = ctx;
    const rows = Array.from(els.expenseGroupEditModalContent?.querySelectorAll("[data-group-edit-row]") || []);
    if (rows.length <= 1) {
      showSyncToast("分割明細は1件以上残す必要があります。", "error", { duration: 2600 });
      return;
    }
    const row = rows.find((item) => String(item.getAttribute("data-group-edit-row") || "").trim() === rowId);
    row?.remove();
    Array.from(els.expenseGroupEditModalContent?.querySelectorAll("[data-group-edit-row] strong") || []).forEach((strong, index) => {
      strong.textContent = `明細 ${index + 1}`;
    });
    updateExpenseGroupEditSummary(ctx);
  }

  async function openExpenseGroupEditModal(ctx, receiptGroupId, sourceTab) {
    const { state, els, canUseSharedStorage, ensureAllExpensesLoaded, showSyncToast, getActiveTabName, rememberEditScrollContext, closeExpenseEditModal } = ctx;
    const groupId = String(receiptGroupId || "").trim();
    if (!groupId || !els.expenseGroupEditModal) return;
    if (canUseSharedStorage() && !state.expensesLoaded) {
      await ensureAllExpensesLoaded({ silent: true });
    }
    const items = getExpenseGroupItems(ctx, groupId);
    if (!items.length) {
      showSyncToast("分割済み明細が見つかりませんでした。", "error", { duration: 3200 });
      return;
    }
    if (state.expenseEditModalOpen) {
      closeExpenseEditModal();
    }
    state.entryReturnTab = sourceTab || getActiveTabName();
    rememberEditScrollContext(state.entryReturnTab, items[0]?.id || groupId);
    state.expenseGroupEditGroupId = groupId;
    renderExpenseGroupEditModal(ctx, groupId);
    els.expenseGroupEditModal.classList.remove("hidden");
    els.expenseGroupEditModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    state.expenseGroupEditModalOpen = true;
  }

  function closeExpenseGroupEditModal(ctx) {
    const { state, els } = ctx;
    if (!state.expenseGroupEditModalOpen || !els.expenseGroupEditModal) return;
    els.expenseGroupEditModal.classList.add("hidden");
    els.expenseGroupEditModal.setAttribute("aria-hidden", "true");
    state.expenseGroupEditModalOpen = false;
    state.expenseGroupEditGroupId = "";
    document.body.classList.toggle("modal-open", state.entryFlowModalOpen || state.expenseEditModalOpen || state.crossBurdenModalOpen);
  }

  function collectExpenseGroupEditDrafts(ctx) {
    const { state, els } = ctx;
    const groupId = String(state.expenseGroupEditGroupId || "").trim();
    const existingItems = getExpenseGroupItems(ctx, groupId);
    const existingMap = new Map(existingItems.map((item) => [String(item.id), item]));
    const receiptTotal = Number(els.expenseGroupEditModalContent?.querySelector("[data-expense-group-receipt-total]")?.getAttribute("data-expense-group-receipt-total") || 0);
    const rows = Array.from(els.expenseGroupEditModalContent?.querySelectorAll("[data-group-edit-row]") || []);
    const drafts = rows.map((row, index) => {
      const existingId = String(row.getAttribute("data-group-edit-existing-id") || "").trim();
      const existing = existingMap.get(existingId) || buildExpenseGroupBaseItem(ctx, existingItems);
      const payer = ctx.normalizePayerCode(row.querySelector("[data-group-field='payer']")?.value || existing.payer);
      const paymentMethod = ctx.normalizePaymentMethodCode(row.querySelector("[data-group-field='paymentMethod']")?.value || existing.paymentMethod, payer);
      const otherPaymentMethod = ctx.isOtherPaymentMethod(paymentMethod)
        ? ctx.normalizeOtherPaymentMethodLabel(row.querySelector("[data-group-field='otherPaymentMethod']")?.value || existing.otherPaymentMethod || ctx.getDefaultOtherPaymentMethod())
        : "";
      const personalExpense = String(row.querySelector("[data-group-field='personalExpense']")?.value || existing.personalExpense || "family").trim();
      const isFamilyCard = ctx.shouldShowFamilyCardWarning(payer, paymentMethod);
      const id = existingId || crypto.randomUUID();
      return ctx.normalizeExpense({
        ...existing,
        id,
        date: String(row.querySelector("[data-group-field='date']")?.value || existing.date || ctx.todayISO()).trim(),
        storeName: String(row.querySelector("[data-group-field='storeName']")?.value || existing.storeName || "").trim(),
        amount: Number(row.querySelector("[data-group-field='amount']")?.value || existing.amount || 0),
        grossAmount: Number(row.querySelector("[data-group-field='amount']")?.value || existing.grossAmount || existing.amount || 0),
        category: ctx.normalizeCategoryLabel(row.querySelector("[data-group-field='category']")?.value || existing.category) || ctx.getPreferredCategoryFallback(),
        payer,
        paymentMethod,
        otherPaymentMethod,
        billingTarget: isFamilyCard ? "husband_card" : ctx.getBillingTargetFromPaymentMethod(paymentMethod),
        isFamilyCard,
        memo: String(row.querySelector("[data-group-field='memo']")?.value || existing.memo || "").trim(),
        personalExpense: ["family", "husband", "wife", "child"].includes(personalExpense) ? personalExpense : "family",
        receiptGroupId: groupId,
        receiptLineIndex: index + 1,
        receiptLineCount: rows.length,
        receiptTotalAmount: receiptTotal || existing.receiptTotalAmount || 0,
      });
    }).filter(Boolean);
    return {
      drafts,
      deletedItems: existingItems.filter((item) => !drafts.some((draft) => draft.id === item.id)),
    };
  }

  async function saveExpenseGroupEdits(ctx) {
    const {
      state,
      els,
      canUseSharedStorage,
      saveSharedRecord,
      deleteSharedRecord,
      loadSharedRecord,
      upsertStateRecord,
      upsertExpenseListRecord,
      persist,
      renderAll,
      showSyncToast,
      closeExpenseGroupEditModal,
      restoreEditScrollContext,
    } = ctx;
    const groupId = String(state.expenseGroupEditGroupId || "").trim();
    if (!groupId) return;
    const { drafts, deletedItems } = collectExpenseGroupEditDrafts(ctx);
    if (!drafts.length) {
      showSyncToast("保存する明細が見つかりませんでした。", "error", { duration: 3200 });
      return;
    }
    const invalid = drafts.find((item) => !item.date || !item.storeName || !Number(item.amount) || !item.category);
    if (invalid) {
      showSyncToast("日付・購入店・金額・カテゴリを確認してください。", "error", { duration: 3200 });
      return;
    }
    const messageEl = els.expenseGroupEditModalContent?.querySelector("[data-expense-group-message]");
    if (messageEl) messageEl.textContent = `${drafts.length}件をまとめて保存しています...`;
    if (els.expenseGroupEditSaveButton) els.expenseGroupEditSaveButton.disabled = true;
    try {
      if (canUseSharedStorage()) {
        for (const draft of drafts) {
          const hasExisting = Boolean(draft.updatedAt);
          const result = await saveSharedRecord("expenses", draft, {
            action: hasExisting ? "update" : "create",
            expectedUpdatedAt: draft.updatedAt,
          });
          if (!result.ok) throw result.error || new Error("shared expense save failed");
          await loadSharedRecord("expenses", result.record?.id || draft.id);
        }
        for (const deletedItem of deletedItems) {
          const result = await deleteSharedRecord("expenses", deletedItem.id, {
            expectedUpdatedAt: deletedItem.updatedAt,
          });
          if (!result.ok) throw result.error || new Error("shared expense delete failed");
        }
      } else {
        drafts.forEach((draft) => {
          upsertStateRecord("expenses", draft);
          upsertExpenseListRecord(draft);
        });
        if (deletedItems.length) {
          const deletedIds = new Set(deletedItems.map((item) => item.id));
          state.expenses = state.expenses.filter((item) => !deletedIds.has(item.id));
          state.expenseListItems = state.expenseListItems.filter((item) => !deletedIds.has(item.id));
        }
        persist({ skipRemote: true });
      }
      renderAll();
      const deletedLabel = deletedItems.length ? ` / 削除 ${deletedItems.length}件` : "";
      showSyncToast(`${drafts.length}件の分割明細を更新しました${deletedLabel}。`, "success", { duration: 2800 });
      closeExpenseGroupEditModal();
      if (state.editScrollContext) {
        restoreEditScrollContext();
      }
    } finally {
      if (els.expenseGroupEditSaveButton) els.expenseGroupEditSaveButton.disabled = false;
    }
  }

  global.KakeiboExpenseGroupsFeature = {
    getExpenseGroupItems,
    renderExpenseGroupEditModal,
    updateExpenseGroupEditSummary,
    openExpenseGroupEditModal,
    closeExpenseGroupEditModal,
    collectExpenseGroupEditDrafts,
    saveExpenseGroupEdits,
  };
})(window);

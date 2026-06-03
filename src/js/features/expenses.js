(function registerKakeiboExpensesFeature(global) {
  function openExpenseEditModal(ctx, expense, sourceTab) {
    const { state, els, getActiveTabName, rememberEditScrollContext } = ctx;
    if (!expense || !els.expenseEntryCard || !els.expenseEditModalContent || !els.expenseEditModal) return;
    state.entryReturnTab = sourceTab || getActiveTabName();
    rememberEditScrollContext(state.entryReturnTab, expense.id);
    if (!state.expenseEntryCardHome) {
      state.expenseEntryCardHome = {
        parent: els.expenseEntryCard.parentElement,
        nextSibling: els.expenseEntryCard.nextElementSibling,
      };
    }
    loadExpenseIntoForm(ctx, expense);
    els.expenseEntryCard.classList.remove("hidden");
    els.expenseEditModalContent.appendChild(els.expenseEntryCard);
    els.expenseEditModal.classList.remove("hidden");
    els.expenseEditModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    state.expenseEditModalOpen = true;
    window.setTimeout(() => {
      els.date?.focus();
    }, 20);
  }

  function restoreExpenseEntryCard(ctx) {
    const { state, els } = ctx;
    if (!els.expenseEntryCard || !state.expenseEntryCardHome?.parent) return;
    const { parent, nextSibling } = state.expenseEntryCardHome;
    els.expenseEntryCard.classList.add("hidden");
    if (nextSibling?.parentElement === parent) {
      parent.insertBefore(els.expenseEntryCard, nextSibling);
      return;
    }
    parent.appendChild(els.expenseEntryCard);
  }

  function closeExpenseEditModal(ctx, options = {}) {
    const { state, els, resetForm } = ctx;
    if (!state.expenseEditModalOpen || !els.expenseEditModal) return;
    if (options.reset !== false) {
      resetForm();
    }
    restoreExpenseEntryCard(ctx);
    els.expenseEditModal.classList.add("hidden");
    els.expenseEditModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    state.expenseEditModalOpen = false;
  }

  function loadExpenseIntoForm(ctx, expense) {
    const {
      state,
      els,
      syncSplitModeUI,
      applySingleEntryValues,
      normalizeCategoryLabel,
      getPreferredCategoryFallback,
      isDriveReceiptUrl,
      isGcsReceiptFileId,
      renderReceiptLinkedInfo,
      getReceiptAssets,
      renderSplitEntrySection,
      getExpenseAttentionMeta,
      setMessageState,
    } = ctx;
    state.splitMode = false;
    state.splitEntries = [];
    syncSplitModeUI();
    els.splitReceiptTotal.value = expense.receiptTotalAmount || "";
    els.expenseId.value = expense.id;
    if (els.expenseUpdatedAt) els.expenseUpdatedAt.value = expense.updatedAt || "";
    els.date.value = expense.date;
    applySingleEntryValues({
      storeName: expense.storeName,
      grossAmount: expense.grossAmount ?? expense.amount,
      pointCredit: expense.pointCredit ?? "",
      category: normalizeCategoryLabel(expense.category) || getPreferredCategoryFallback(),
      payer: expense.payer,
      paymentMethod: expense.paymentMethod,
      otherPaymentMethod: expense.otherPaymentMethod || "",
      memo: expense.memo || "",
      personalExpense: expense.personalExpense || "family",
    }, { preserveMessage: true });
    const expenseReceiptUrl = String(expense.receiptUrl || "").trim();
    const expenseReceiptFileId = String(expense.receiptFileId || "").trim();
    state.receiptDraft.file = null;
    state.receiptDraft.previewUrl = "";
    state.receiptDraft.aiResult = null;
    state.receiptDraft.aiSource = "";
    state.receiptDraft.driveUrl = expense.receiptDriveUrl || (isDriveReceiptUrl(expenseReceiptUrl) ? expenseReceiptUrl : "");
    state.receiptDraft.driveFileId = expense.receiptDriveFileId || (expenseReceiptFileId && !isGcsReceiptFileId(expenseReceiptFileId) ? expenseReceiptFileId : "");
    state.receiptDraft.uploadedAt = expense.receiptUploadedAt || "";
    state.receiptDraft.uploadStatus = expense.receiptUploadStatus || "";
    state.receiptDraft.uploaderName = expense.receiptUploaderName || "";
    state.receiptDraft.storageAssetId = expense.receiptStorageAssetId || "";
    state.receiptDraft.storageUploadedAt = expense.receiptStorageUploadedAt || "";
    state.receiptDraft.storageStatus = expense.receiptStorageStatus || "";
    state.receiptDraft.receiptAssets = typeof getReceiptAssets === "function" ? getReceiptAssets(expense) : [];
    state.receiptDraft.pendingReceiptAssets = [];
    state.receiptDraft.receiptAssetsEdited = false;
    renderReceiptLinkedInfo();
    if (els.receiptAttachSection) els.receiptAttachSection.classList.remove("hidden");
    renderSplitEntrySection();
    els.deleteEntryButton.classList.remove("hidden");
    const recurringSourceLabel = String(expense.sourceTemplateLabel || "").trim();
    const recurringSourceNote = recurringSourceLabel ? ` 固定費テンプレ「${recurringSourceLabel}」由来です。` : "";
    const attentionMeta = getExpenseAttentionMeta(expense);
    const attentionNotes = [];
    if (attentionMeta.duplicateCount > 0) attentionNotes.push(`重複疑いが ${attentionMeta.duplicateCount}件あります。`);
    if (attentionMeta.hasPendingReceipt) attentionNotes.push("レシート画像はまだ保存待ちです。");
    setMessageState(
      els.formMessage,
      expense.receiptGroupId
        ? `分割済み明細の1件を読み込みました。${recurringSourceNote}${attentionNotes.join(" ")}修正後に保存してください。`
        : `既存データを読み込みました。${recurringSourceNote}${attentionNotes.join(" ")}修正後に保存してください。`,
      attentionNotes.length ? "warning" : "muted",
    );
  }

  function buildExpenseFromForm(ctx) {
    const {
      state,
      els,
      buildSingleEntryValues,
      calculateNetAmount,
      setText,
      buildReceiptFieldsFromDraft,
      getBillingTargetFromPaymentMethod,
      shouldShowFamilyCardWarning,
    } = ctx;
    const values = buildSingleEntryValues();
    if (!String(els.date?.value || "").trim()) {
      setText(els.formMessage, "利用日を入力してください。");
      return null;
    }
    const grossAmount = Number(values.grossAmount);
    const pointCredit = Math.max(Number(values.pointCredit) || 0, 0);
    const amount = calculateNetAmount(grossAmount, pointCredit);
    if (!grossAmount) {
      setText(els.formMessage, "購入額は0以外で入力してください。");
      return null;
    }
    if (!amount) {
      setText(els.formMessage, "金額は0以外で入力してください。");
      return null;
    }
    if (!values.storeName) {
      setText(els.formMessage, "購入店を入力してください。");
      return null;
    }
    if (!String(values.category || "").trim()) {
      setText(els.formMessage, "カテゴリを選択してください。");
      return null;
    }
    if (!String(values.payer || "").trim()) {
      setText(els.formMessage, "支払者を選択してください。");
      return null;
    }
    if (!String(values.paymentMethod || "").trim()) {
      setText(els.formMessage, "支払い手段を選択してください。");
      return null;
    }
    const now = new Date().toISOString();
    const existing = state.expenses.find((item) => item.id === els.expenseId.value);
    const originalUpdatedAt = String(els.expenseUpdatedAt?.value || existing?.updatedAt || "").trim();
    const expenseId = els.expenseId.value || crypto.randomUUID();
    if (!els.expenseId.value) els.expenseId.value = expenseId;
    const receiptFields = buildReceiptFieldsFromDraft(existing);
    const expense = {
      id: expenseId,
      serialCode: existing?.serialCode || "",
      date: els.date.value,
      storeName: values.storeName,
      amount,
      grossAmount,
      pointCredit,
      category: values.category,
      payer: values.payer,
      paymentMethod: values.paymentMethod,
      otherPaymentMethod: values.otherPaymentMethod,
      billingTarget: getBillingTargetFromPaymentMethod(values.paymentMethod),
      isFamilyCard: shouldShowFamilyCardWarning(values.payer, values.paymentMethod),
      memo: values.memo,
      ...receiptFields,
      createdAt: existing?.createdAt || now,
      updatedAt: originalUpdatedAt || now,
      createdBy: existing?.createdBy || state.currentUser?.email || "local",
      personalExpense: values.personalExpense,
      receiptGroupId: existing?.receiptGroupId || "",
      receiptLineIndex: existing?.receiptLineIndex || "",
      receiptLineCount: existing?.receiptLineCount || "",
      receiptTotalAmount: existing?.receiptTotalAmount || "",
    };
    if (expense.isFamilyCard) expense.billingTarget = "husband_card";
    return expense;
  }

  function pickDominantCategory(ctx, entries) {
    const { normalizeCategoryLabel } = ctx;
    const totals = new Map();
    entries.forEach((entry) => {
      const category = normalizeCategoryLabel(entry.category) || "その他";
      const current = totals.get(category) || 0;
      totals.set(category, current + Math.abs(Number(entry.amount) || 0));
    });
    let winner = "その他";
    let highest = -1;
    totals.forEach((total, category) => {
      if (total > highest) {
        highest = total;
        winner = category;
      }
    });
    return winner;
  }

  function formatCompactAmountSuffix(_ctx, value) {
    const amount = Number(value);
    if (!amount) return "";
    const sign = amount < 0 ? "-" : "";
    return `(${sign}${Math.abs(Math.round(amount)).toLocaleString("ja-JP")}円)`;
  }

  function joinTextPartsWithinLimit(ctx, parts, limit) {
    const { truncateText } = ctx;
    const normalizedParts = parts.map((part) => String(part || "").trim()).filter(Boolean);
    if (!normalizedParts.length) return "";
    let output = "";
    for (const part of normalizedParts) {
      const next = output ? `${output} / ${part}` : part;
      if (next.length <= limit) {
        output = next;
        continue;
      }
      if (!output) return truncateText(part, limit);
      return truncateText(output, limit);
    }
    return output;
  }

  function buildGroupedSplitMemo(ctx, entries) {
    const { memoMaxLength } = ctx;
    const parts = [];
    const itemParts = entries
      .map((entry) => {
        const label = String(entry.storeName || "").trim();
        if (!label) return "";
        return `${label}${formatCompactAmountSuffix(ctx, entry.amount)}`;
      })
      .filter(Boolean);
    if (itemParts.length) parts.push(`内訳: ${itemParts.join(" / ")}`);
    const memoParts = entries.map((entry) => String(entry.memo || "").trim()).filter(Boolean);
    if (memoParts.length) parts.push(`補足: ${Array.from(new Set(memoParts)).join(" / ")}`);
    return joinTextPartsWithinLimit(ctx, parts, memoMaxLength);
  }

  function buildGroupedAiSplitExpenses(ctx, rows) {
    const { state, els, getDefaultPaymentMethodForCurrentUser } = ctx;
    const baseStoreName = String(state.receiptDraft.aiResult?.storeName || els.storeName?.value || "AI分割レシート").trim() || "AI分割レシート";
    const grouped = new Map();
    rows.forEach((row) => {
      const key = row.personalExpense || "family";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    return Array.from(grouped.entries()).map(([personalExpense, entries]) => {
      const unifiedCategory = pickDominantCategory(ctx, entries);
      const paymentMethod = entries[0]?.paymentMethod || getDefaultPaymentMethodForCurrentUser();
      const payer = entries[0]?.payer || (state.currentUser?.email === "partner-email@example.com" ? "wife" : "husband");
      const otherPaymentMethod = entries[0]?.otherPaymentMethod || "";
      const amount = entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
      const memo = buildGroupedSplitMemo(ctx, entries);
      return {
        storeName: baseStoreName,
        amount,
        category: unifiedCategory,
        payer,
        paymentMethod,
        otherPaymentMethod,
        memo,
        personalExpense,
      };
    });
  }

  function buildSplitExpensesFromForm(ctx) {
    const {
      state,
      els,
      setText,
      isAiReceiptSummaryMode,
      buildAiReceiptSummaryExpenses,
      buildReceiptFieldsFromDraft,
      shouldShowFamilyCardWarning,
      getBillingTargetFromPaymentMethod,
      isAiAllocationSplitMode,
      getSplitDifferenceAmount,
      createSplitEntry,
      normalizeCategoryLabel,
      getPreferredCategoryFallback,
      enableSplitMode,
      applyAiReceiptSummaryDefaults,
      markAiField,
      renderSplitEntrySection,
      buildSingleEntryValues,
    } = ctx;
    const receiptTotal = Number(els.splitReceiptTotal?.value) || 0;
    if (!String(els.date?.value || "").trim()) {
      setText(els.formMessage, "利用日を入力してください。");
      return null;
    }
    if (isAiReceiptSummaryMode()) {
      const records = buildAiReceiptSummaryExpenses();
      if (!records) return null;
      const lineCount = records.length;
      const groupId = crypto.randomUUID();
      const now = new Date().toISOString();
      const receiptFields = buildReceiptFieldsFromDraft();
      return records.map((row, index) => {
        const isFamilyCard = shouldShowFamilyCardWarning(row.payer, row.paymentMethod);
        return {
          id: crypto.randomUUID(),
          serialCode: "",
          date: els.date.value,
          storeName: row.storeName,
          amount: row.amount,
          category: row.category,
          payer: row.payer,
          paymentMethod: row.paymentMethod,
          otherPaymentMethod: row.otherPaymentMethod,
          billingTarget: isFamilyCard ? "husband_card" : getBillingTargetFromPaymentMethod(row.paymentMethod),
          isFamilyCard,
          memo: row.memo,
          ...receiptFields,
          createdAt: now,
          updatedAt: now,
          createdBy: state.currentUser?.email || "local",
          personalExpense: row.personalExpense,
          receiptGroupId: groupId,
          receiptLineIndex: index + 1,
          receiptLineCount: lineCount,
          receiptTotalAmount: receiptTotal || "",
        };
      });
    }
    if (isAiAllocationSplitMode() && receiptTotal && getSplitDifferenceAmount() !== 0) {
      setText(els.formMessage, "AIが読み取った明細合計とレシート合計が一致していません。明細の漏れや金額誤読を修正してから保存してください。");
      return null;
    }
    const groupId = crypto.randomUUID();
    const now = new Date().toISOString();
    const sourceRows = [];
    for (let index = 0; index < state.splitEntries.length; index += 1) {
      const entry = state.splitEntries[index];
      const amount = Number(entry.amount);
      if (!entry.storeName.trim()) {
        setText(els.formMessage, `明細 ${index + 1} の購入店を入力してください。`);
        return null;
      }
      if (!amount) {
        setText(els.formMessage, `明細 ${index + 1} の金額は0以外で入力してください。`);
        return null;
      }
      sourceRows.push({
        rowId: entry.rowId,
        storeName: entry.storeName.trim(),
        amount,
        category: entry.category,
        payer: entry.payer,
        paymentMethod: entry.paymentMethod,
        otherPaymentMethod: entry.otherPaymentMethod.trim(),
        memo: entry.memo.trim(),
        personalExpense: entry.personalExpense || "family",
      });
    }
    const records = isAiAllocationSplitMode()
      ? buildGroupedAiSplitExpenses(ctx, sourceRows)
      : sourceRows.map((row) => ({ ...row, storeName: row.storeName, memo: row.memo, category: row.category }));
    const lineCount = records.length;
    const receiptFields = buildReceiptFieldsFromDraft();
    return records.map((row, index) => {
      const isFamilyCard = shouldShowFamilyCardWarning(row.payer, row.paymentMethod);
      return {
        id: crypto.randomUUID(),
        serialCode: "",
        date: els.date.value,
        storeName: row.storeName,
        amount: row.amount,
        category: row.category,
        payer: row.payer,
        paymentMethod: row.paymentMethod,
        otherPaymentMethod: row.otherPaymentMethod,
        billingTarget: isFamilyCard ? "husband_card" : getBillingTargetFromPaymentMethod(row.paymentMethod),
        isFamilyCard,
        memo: row.memo,
        ...receiptFields,
        createdAt: now,
        updatedAt: now,
        createdBy: state.currentUser?.email || "local",
        personalExpense: row.personalExpense,
        receiptGroupId: groupId,
        receiptLineIndex: index + 1,
        receiptLineCount: lineCount,
        receiptTotalAmount: receiptTotal || "",
      };
    });
  }

  function buildExpenseUpdateSummary(ctx, beforeExpense, nextExpense) {
    const { formatCurrency, paymentMethodLabel, getPersonalExpenseLabel, payerLabels } = ctx;
    if (!beforeExpense || !nextExpense) return "支出を更新しました。";
    const changes = [];
    if (String(beforeExpense.category || "") !== String(nextExpense.category || "")) {
      changes.push(`カテゴリを「${nextExpense.category || "未設定"}」に更新しました`);
    }
    if (Number(beforeExpense.amount || 0) !== Number(nextExpense.amount || 0)) {
      changes.push(`金額を ${formatCurrency(nextExpense.amount)} に更新しました`);
    }
    if (String(beforeExpense.payer || "") !== String(nextExpense.payer || "")) {
      changes.push(`支払者を「${payerLabels[nextExpense.payer] || nextExpense.payer}」に更新しました`);
    }
    if (String(beforeExpense.paymentMethod || "") !== String(nextExpense.paymentMethod || "") || String(beforeExpense.otherPaymentMethod || "") !== String(nextExpense.otherPaymentMethod || "")) {
      changes.push(`支払い手段を「${paymentMethodLabel(nextExpense)}」に更新しました`);
    }
    if (String(beforeExpense.personalExpense || "family") !== String(nextExpense.personalExpense || "family")) {
      changes.push(`負担区分を「${getPersonalExpenseLabel(nextExpense.personalExpense)}」に更新しました`);
    }
    if (String(beforeExpense.storeName || "") !== String(nextExpense.storeName || "")) {
      changes.push(`内容を「${nextExpense.storeName || "未設定"}」に更新しました`);
    }
    return changes[0] || "支出を更新しました。";
  }

  function getExpenseSyncFailureMessage(ctx, wasEditing) {
    const { state } = ctx;
    const fallback = wasEditing
      ? "支出更新の共有反映に失敗しました。入力内容は保持しているので、そのまま再保存できます。"
      : "支出登録の共有反映に失敗しました。入力内容は保持しているので、そのまま再保存できます。";
    const error = state.lastSharedSyncError;
    if (!error) return fallback;
    if (error.status === 401 || error.code === "missing_id_token") {
      return "Google 認証の期限切れで共有反映に失敗しました。入力内容は保持しているので、少し待って再保存するか Google で再ログインしてください。";
    }
    if (error.status === 409 || error.code === "record_conflict" || error.code === "shared_settings_conflict") {
      return "他の端末で更新された最新内容を取り込みました。内容を確認してから、必要な修正だけをもう一度保存してください。";
    }
    return fallback;
  }

  function normalizeAiSingleEntryBeforeSave(ctx) {
    const {
      state,
      els,
      normalizeCategoryLabel,
      getPreferredCategoryFallback,
      getDefaultPaymentMethodForCurrentUser,
      updateNetAmountPreview,
      setText,
    } = ctx;
    if (state.splitMode || state.receiptDraft.aiSource !== "image") return;
    const aiResult = state.receiptDraft.aiResult || {};
    if (!String(els.storeName?.value || "").trim() && String(aiResult.storeName || "").trim()) {
      els.storeName.value = String(aiResult.storeName || "").trim();
    }
    if (!String(els.category?.value || "").trim()) {
      els.category.value = normalizeCategoryLabel(aiResult.category || "") || getPreferredCategoryFallback();
    }
    if (!String(els.paymentMethod?.value || "").trim()) {
      els.paymentMethod.value = getDefaultPaymentMethodForCurrentUser();
    }
    const grossAmount = Number(els.amount?.value) || 0;
    const pointCredit = Math.max(Number(els.pointCredit?.value) || 0, 0);
    if (grossAmount > 0 && pointCredit >= grossAmount && els.pointCredit) {
      els.pointCredit.value = "";
      updateNetAmountPreview?.();
      setText(els.formMessage, "金額の手修正に合わせて、ポイント還元はいったん外して保存します。必要なら保存後に再調整してください。");
    }
  }

  async function onExpenseSubmit(ctx, event) {
    const {
      state,
      els,
      canUseSharedStorage,
      ensureReceiptAssetStored,
      ensureReceiptQueueAssetsStored,
      renderReceiptLinkedInfo,
      getPendingReceiptUploadJob,
      ensureAllExpensesLoaded,
      confirmPotentialDuplicateExpenses,
      setText,
      saveSharedRecord,
      loadSharedRecord,
      showSyncToast,
      upsertExpenseListRecord,
      loadExpenseOverviewFromBackend,
      persist,
      renderAll,
      queueDeferredReceiptUpload,
      resetForm,
      closeEntryFlowModal,
      switchTab,
      buildExpenseUpdateSummary,
      normalizeExpense,
      getExpenseSyncFailureMessage,
      normalizeCategoryLabel,
      getPreferredCategoryFallback,
      getDefaultPaymentMethodForCurrentUser,
      updateNetAmountPreview,
      closeExpenseEditModal,
      restoreEditScrollContext,
      loadReceiptQueueItem,
      configureEntryFlowContent,
      focusEntryFlowPrimaryField,
      disableSplitMode,
      saveExpenseTemplateFromDraft,
    } = ctx;
    if (state.expenseSubmitInFlight) {
      return;
    }
    event.preventDefault();
    state.expenseSubmitInFlight = true;
    try {
    const wasEditing = Boolean(els.expenseId.value);

    // 当年以外の年で新規登録する際の警告確認
    if (!wasEditing && els.date?.value) {
      const inputYear = els.date.value.slice(0, 4);
      const cYear = window.KakeiboCore.currentYear();
      if (inputYear && inputYear !== cYear) {
        const confirmed = window.confirm(`登録する日付（${els.date.value}）の年は当年（${cYear}年）ではありませんが、よろしいですか？`);
        if (!confirmed) {
          return;
        }
      }
    }

    const localOnlyMode = !state.currentUser;
    if (state.receiptDraft.file && !state.receiptDraft.driveUrl && canUseSharedStorage()) {
      try {
        if (state.receiptQueue.length > 1 && typeof ensureReceiptQueueAssetsStored === "function") {
          await ensureReceiptQueueAssetsStored({ required: true });
        } else {
          await ensureReceiptAssetStored({ required: true });
        }
      } catch (error) {
        console.error(error);
        setText(els.formMessage, error?.message || "レシート画像の一時保存に失敗しました。");
        showSyncToast("レシート画像の一時保存に失敗しました。通信状態をご確認ください。", "error", { duration: 3200 });
        return;
      }
    }
    const shouldDeferReceiptUpload = Boolean(state.receiptDraft.file && !state.receiptDraft.storageAssetId && !state.receiptDraft.driveUrl);
    if (shouldDeferReceiptUpload) {
      state.receiptDraft.uploadStatus = "pending";
      renderReceiptLinkedInfo();
    }
    if (
      state.splitMode &&
      state.receiptDraft.aiSource === "image" &&
      (state.splitModeType === "ai-allocation" || state.splitModeType === "ai-receipt-summary")
    ) {
      disableSplitMode(true);
      setText(els.formMessage, "画像AI/PDF解析の結果は通常登録として保存します。商品ごとに分けたい時だけ、改めて分割登録へ切り替えてください。");
    }
    if (state.splitMode) {
      if (els.expenseId.value) {
        setText(els.formMessage, "既存明細の編集時は分割登録を利用できません。新規入力で登録してください。");
        return;
      }
      const splitDrafts = buildSplitExpensesFromForm(ctx);
      if (!splitDrafts) return;
      const deferredReceiptJob = getPendingReceiptUploadJob(splitDrafts.map((item) => item.id));
      if (canUseSharedStorage() && !state.expensesLoaded) {
        await ensureAllExpensesLoaded({ silent: true });
      }
      const splitDuplicateConfirmed = confirmPotentialDuplicateExpenses(
        els.date.value,
        splitDrafts.map((item) => item.storeName),
        splitDrafts.map((item) => item.id),
      );
      if (!splitDuplicateConfirmed) {
        setText(els.formMessage, "重複確認のため、支出登録をキャンセルしました。");
        return;
      }
      setText(els.formMessage, `${splitDrafts.length}件の支出を共有データへ反映中です...`);
      let synced = true;
      if (canUseSharedStorage()) {
        showSyncToast("支出を共有データへ反映中です...", "pending", { sticky: true });
        for (const draft of splitDrafts) {
          const result = await saveSharedRecord("expenses", draft, { action: "create" });
          if (!result.ok) {
            synced = false;
            break;
          }
          await loadSharedRecord("expenses", result.record?.id || draft.id);
        }
        showSyncToast(
          synced ? `${splitDrafts.length}件の支出を共有データへ登録しました。` : "分割支出の共有反映に失敗しました。",
          synced ? "success" : "error",
          synced ? {} : { duration: 3200 },
        );
      } else {
        state.expenses = [...splitDrafts.reverse(), ...state.expenses];
        splitDrafts.forEach((draft) => upsertExpenseListRecord(draft));
        loadExpenseOverviewFromBackend({ silent: true }).catch(() => {});
        persist({ skipRemote: true });
        showSyncToast(`${splitDrafts.length}件の支出を登録しました。`, "success");
      }
      renderAll();
      if (!synced) {
        setText(els.formMessage, "分割支出の共有反映に失敗しました。再度確認してください。");
        return;
      }
      if (deferredReceiptJob) await queueDeferredReceiptUpload(deferredReceiptJob, { interactive: true });
      resetForm(true);
      if (state.entryFlowModalOpen) closeEntryFlowModal({ reset: false });
      switchTab("list");
      return;
    }

    normalizeAiSingleEntryBeforeSave({
      state,
      els,
      normalizeCategoryLabel,
      getPreferredCategoryFallback,
      getDefaultPaymentMethodForCurrentUser,
      updateNetAmountPreview,
      setText,
    });
    const draft = buildExpenseFromForm(ctx);
    if (!draft) return;
    const originalExpense = wasEditing ? normalizeExpense(state.expenses.find((item) => item.id === draft.id) || null) : null;
    const updateSummary = wasEditing ? buildExpenseUpdateSummary(originalExpense, draft) : "支出を登録しました。";
    const deferredReceiptJob = getPendingReceiptUploadJob(draft.id);
    if (!wasEditing) {
      if (canUseSharedStorage() && !state.expensesLoaded) {
        await ensureAllExpensesLoaded({ silent: true });
      }
      const duplicateConfirmed = confirmPotentialDuplicateExpenses(draft.date, [draft.storeName], [draft.id]);
      if (!duplicateConfirmed) {
        setText(els.formMessage, "重複確認のため、支出登録をキャンセルしました。");
        return;
      }
    }
    const existingIndex = state.expenses.findIndex((item) => item.id === draft.id);
    setText(els.formMessage, "支出を共有データへ反映中です...");
    const _qHasNext = state.receiptQueueIndex + 1 < state.receiptQueue.length;
    const _qSaved = _qHasNext ? [...state.receiptQueue] : [];
    const _qNext = state.receiptQueueIndex + 1;
    let synced = true;
    if (canUseSharedStorage()) {
      showSyncToast("支出を共有データへ反映中です...", "pending", { sticky: true });
      const result = await saveSharedRecord("expenses", draft, {
        action: wasEditing ? "update" : "create",
        expectedUpdatedAt: els.expenseUpdatedAt?.value,
      });
      synced = result.ok;
      if (synced) await loadSharedRecord("expenses", result.record?.id || draft.id);
      showSyncToast(
        synced ? (wasEditing ? updateSummary : "支出を共有データへ登録しました。") : (wasEditing ? "支出更新の共有反映に失敗しました。" : "支出登録の共有反映に失敗しました。"),
        synced ? "success" : "error",
        synced ? {} : { duration: 3200 },
      );
    } else if (existingIndex >= 0) {
      state.expenses[existingIndex] = draft;
      upsertExpenseListRecord(draft);
      loadExpenseOverviewFromBackend({ silent: true }).catch(() => {});
      persist({ skipRemote: true });
      showSyncToast(updateSummary, "success");
    } else {
      state.expenses.unshift(draft);
      upsertExpenseListRecord(draft);
      loadExpenseOverviewFromBackend({ silent: true }).catch(() => {});
      persist({ skipRemote: true });
      showSyncToast("支出を登録しました。", "success");
    }
    renderAll();
    if (!synced) {
      setText(els.formMessage, getExpenseSyncFailureMessage(wasEditing));
      return;
    }
    if (typeof saveExpenseTemplateFromDraft === "function") {
      await saveExpenseTemplateFromDraft(draft);
    }
    if (deferredReceiptJob) await queueDeferredReceiptUpload(deferredReceiptJob, { interactive: true });
    resetForm(!wasEditing);
    if (_qHasNext) {
      state.receiptQueue = _qSaved;
      loadReceiptQueueItem(_qNext);
      setText(els.formMessage, `共有反映完了。 次のレシート (${_qNext + 1}/${_qSaved.length}) を読み込みました。`);
      if (state.entryFlowModalOpen) {
        configureEntryFlowContent("image", "ai");
        focusEntryFlowPrimaryField("image", "ai");
      }
    } else {
      if (wasEditing && state.expenseEditModalOpen) {
        closeExpenseEditModal({ reset: false });
      }
      if (!wasEditing && state.entryFlowModalOpen) {
        closeEntryFlowModal({ reset: false });
      }
      if (wasEditing && state.editScrollContext) {
        restoreEditScrollContext();
      } else {
        switchTab("list");
      }
      if (localOnlyMode) {
        showSyncToast("Google未接続のため、この端末にだけ保存しました。あとでログインすれば共有データへ寄せて確認できます。", "success", { duration: 3600 });
      }
    }
    } finally {
      state.expenseSubmitInFlight = false;
    }
  }

  global.KakeiboExpensesFeature = {
    openExpenseEditModal,
    restoreExpenseEntryCard,
    closeExpenseEditModal,
    loadExpenseIntoForm,
    buildExpenseFromForm,
    pickDominantCategory,
    formatCompactAmountSuffix,
    joinTextPartsWithinLimit,
    buildGroupedSplitMemo,
    buildGroupedAiSplitExpenses,
    buildSplitExpensesFromForm,
    buildExpenseUpdateSummary,
    getExpenseSyncFailureMessage,
    onExpenseSubmit,
  };
})(window);

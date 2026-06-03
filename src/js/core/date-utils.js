(() => {
  window.KakeiboCore = window.KakeiboCore || {};

  function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function currentYear() {
    return String(new Date().getFullYear());
  }

  function previousYear() {
    return String(new Date().getFullYear() - 1);
  }

  function nextYear() {
    return String(new Date().getFullYear() + 1);
  }

  function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function todayCompact() {
    return todayISO().replaceAll("-", "");
  }

  Object.assign(window.KakeiboCore, {
    currentMonth,
    currentYear,
    previousYear,
    nextYear,
    todayISO,
    todayCompact,
  });
})();

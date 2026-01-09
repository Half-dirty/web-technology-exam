(function () {
  const { apiFetchJson, showToast, paginateArray, renderPagination, formatMoney, formatDateRu, toDateInputValue, toTimeValue, addHoursToTime, timeToMinutes, calcPrice, buildOrderPayload, createAvatarDataUrl } = window.LF;
  const cfg = window.APP_CONFIG;

  const state = {
    courses: [],
    tutors: [],
    orders: [],
    page: 1,
    coursesById: new Map(),
    tutorsById: new Map()
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    wireActions();
    loadAll();
  }

  async function loadAll() {
    try {
      showLoading(true);
      await Promise.all([loadCourses(), loadTutors(), loadOrders()]);
      buildMaps();
      renderOrders();
      showLoading(false);
    } catch (e) {
      showLoading(false);
      showToast(String(e.message || e), "danger");
    }
  }

  async function loadCourses() {
    const data = await apiFetchJson("/api/courses", { method: "GET" });
    state.courses = Array.isArray(data) ? data : [];
  }

  async function loadTutors() {
    const data = await apiFetchJson("/api/tutors", { method: "GET" });
    state.tutors = Array.isArray(data) ? data : [];
  }

  async function loadOrders() {
    const data = await apiFetchJson("/api/orders", { method: "GET" });
    state.orders = Array.isArray(data) ? data : [];
    state.orders.sort(function (a, b) {
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }

  function buildMaps() {
    state.coursesById = new Map();
    state.tutorsById = new Map();

    for (const c of state.courses) state.coursesById.set(Number(c.id), c);
    for (const t of state.tutors) state.tutorsById.set(Number(t.id), t);
  }

  function showLoading(on) {
    const el = document.getElementById("ordersLoading");
    if (!el) return;
    el.classList.toggle("d-none", !on);
  }

  function wireActions() {
    document.getElementById("confirmDeleteBtn")?.addEventListener("click", onConfirmDelete);
    document.getElementById("saveOrderBtn")?.addEventListener("click", onSaveOrder);

    const recalc = window.LF.debounce(recalcEditPrice, 120);

    const ids = [
      "editDateStartSelect", "editTimeStartSelect",
      "editTutorDateInput", "editTutorTimeInput", "editTutorDurationInput",
      "editPersonsInput",
      "editOptSupplementary", "editOptPersonalized", "editOptExcursions", "editOptAssessment", "editOptInteractive"
    ];

    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    }

    document.getElementById("editDateStartSelect")?.addEventListener("change", function () {
      syncEditCourseTimes();
      recalcEditPrice();
    });
  }

  function renderOrders() {
    const empty = document.getElementById("ordersEmptyState");
    const body = document.getElementById("ordersTableBody");
    const pag = document.getElementById("ordersPagination");

    if (!body) return;

    if (!state.orders.length) {
      body.innerHTML = "";
      if (empty) empty.classList.remove("d-none");
      renderPagination(pag, 1, 1, function () {});
      return;
    }

    if (empty) empty.classList.add("d-none");

    const pageData = paginateArray(state.orders, state.page, cfg.pagination.ordersPerPage);
    state.page = pageData.page;

    body.innerHTML = "";
    for (let i = 0; i < pageData.slice.length; i += 1) {
      const o = pageData.slice[i];
      const idx = (state.page - 1) * cfg.pagination.ordersPerPage + i + 1;

      const title = buildOrderTitle(o);
      const dateLabel = `${formatDateRu(o.date_start)} ${String(o.time_start || "")}`;
      const price = `${formatMoney(o.price)} ₽`;

      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td class="text-nowrap">${idx}</td>
        <td>${title}</td>
        <td class="text-nowrap">${dateLabel}</td>
        <td class="text-nowrap">${price}</td>
        <td class="text-end">
          <div class="d-inline-flex gap-2 flex-wrap justify-content-end">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-action="details" data-id="${o.id}" data-bs-toggle="modal" data-bs-target="#orderDetailsModal">Подробнее</button>
            <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${o.id}" data-bs-toggle="modal" data-bs-target="#orderEditModal">Изменить</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${o.id}" data-bs-toggle="modal" data-bs-target="#deleteConfirmModal">Удалить</button>
          </div>
        </td>`;

      tr.querySelectorAll("button[data-action]").forEach(function (b) {
        b.addEventListener("click", function () {
          const action = b.getAttribute("data-action");
          const id = Number(b.getAttribute("data-id"));
          if (action === "details") openDetails(id);
          if (action === "edit") openEdit(id);
          if (action === "delete") openDelete(id);
        });
      });

      body.appendChild(tr);
    }

    renderPagination(pag, pageData.page, pageData.totalPages, function (p) {
      state.page = p;
      renderOrders();
    });
  }

  function buildOrderTitle(order) {
    const isCourse = Number(order.course_id || 0) > 0;
    if (isCourse) {
      const c = state.coursesById.get(Number(order.course_id));
      if (!c) return "Курс";
      return `<div class="fw-semibold">${escapeHtml(c.name)}</div><div class="text-secondary small">${escapeHtml(c.teacher)} · ${escapeHtml(c.level)}</div>`;
    }
    const t = state.tutorsById.get(Number(order.tutor_id));
    if (!t) return "Репетитор";
    return `<div class="fw-semibold">${escapeHtml(t.name)}</div><div class="text-secondary small">${escapeHtml(t.language_level)} · ${escapeHtml((Array.isArray(t.languages_offered) ? t.languages_offered.join(", ") : ""))}</div>`;
  }

  function openDetails(orderId) {
    const o = state.orders.find(function (x) { return Number(x.id) === Number(orderId); });
    if (!o) return;

    const body = document.getElementById("orderDetailsBody");
    if (!body) return;

    const isCourse = Number(o.course_id || 0) > 0;
    const c = isCourse ? state.coursesById.get(Number(o.course_id)) : null;
    const t = !isCourse ? state.tutorsById.get(Number(o.tutor_id)) : null;

    const name = isCourse ? (c ? c.name : "Курс") : (t ? t.name : "Репетитор");
    const desc = isCourse ? (c ? c.description : "") : `Языки: ${(t && Array.isArray(t.languages_offered)) ? t.languages_offered.join(", ") : ""}`;

    const computed = calcFromOrder(o, c, t);

    body.innerHTML =
      `<div class="card border-0 bg-body-tertiary">
        <div class="card-body">
          <div class="fw-semibold mb-1">${escapeHtml(name)}</div>
          <div class="text-secondary">${escapeHtml(desc)}</div>
        </div>
      </div>

      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="fw-semibold">Дата и время</div>
          <div class="text-secondary">${escapeHtml(formatDateRu(o.date_start))} ${escapeHtml(o.time_start)}</div>
        </div>
        <div class="col-12 col-lg-6">
          <div class="fw-semibold">Стоимость</div>
          <div class="text-secondary">${escapeHtml(formatMoney(o.price))} ₽</div>
        </div>
      </div>

      <div>
        <div class="fw-semibold mb-2">Скидки и надбавки</div>
        <div class="text-secondary small">${escapeHtml(computed.details)}</div>
      </div>

      <div>
        <div class="fw-semibold mb-2">Опции</div>
        <div class="text-secondary small">${escapeHtml(optionsLine(o))}</div>
      </div>`;
  }

  function optionsLine(o) {
    const parts = [];
    if (o.supplementary) parts.push("Доп. материалы");
    if (o.personalized) parts.push("Индивидуальные занятия");
    if (o.excursions) parts.push("Экскурсии");
    if (o.assessment) parts.push("Оценка уровня");
    if (o.interactive) parts.push("Интерактивная платформа");
    if (!parts.length) return "Не выбраны";
    return parts.join(", ");
  }

  function openEdit(orderId) {
    const o = state.orders.find(function (x) { return Number(x.id) === Number(orderId); });
    if (!o) return;

    document.getElementById("editOrderId").value = String(o.id);

    const isCourse = Number(o.course_id || 0) > 0;
    document.getElementById("editOrderMode").value = isCourse ? "course" : "tutor";

    document.getElementById("editCourseId").value = String(o.course_id || 0);
    document.getElementById("editTutorId").value = String(o.tutor_id || 0);

    const courseBlock = document.getElementById("editCourseScheduleBlock");
    const tutorBlock = document.getElementById("editTutorScheduleBlock");

    if (isCourse) {
      courseBlock.classList.remove("d-none");
      tutorBlock.classList.add("d-none");
    } else {
      courseBlock.classList.add("d-none");
      tutorBlock.classList.remove("d-none");
    }

    const c = isCourse ? state.coursesById.get(Number(o.course_id)) : null;
    const t = !isCourse ? state.tutorsById.get(Number(o.tutor_id)) : null;

    document.getElementById("editCourseName").value = isCourse && c ? c.name : "Индивидуальное занятие";
    document.getElementById("editTutorName").value = isCourse && c ? c.teacher : (t ? t.name : "");

    if (isCourse && c) {
      fillEditCourseDates(c);
      document.getElementById("editDateStartSelect").value = String(o.date_start || "");
      syncEditCourseTimes();
      document.getElementById("editTimeStartSelect").value = String(o.time_start || "");
    } else {
      document.getElementById("editTutorDateInput").value = String(o.date_start || "");
      document.getElementById("editTutorTimeInput").value = String(o.time_start || "");
      document.getElementById("editTutorDurationInput").value = String(o.duration || 1);
    }

    document.getElementById("editPersonsInput").value = String(o.persons || 1);

    document.getElementById("editOptSupplementary").checked = Boolean(o.supplementary);
    document.getElementById("editOptPersonalized").checked = Boolean(o.personalized);
    document.getElementById("editOptExcursions").checked = Boolean(o.excursions);
    document.getElementById("editOptAssessment").checked = Boolean(o.assessment);
    document.getElementById("editOptInteractive").checked = Boolean(o.interactive);

    recalcEditPrice();
  }

  function fillEditCourseDates(course) {
    const select = document.getElementById("editDateStartSelect");
    if (!select) return;

    const arr = Array.isArray(course.start_dates) ? course.start_dates : [];
    const set = new Set();

    for (const iso of arr) {
      const d = new Date(iso);
      set.add(toDateInputValue(d));
    }

    const dates = Array.from(set).sort();

    select.innerHTML = "";
    for (const d of dates) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = formatDateRu(d);
      select.appendChild(opt);
    }
  }

  function syncEditCourseTimes() {
    const timeSelect = document.getElementById("editTimeStartSelect");
    const dateSelect = document.getElementById("editDateStartSelect");
    const courseId = Number(document.getElementById("editCourseId")?.value || 0);

    const c = state.coursesById.get(courseId);
    if (!timeSelect || !dateSelect || !c) return;

    const pickedDate = dateSelect.value;

    const arr = Array.isArray(c.start_dates) ? c.start_dates : [];
    const times = [];

    for (const iso of arr) {
      const d = new Date(iso);
      const ds = toDateInputValue(d);
      if (ds !== pickedDate) continue;
      times.push(toTimeValue(d));
    }

    const uniq = Array.from(new Set(times)).sort(function (a, b) {
      return timeToMinutes(a) - timeToMinutes(b);
    });

    timeSelect.innerHTML = "";
    for (const t of uniq) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = `${t}–${addHoursToTime(t, c.week_length)}`;
      timeSelect.appendChild(opt);
    }

    timeSelect.disabled = uniq.length === 0;
  }

  function recalcEditPrice() {
    const mode = document.getElementById("editOrderMode")?.value || "course";
    const persons = Number(document.getElementById("editPersonsInput")?.value || 1);

    const flagsUi = {
      supplementary: Boolean(document.getElementById("editOptSupplementary")?.checked),
      personalized: Boolean(document.getElementById("editOptPersonalized")?.checked),
      excursions: Boolean(document.getElementById("editOptExcursions")?.checked),
      assessment: Boolean(document.getElementById("editOptAssessment")?.checked),
      interactive: Boolean(document.getElementById("editOptInteractive")?.checked)
    };

    let feePerHour = 0;
    let durationHours = 1;
    let dateStart = "";
    let timeStart = "";
    let isCourse = false;
    let weekLength = 0;
    let totalWeeks = 0;

    if (mode === "tutor") {
      const tutorId = Number(document.getElementById("editTutorId")?.value || 0);
      const t = state.tutorsById.get(tutorId);
      if (!t) return;

      feePerHour = Number(t.price_per_hour || 0);
      durationHours = Math.min(40, Math.max(1, Number(document.getElementById("editTutorDurationInput")?.value || 1)));
      dateStart = String(document.getElementById("editTutorDateInput")?.value || "");
      timeStart = String(document.getElementById("editTutorTimeInput")?.value || "00:00");
    } else {
      isCourse = true;
      const courseId = Number(document.getElementById("editCourseId")?.value || 0);
      const c = state.coursesById.get(courseId);
      if (!c) return;

      feePerHour = Number(c.course_fee_per_hour || 0);
      durationHours = Math.max(1, Number(c.total_length || 1) * Number(c.week_length || 1));
      dateStart = String(document.getElementById("editDateStartSelect")?.value || "");
      timeStart = String(document.getElementById("editTimeStartSelect")?.value || "00:00");
      weekLength = Number(c.week_length || 0);
      totalWeeks = Number(c.total_length || 0);
    }

    const r = calcPrice({
      feePerHour,
      durationHours,
      persons,
      dateStart,
      timeStart,
      isCourse,
      weekLength,
      totalWeeks,
      supplementary: flagsUi.supplementary,
      personalized: flagsUi.personalized,
      excursions: flagsUi.excursions,
      assessment: flagsUi.assessment,
      interactive: flagsUi.interactive
    });

    document.getElementById("editPriceOutput").textContent = formatMoney(r.price);
    document.getElementById("editPriceDetails").textContent = r.details;

    toggleBadge("editBadgeEarly", r.flags.early_registration);
    toggleBadge("editBadgeGroup", r.flags.group_enrollment);
    toggleBadge("editBadgeIntensive", r.flags.intensive_course);
    toggleBadge("editBadgeWeekend", r.isWeekend);

    return r;
  }

  async function onSaveOrder() {
    const orderId = Number(document.getElementById("editOrderId")?.value || 0);
    const mode = document.getElementById("editOrderMode")?.value || "course";

    const o = state.orders.find(function (x) { return Number(x.id) === Number(orderId); });
    if (!o) return;

    const persons = Number(document.getElementById("editPersonsInput")?.value || 1);
    const r = recalcEditPrice();
    if (!r) return;

    let dateStart = "";
    let timeStart = "";
    let duration = 1;
    let tutorId = Number(o.tutor_id || 0);
    let courseId = Number(o.course_id || 0);

    if (mode === "tutor") {
      dateStart = String(document.getElementById("editTutorDateInput")?.value || "");
      timeStart = String(document.getElementById("editTutorTimeInput")?.value || "");
      duration = Math.min(40, Math.max(1, Number(document.getElementById("editTutorDurationInput")?.value || 1)));
    } else {
      dateStart = String(document.getElementById("editDateStartSelect")?.value || "");
      timeStart = String(document.getElementById("editTimeStartSelect")?.value || "");
      duration = 1;
    }

    if (!dateStart || !timeStart) {
      showToast("Укажите дату и время.", "warning");
      return;
    }

    const payload = buildOrderPayload({
      tutorId,
      courseId,
      dateStart,
      timeStart,
      duration,
      persons,
      price: r.price,
      flags: r.flags
    });

    try {
      const updated = await apiFetchJson(`/api/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      const idx = state.orders.findIndex(function (x) { return Number(x.id) === Number(orderId); });
      if (idx >= 0) state.orders[idx] = updated;

      showToast("Заявка обновлена.", "success");
      bootstrap.Modal.getOrCreateInstance(document.getElementById("orderEditModal")).hide();
      renderOrders();
    } catch (e) {
      showToast(String(e.message || e), "danger");
    }
  }

  function openDelete(orderId) {
    document.getElementById("deleteOrderId").value = String(orderId);
  }

  async function onConfirmDelete() {
    const id = Number(document.getElementById("deleteOrderId")?.value || 0);
    if (!id) return;

    try {
      await apiFetchJson(`/api/orders/${id}`, { method: "DELETE" });
      state.orders = state.orders.filter(function (x) { return Number(x.id) !== Number(id); });
      showToast("Заявка удалена.", "success");
      bootstrap.Modal.getOrCreateInstance(document.getElementById("deleteConfirmModal")).hide();
      state.page = 1;
      renderOrders();
    } catch (e) {
      showToast(String(e.message || e), "danger");
    }
  }

  function calcFromOrder(o, course, tutor) {
    const isCourse = Number(o.course_id || 0) > 0;

    const feePerHour = isCourse ? Number(course?.course_fee_per_hour || 0) : Number(tutor?.price_per_hour || 0);
    const durationHours = isCourse ? Math.max(1, Number(course?.total_length || 1) * Number(course?.week_length || 1)) : Math.min(40, Math.max(1, Number(o.duration || 1)));

    const r = calcPrice({
      feePerHour,
      durationHours,
      persons: Number(o.persons || 1),
      dateStart: String(o.date_start || ""),
      timeStart: String(o.time_start || "00:00"),
      isCourse,
      weekLength: Number(course?.week_length || 0),
      totalWeeks: Number(course?.total_length || 0),
      supplementary: Boolean(o.supplementary),
      personalized: Boolean(o.personalized),
      excursions: Boolean(o.excursions),
      assessment: Boolean(o.assessment),
      interactive: Boolean(o.interactive)
    });

    return r;
  }

  function toggleBadge(id, on) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("d-none", !on);
  }

  function escapeHtml(v) {
    return window.LF.escapeHtml(v);
  }
})();

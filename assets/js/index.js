(function () {
    const { apiFetchJson, showToast, debounce, paginateArray, renderPagination, formatMoney, formatDateRu, toDateInputValue, toTimeValue, truncateText, detectCourseLanguage, createAvatarDataUrl, tutorMatchesAvailability, timeToMinutes, addHoursToTime, calcPrice, buildOrderPayload } = window.LF;
    const cfg = window.APP_CONFIG;

    const state = {
        courses: [],
        tutors: [],
        coursesPage: 1,

        selectedCourse: null,
        selectedTutor: null,

        tutorsFiltered: [],
        tutorsCourseScoped: [],
        tutorLanguageOptions: []
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        wireCourseFilters();
        wireTutorFilters();
        wireOrderModal();

        loadAll();
    }

    async function loadAll() {
        try {
            await Promise.all([loadCourses(), loadTutors()]);
            applyCourseFilters();
            applyTutorFilters();
            showLoading("coursesLoading", false);
            showLoading("tutorsLoading", false);
        } catch (e) {
            showLoading("coursesLoading", false);
            showLoading("tutorsLoading", false);
            showToast(String(e.message || e), "danger");
        }
    }

    async function loadCourses() {
        showLoading("coursesLoading", true);
        const data = await apiFetchJson("/api/courses", { method: "GET" });
        state.courses = Array.isArray(data) ? data : [];
    }

    async function loadTutors() {
        showLoading("tutorsLoading", true);
        const data = await apiFetchJson("/api/tutors", { method: "GET" });
        state.tutors = Array.isArray(data) ? data : [];
        ensureTutorPhotoColumn();
        populateTutorLanguageSelect();
    }

    function showLoading(id, on) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle("d-none", !on);
    }

    function wireCourseFilters() {
        const search = document.getElementById("courseSearchInput");
        const level = document.getElementById("courseLevelSelect");
        const reset = document.getElementById("resetCourseFiltersBtn");

        const handler = debounce(function () {
            state.coursesPage = 1;
            applyCourseFilters();
        }, 200);

        if (search) search.addEventListener("input", handler);
        if (level) level.addEventListener("change", handler);

        if (reset) {
            reset.addEventListener("click", function () {
                if (search) search.value = "";
                if (level) level.value = "";
                state.coursesPage = 1;
                applyCourseFilters();
            });
        }
    }

    function applyCourseFilters() {
        const search = (document.getElementById("courseSearchInput")?.value || "").trim().toLowerCase();
        const level = (document.getElementById("courseLevelSelect")?.value || "").trim();

        const filtered = state.courses.filter(function (c) {
            const nameOk = !search || String(c.name || "").toLowerCase().includes(search);
            const levelOk = !level || String(c.level || "") === level;
            return nameOk && levelOk;
        });

        renderCourses(filtered);
    }

    function renderCourses(items) {
        const body = document.getElementById("coursesTableBody");
        const pag = document.getElementById("coursesPagination");
        if (!body) return;

        const pageData = paginateArray(items, state.coursesPage, cfg.pagination.coursesPerPage);
        state.coursesPage = pageData.page;

        body.innerHTML = "";
        for (const c of pageData.slice) {
            const tr = document.createElement("tr");
            if (state.selectedCourse && Number(state.selectedCourse.id) === Number(c.id)) tr.classList.add("lf-row-selected");

            const dur = `${c.total_length} нед × ${c.week_length} ч/нед`;
            const fee = `${formatMoney(c.course_fee_per_hour)} ₽`;

            tr.innerHTML =
                `<td>
          <div class="fw-semibold">${escapeCell(c.name)}</div>
          <div class="text-secondary small" title="${escapeAttr(c.description)}">${escapeCell(truncateText(c.description, 90))}</div>
        </td>
        <td class="text-nowrap">${escapeCell(c.level)}</td>
        <td class="text-nowrap">${escapeCell(c.teacher)}</td>
        <td class="text-nowrap">${escapeCell(dur)}</td>
        <td class="text-nowrap">${escapeCell(fee)}</td>
        <td class="text-end lf-action-col">
          <button type="button" class="btn btn-sm btn-outline-primary" data-course-id="${escapeAttr(c.id)}">Выбрать</button>
        </td>`;

            const btn = tr.querySelector("button[data-course-id]");
            btn.addEventListener("click", function () {
                selectCourse(c.id);
            });

            body.appendChild(tr);
        }

        renderPagination(pag, pageData.page, pageData.totalPages, function (p) {
            state.coursesPage = p;
            renderCourses(items);
        });

        showLoading("coursesLoading", false);
    }

    function selectCourse(courseId) {
        const c = state.courses.find(function (x) { return Number(x.id) === Number(courseId); });
        if (!c) return;

        state.selectedCourse = c;
        state.selectedTutor = null;

        updateSelectedCourseCard();
        scopeTutorsByCourse();
        applyTutorFilters();
        applyCourseFilters();
    }

    function updateSelectedCourseCard() {
        const card = document.getElementById("selectedCourseCard");
        const info = document.getElementById("selectedCourseInfo");
        const hiddenId = document.getElementById("selectedCourseId");

        if (!card || !info || !hiddenId || !state.selectedCourse) return;

        hiddenId.value = String(state.selectedCourse.id);
        const c = state.selectedCourse;
        const text =
            `${c.name} · ${c.level} · ${c.teacher} · ${c.total_length} недель · ${c.week_length} ч/нед · ${formatMoney(c.course_fee_per_hour)} ₽/ч`;

        info.textContent = text;
        card.classList.remove("d-none");

        const btn = document.getElementById("openCourseOrderBtn");
        if (btn) btn.disabled = false;
    }

    function scopeTutorsByCourse() {
        const c = state.selectedCourse;
        if (!c) {
            state.tutorsCourseScoped = state.tutors.slice();
            populateTutorLanguageSelect();
            return;
        }

        const lang = detectCourseLanguage(c.name);
        if (!lang) {
            state.tutorsCourseScoped = state.tutors.slice();
            populateTutorLanguageSelect();
            return;
        }

        state.tutorsCourseScoped = state.tutors.filter(function (t) {
            const offered = Array.isArray(t.languages_offered) ? t.languages_offered : [];
            return offered.some(function (x) { return String(x).toLowerCase() === String(lang).toLowerCase(); });
        });

        populateTutorLanguageSelect();
    }

    function wireTutorFilters() {
        const level = document.getElementById("tutorLevelSelect");
        const exp = document.getElementById("tutorMinExpInput");
        const lang = document.getElementById("tutorLanguageSelect");
        const reset = document.getElementById("resetTutorFiltersBtn");

        const days = Array.from(document.querySelectorAll(".tutor-day"));
        const timeFrom = document.getElementById("tutorTimeFromInput");
        const timeTo = document.getElementById("tutorTimeToInput");

        const handler = debounce(function () {
            applyTutorFilters();
        }, 200);

        if (level) level.addEventListener("change", handler);
        if (exp) exp.addEventListener("input", handler);
        if (lang) lang.addEventListener("change", handler);
        if (timeFrom) timeFrom.addEventListener("input", handler);
        if (timeTo) timeTo.addEventListener("input", handler);

        for (const d of days) d.addEventListener("change", handler);

        if (reset) {
            reset.addEventListener("click", function () {
                if (level) level.value = "";
                if (lang) lang.value = "";
                if (exp) exp.value = "0";
                if (timeFrom) timeFrom.value = "";
                if (timeTo) timeTo.value = "";
                for (const d of days) d.checked = false;
                applyTutorFilters();
            });
        }
    }

    function applyTutorFilters() {
        const base = state.tutorsCourseScoped.length ? state.tutorsCourseScoped : state.tutors;

        const level = (document.getElementById("tutorLevelSelect")?.value || "").trim();
        const minExp = Number(document.getElementById("tutorMinExpInput")?.value || 0);
        const lang = (document.getElementById("tutorLanguageSelect")?.value || "").trim();

        const wantedDays = Array.from(document.querySelectorAll(".tutor-day"))
            .filter(function (x) { return x.checked; })
            .map(function (x) { return x.value; });

        const wantedFrom = (document.getElementById("tutorTimeFromInput")?.value || "").trim();
        const wantedTo = (document.getElementById("tutorTimeToInput")?.value || "").trim();

        const filtered = base.filter(function (t) {
            const levelOk = !level || String(t.language_level || "") === level;
            const expOk = Number(t.work_experience || 0) >= minExp;
            const langOk = !lang || (Array.isArray(t.languages_offered) ? t.languages_offered : []).some(function (x) { return String(x) === lang; });
            const availOk = tutorMatchesAvailability(t, wantedDays, wantedFrom, wantedTo);
            return levelOk && expOk && langOk && availOk;
        });

        state.tutorsFiltered = filtered;
        renderTutors(filtered);

        const openTutorBtn = document.getElementById("openTutorOrderBtn");
        if (openTutorBtn) openTutorBtn.disabled = !state.selectedTutor;
    }

    function ensureTutorPhotoColumn() {
        const table = document.getElementById("tutorsTableBody")?.closest("table");
        if (!table) return;

        const headRow = table.querySelector("thead tr");
        if (!headRow) return;

        const ths = Array.from(headRow.querySelectorAll("th"));
        const already = ths.some(function (x) { return String(x.textContent || "").trim().toLowerCase() === "фото"; });
        if (already) return;

        const actionTh = headRow.querySelector("th.text-end") || ths[ths.length - 1];
        const photoTh = document.createElement("th");
        photoTh.className = "text-nowrap";
        photoTh.textContent = "Фото";
        headRow.insertBefore(photoTh, actionTh);
    }

    function populateTutorLanguageSelect() {
        const select = document.getElementById("tutorLanguageSelect");
        if (!select) return;

        const base = state.tutorsCourseScoped.length ? state.tutorsCourseScoped : state.tutors;
        const set = new Set();

        for (const t of base) {
            const arr = Array.isArray(t.languages_offered) ? t.languages_offered : [];
            for (const x of arr) set.add(String(x));
        }

        const current = select.value;
        select.innerHTML = `<option value="">Любой</option>`;

        Array.from(set).sort().forEach(function (x) {
            const opt = document.createElement("option");
            opt.value = x;
            opt.textContent = x;
            select.appendChild(opt);
        });

        if (current) select.value = current;
    }

    function renderTutors(items) {
        const body = document.getElementById("tutorsTableBody");
        if (!body) return;

        body.innerHTML = "";

        for (const t of items) {
            const tr = document.createElement("tr");
            if (state.selectedTutor && Number(state.selectedTutor.id) === Number(t.id)) tr.classList.add("lf-row-selected");

            const spoken = Array.isArray(t.languages_spoken) ? t.languages_spoken.join(", ") : "";
            const offered = Array.isArray(t.languages_offered) ? t.languages_offered.join(", ") : "";
            const exp = `${t.work_experience} лет`;
            const fee = `${formatMoney(t.price_per_hour)} ₽`;
            const avatar = createAvatarDataUrl(t.name, t.id);

            tr.innerHTML =
                `<td class="text-nowrap">
                    <div class="fw-semibold">${escapeCell(t.name)}</div>
                    <div class="text-secondary small">Предлагает: ${escapeCell(offered)}</div>
                </td>
                <td class="text-nowrap">${escapeCell(t.language_level)}</td>
                <td>${escapeCell(spoken)}</td>
                <td class="text-nowrap">${escapeCell(exp)}</td>
                <td class="text-nowrap">${escapeCell(fee)}</td>
                <td class="text-nowrap">
                    <img class="lf-avatar" src="${escapeAttr(avatar)}" alt="Фото">
                </td>
                <td class="text-end lf-action-col">
                    <button type="button" class="btn btn-sm btn-outline-primary" data-tutor-id="${escapeAttr(t.id)}">Выбрать</button>
                </td>`;

            tr.querySelector("button[data-tutor-id]").addEventListener("click", function () {
                selectTutor(t.id);
            });

            body.appendChild(tr);
        }

        showLoading("tutorsLoading", false);
    }

    function selectTutor(tutorId) {
        const t = state.tutors.find(function (x) { return Number(x.id) === Number(tutorId); });
        if (!t) return;

        state.selectedTutor = t;

        updateSelectedTutorCard();
        applyTutorFilters();

        const openTutorBtn = document.getElementById("openTutorOrderBtn");
        if (openTutorBtn) openTutorBtn.disabled = false;
    }

    function updateSelectedTutorCard() {
        const card = document.getElementById("selectedTutorCard");
        const info = document.getElementById("selectedTutorInfo");
        const hiddenId = document.getElementById("selectedTutorId");

        if (!card || !info || !hiddenId || !state.selectedTutor) return;

        hiddenId.value = String(state.selectedTutor.id);

        const t = state.selectedTutor;
        const avatar = createAvatarDataUrl(t.name, t.id);

        const offered = Array.isArray(t.languages_offered) ? t.languages_offered.join(", ") : "";
        const exp = `${t.work_experience} лет`;
        const fee = `${formatMoney(t.price_per_hour)} ₽/ч`;

        info.innerHTML =
            `<div class="table-responsive">
        <table class="table table-sm mb-0">
          <tbody>
            <tr>
              <td class="text-nowrap">
                <img class="lf-avatar" src="${escapeAttr(avatar)}" alt="Фото">
              </td>
              <td>
                <div class="fw-semibold">${escapeCell(t.name)}</div>
                <div class="text-secondary small">Языки: ${escapeCell(offered)}</div>
              </td>
              <td class="text-nowrap">${escapeCell(exp)}</td>
              <td class="text-nowrap">${escapeCell(fee)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;

        card.classList.remove("d-none");
    }

    function wireOrderModal() {
        const modalEl = document.getElementById("orderModal");
        const submitBtn = document.getElementById("submitOrderBtn");

        if (!modalEl || !submitBtn) return;

        modalEl.addEventListener("show.bs.modal", function (ev) {
            const trigger = ev.relatedTarget;
            const isTutorMode = trigger && trigger.id === "openTutorOrderBtn";

            if (isTutorMode) {
                prepareTutorOrder();
            } else {
                prepareCourseOrder();
            }

            recalcMainOrderPrice();
        });

        const inputs = [
            "dateStartSelect", "timeStartSelect", "tutorDateInput", "tutorTimeInput", "tutorDurationInput",
            "personsInput", "optSupplementary", "optPersonalized", "optExcursions", "optAssessment", "optInteractive"
        ];

        for (const id of inputs) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.addEventListener("input", debounce(recalcMainOrderPrice, 120));
            el.addEventListener("change", debounce(recalcMainOrderPrice, 120));
        }

        document.getElementById("dateStartSelect")?.addEventListener("change", function () {
            syncCourseTimes();
            recalcMainOrderPrice();
        });

        submitBtn.addEventListener("click", submitOrder);
    }

    function prepareCourseOrder() {
        if (!state.selectedCourse) {
            showToast("Сначала выберите курс.", "warning");
            return;
        }

        const c = state.selectedCourse;

        document.getElementById("orderMode").value = "course";
        document.getElementById("selectedCourseId").value = String(c.id);
        document.getElementById("selectedTutorId").value = "";

        document.getElementById("courseScheduleBlock").classList.remove("d-none");
        document.getElementById("tutorScheduleBlock").classList.add("d-none");

        document.getElementById("courseNameInput").value = c.name;
        document.getElementById("teacherNameInput").value = c.teacher;

        fillCourseDates(c);
        syncCourseTimes();

        const persons = document.getElementById("personsInput");
        if (persons && !persons.value) persons.value = "1";

        clearOptionCheckboxes();
    }

    function fillCourseDates(course) {
        const select = document.getElementById("dateStartSelect");
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

    function syncCourseTimes() {
        const timeSelect = document.getElementById("timeStartSelect");
        const dateSelect = document.getElementById("dateStartSelect");
        if (!timeSelect || !dateSelect || !state.selectedCourse) return;

        const course = state.selectedCourse;
        const pickedDate = dateSelect.value;

        const arr = Array.isArray(course.start_dates) ? course.start_dates : [];
        const times = [];

        for (const iso of arr) {
            const d = new Date(iso);
            const ds = toDateInputValue(d);
            if (ds !== pickedDate) continue;
            const t = toTimeValue(d);
            times.push(t);
        }

        const uniq = Array.from(new Set(times)).sort(function (a, b) {
            return timeToMinutes(a) - timeToMinutes(b);
        });

        timeSelect.innerHTML = "";
        for (const t of uniq) {
            const opt = document.createElement("option");
            const end = addHoursToTime(t, course.week_length);
            opt.value = t;
            opt.textContent = `${t}–${end}`;
            timeSelect.appendChild(opt);
        }

        timeSelect.disabled = uniq.length === 0;
    }

    function prepareTutorOrder() {
        if (!state.selectedTutor) {
            showToast("Сначала выберите репетитора.", "warning");
            return;
        }

        const t = state.selectedTutor;

        document.getElementById("orderMode").value = "tutor";
        document.getElementById("selectedTutorId").value = String(t.id);
        document.getElementById("selectedCourseId").value = "";

        document.getElementById("courseScheduleBlock").classList.add("d-none");
        document.getElementById("tutorScheduleBlock").classList.remove("d-none");

        document.getElementById("courseNameInput").value = "Индивидуальное занятие";
        document.getElementById("teacherNameInput").value = t.name;

        const dateInput = document.getElementById("tutorDateInput");
        const timeInput = document.getElementById("tutorTimeInput");
        const durInput = document.getElementById("tutorDurationInput");

        if (dateInput && !dateInput.value) dateInput.value = toDateInputValue(new Date());
        if (timeInput && !timeInput.value) timeInput.value = "12:00";
        if (durInput && !durInput.value) durInput.value = "1";

        const persons = document.getElementById("personsInput");
        if (persons && !persons.value) persons.value = "1";

        clearOptionCheckboxes();
    }

    function clearOptionCheckboxes() {
        const ids = ["optSupplementary", "optPersonalized", "optExcursions", "optAssessment", "optInteractive"];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        }
    }

    function recalcMainOrderPrice() {
        const mode = document.getElementById("orderMode")?.value || "course";
        const persons = Number(document.getElementById("personsInput")?.value || 1);

        const flags = {
            supplementary: Boolean(document.getElementById("optSupplementary")?.checked),
            personalized: Boolean(document.getElementById("optPersonalized")?.checked),
            excursions: Boolean(document.getElementById("optExcursions")?.checked),
            assessment: Boolean(document.getElementById("optAssessment")?.checked),
            interactive: Boolean(document.getElementById("optInteractive")?.checked)
        };

        let feePerHour = 0;
        let durationHours = 1;
        let dateStart = "";
        let timeStart = "";
        let isCourse = false;
        let weekLength = 0;
        let totalWeeks = 0;

        if (mode === "tutor") {
            if (!state.selectedTutor) return;
            feePerHour = Number(state.selectedTutor.price_per_hour || 0);
            durationHours = Math.min(40, Math.max(1, Number(document.getElementById("tutorDurationInput")?.value || 1)));
            dateStart = String(document.getElementById("tutorDateInput")?.value || "");
            timeStart = String(document.getElementById("tutorTimeInput")?.value || "00:00");
        } else {
            if (!state.selectedCourse) return;
            isCourse = true;
            feePerHour = Number(state.selectedCourse.course_fee_per_hour || 0);
            durationHours = Math.max(1, Number(state.selectedCourse.total_length || 1) * Number(state.selectedCourse.week_length || 1));
            dateStart = String(document.getElementById("dateStartSelect")?.value || "");
            timeStart = String(document.getElementById("timeStartSelect")?.value || "00:00");
            weekLength = Number(state.selectedCourse.week_length || 0);
            totalWeeks = Number(state.selectedCourse.total_length || 0);
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
            supplementary: flags.supplementary,
            personalized: flags.personalized,
            excursions: flags.excursions,
            assessment: flags.assessment,
            interactive: flags.interactive
        });

        document.getElementById("priceOutput").textContent = formatMoney(r.price);
        document.getElementById("priceDetails").textContent = r.details;

        toggleBadge("badgeEarly", r.flags.early_registration);
        toggleBadge("badgeGroup", r.flags.group_enrollment);
        toggleBadge("badgeIntensive", r.flags.intensive_course);
        toggleBadge("badgeWeekend", r.isWeekend);

        updateDurationInfo(mode, dateStart, timeStart);

        return r;
    }

    function updateDurationInfo(mode, dateStart, timeStart) {
        const durationInfo = document.getElementById("durationInfo");
        const endDateInfo = document.getElementById("endDateInfo");
        if (!durationInfo || !endDateInfo) return;

        if (mode === "tutor") {
            const hours = Math.min(40, Math.max(1, Number(document.getElementById("tutorDurationInput")?.value || 1)));
            durationInfo.textContent = `Длительность: ${hours} ч`;
            if (dateStart && timeStart) {
                const endTime = addHoursToTime(timeStart, hours);
                endDateInfo.textContent = `Окончание: ${formatDateRu(dateStart)} ${endTime}`;
            } else {
                endDateInfo.textContent = "";
            }
            return;
        }

        if (!state.selectedCourse) return;
        const c = state.selectedCourse;
        durationInfo.textContent = `Курс: ${c.total_length} недель, ${c.week_length} ч/нед`;

        if (dateStart) {
            const start = new Date(`${dateStart}T00:00:00`);
            const end = new Date(start.getTime() + (Math.max(0, Number(c.total_length || 1) - 1) * 7 * 24 * 60 * 60 * 1000));
            endDateInfo.textContent = `Последнее занятие: ${formatDateRu(toDateInputValue(end))}`;
        } else {
            endDateInfo.textContent = "";
        }
    }

    function toggleBadge(id, on) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle("d-none", !on);
    }

    async function submitOrder() {
        const mode = document.getElementById("orderMode")?.value || "course";
        const persons = Number(document.getElementById("personsInput")?.value || 1);

        const r = recalcMainOrderPrice();
        if (!r) return;

        let payload = null;

        if (mode === "tutor") {
            if (!state.selectedTutor) return;

            const dateStart = String(document.getElementById("tutorDateInput")?.value || "");
            const timeStart = String(document.getElementById("tutorTimeInput")?.value || "");
            const duration = Math.min(40, Math.max(1, Number(document.getElementById("tutorDurationInput")?.value || 1)));

            if (!dateStart || !timeStart) {
                showToast("Укажите дату и время занятия.", "warning");
                return;
            }

            payload = buildOrderPayload({
                tutorId: state.selectedTutor.id,
                courseId: 0,
                dateStart,
                timeStart,
                duration,
                persons,
                price: r.price,
                flags: r.flags
            });
        } else {
            if (!state.selectedCourse) return;

            const dateStart = String(document.getElementById("dateStartSelect")?.value || "");
            const timeStart = String(document.getElementById("timeStartSelect")?.value || "");

            if (!dateStart || !timeStart) {
                showToast("Выберите дату и время начала курса.", "warning");
                return;
            }

            payload = buildOrderPayload({
                tutorId: 0,
                courseId: state.selectedCourse.id,
                dateStart,
                timeStart,
                duration: 1,
                persons,
                price: r.price,
                flags: r.flags
            });
        }

        try {
            await apiFetchJson("/api/orders", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            showToast("Заявка успешно отправлена. Ее можно увидеть в личном кабинете.", "success");
            const modalEl = document.getElementById("orderModal");
            bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        } catch (e) {
            showToast(String(e.message || e), "danger");
        }
    }

    function escapeCell(v) {
        return window.LF.escapeHtml(v);
    }

    function escapeAttr(v) {
        return window.LF.escapeHtml(v);
    }
})();

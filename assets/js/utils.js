(function () {
    const cfg = window.APP_CONFIG;

    const LF = {
        getApiKey,
        apiFetchJson,

        showToast,
        debounce,

        formatMoney,
        formatDateRu,
        pad2,
        toDateInputValue,
        toTimeValue,

        escapeHtml,
        truncateText,

        timeToMinutes,
        minutesToTime,
        addHoursToTime,

        renderPagination,
        paginateArray,

        detectCourseLanguage,
        createAvatarDataUrl,

        computeTutorAvailability,
        tutorMatchesAvailability,

        calcPrice,
        buildOrderPayload
    };

    window.LF = LF;

    function getApiKey() {
        const v = cfg.apiKey;
        return v && String(v).trim() ? String(v).trim() : "";
    }


    function buildUrl(baseUrl, path) {
        const key = getApiKey();
        const glue = path.includes("?") ? "&" : "?";
        return `${baseUrl}${path}${glue}api_key=${encodeURIComponent(key)}`;
    }

    async function apiFetchJson(path, options) {
        const key = getApiKey();
        if (!key) {
            showToast("API Key не указан. Укажите его в assets/js/config.js (поле apiKey).", "danger");
            throw new Error("API key missing");
        }

        const primary = cfg.apiBaseUrlPrimary;
        const fallback = cfg.apiBaseUrlFallback;

        try {
            return await fetchOnce(buildUrl(primary, path), options);
        } catch (e) {
            return await fetchOnce(buildUrl(fallback, path), options);
        }
    }

    async function fetchOnce(url, options) {
        const opts = options ? { ...options } : {};
        opts.headers = opts.headers ? { ...opts.headers } : {};

        if (opts.body && !opts.headers["Content-Type"]) {
            opts.headers["Content-Type"] = "application/json";
        }

        const res = await fetch(url, opts);

        let data = null;
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
            data = await res.json();
        } else {
            const t = await res.text();
            data = t ? { message: t } : null;
        }

        if (!res.ok) {
            const msg = data && (data.error || data.message) ? (data.error || data.message) : `HTTP ${res.status}`;
            throw new Error(msg);
        }

        if (data && data.error) throw new Error(data.error);

        return data;
    }

    function showToast(message, variant) {
        const area = document.getElementById("notificationArea");
        if (!area) return;

        const v = variant || "primary";
        const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        const wrap = document.createElement("div");
        wrap.className = `toast align-items-center text-bg-${v} border-0`;
        wrap.id = id;
        wrap.role = "alert";
        wrap.ariaLive = "assertive";
        wrap.ariaAtomic = "true";

        wrap.innerHTML =
            `<div class="d-flex">
        <div class="toast-body">${escapeHtml(String(message || ""))}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Закрыть"></button>
      </div>`;

        area.appendChild(wrap);

        const toast = bootstrap.Toast.getOrCreateInstance(wrap, {
            delay: cfg.ui.toastAutoHideMs
        });
        toast.show();

        wrap.addEventListener("hidden.bs.toast", function () {
            wrap.remove();
        });
    }

    function debounce(fn, delay) {
        let t = null;
        return function () {
            const args = arguments;
            clearTimeout(t);
            t = setTimeout(function () {
                fn.apply(null, args);
            }, delay);
        };
    }

    function formatMoney(value) {
        const n = Number(value || 0);
        return new Intl.NumberFormat("ru-RU").format(Math.round(n));
    }

    function formatDateRu(yyyyMmDd) {
        if (!yyyyMmDd) return "";
        const parts = String(yyyyMmDd).split("-");
        if (parts.length !== 3) return String(yyyyMmDd);
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    function pad2(n) {
        return String(n).padStart(2, "0");
    }

    function toDateInputValue(d) {
        const dt = d instanceof Date ? d : new Date(d);
        return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    }

    function toTimeValue(d) {
        const dt = d instanceof Date ? d : new Date(d);
        return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    }

    function escapeHtml(s) {
        return String(s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function truncateText(text, maxLen) {
        const s = String(text || "");
        if (s.length <= maxLen) return s;
        return s.slice(0, maxLen - 1) + "…";
    }

    function timeToMinutes(hhmm) {
        if (!hhmm) return 0;
        const p = String(hhmm).split(":");
        const h = Number(p[0] || 0);
        const m = Number(p[1] || 0);
        return h * 60 + m;
    }

    function minutesToTime(mins) {
        const m = ((mins % 1440) + 1440) % 1440;
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${pad2(h)}:${pad2(mm)}`;
    }

    function addHoursToTime(hhmm, hours) {
        const start = timeToMinutes(hhmm);
        const end = start + Math.round(Number(hours || 0) * 60);
        return minutesToTime(end);
    }

    function paginateArray(items, page, perPage) {
        const p = Math.max(1, Number(page || 1));
        const size = Math.max(1, Number(perPage || 10));
        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / size));
        const safePage = Math.min(p, totalPages);
        const start = (safePage - 1) * size;
        const end = start + size;
        return {
            page: safePage,
            totalPages,
            slice: items.slice(start, end)
        };
    }

    function renderPagination(ul, currentPage, totalPages, onPage) {
        if (!ul) return;
        ul.innerHTML = "";

        const total = Math.max(1, Number(totalPages || 1));
        const page = Math.min(Math.max(1, Number(currentPage || 1)), total);

        ul.appendChild(makeItem("«", page <= 1, function () { onPage(page - 1); }));
        for (let i = 1; i <= total; i += 1) {
            ul.appendChild(makeNumber(i, i === page, function () { onPage(i); }));
        }
        ul.appendChild(makeItem("»", page >= total, function () { onPage(page + 1); }));

        function makeItem(label, disabled, handler) {
            const li = document.createElement("li");
            li.className = `page-item${disabled ? " disabled" : ""}`;
            const a = document.createElement("a");
            a.className = "page-link";
            a.href = "#";
            a.textContent = label;
            a.addEventListener("click", function (e) {
                e.preventDefault();
                if (disabled) return;
                handler();
            });
            li.appendChild(a);
            return li;
        }

        function makeNumber(n, active, handler) {
            const li = document.createElement("li");
            li.className = `page-item${active ? " active" : ""}`;
            const a = document.createElement("a");
            a.className = "page-link";
            a.href = "#";
            a.textContent = String(n);
            a.addEventListener("click", function (e) {
                e.preventDefault();
                handler();
            });
            li.appendChild(a);
            return li;
        }
    }

    function detectCourseLanguage(name) {
        const s = String(name || "").toLowerCase();
        const langs = [
            "english", "russian", "spanish", "german", "french", "italian",
            "chinese", "japanese", "korean", "arabic", "portuguese", "hindi"
        ];
        for (const l of langs) {
            if (s.includes(l)) return cap1(l);
        }
        return "";
    }

    function cap1(x) {
        if (!x) return "";
        return x[0].toUpperCase() + x.slice(1);
    }

    function createAvatarDataUrl(fullName, seed) {
        const name = String(fullName || "Tutor").trim();
        const parts = name.split(/\s+/).filter(Boolean);
        const a = (parts[0] || "T")[0] || "T";
        const b = (parts[1] || parts[0] || "F")[0] || "F";
        const initials = (a + b).toUpperCase();

        const n = Number(seed || 1);
        const hue = (n * 47) % 360;

        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <rect width="64" height="64" rx="32" fill="hsl(${hue},70%,45%)"/>
        <text x="50%" y="54%" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#fff">${escapeHtml(initials)}</text>
      </svg>`;

        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    function computeTutorAvailability(tutor) {
        const id = Number(tutor && tutor.id ? tutor.id : 1);
        const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

        const days = [];
        for (let i = 0; i < allDays.length; i += 1) {
            if (((id + i) % 2) === 0) days.push(allDays[i]);
        }
        if (days.length < 2) days.push(allDays[(id + 3) % 7], allDays[(id + 5) % 7]);

        const baseFrom = 8 + (id % 4);
        const baseTo = 17 + (id % 3);
        const timeFrom = `${pad2(baseFrom)}:00`;
        const timeTo = `${pad2(Math.min(baseTo, 21))}:00`;

        return { days: Array.from(new Set(days)), timeFrom, timeTo };
    }

    function tutorMatchesAvailability(tutor, wantedDays, wantedFrom, wantedTo) {
        const a = computeTutorAvailability(tutor);

        if (wantedDays && wantedDays.length) {
            const ok = wantedDays.every(function (d) { return a.days.includes(d); });
            if (!ok) return false;
        }

        const fromOk = wantedFrom ? timeToMinutes(a.timeTo) > timeToMinutes(wantedFrom) : true;
        const toOk = wantedTo ? timeToMinutes(a.timeFrom) < timeToMinutes(wantedTo) : true;

        return fromOk && toOk;
    }

    function calcPrice(input) {
        const p = cfg.pricing;

        const feePerHour = Number(input.feePerHour || 0);
        const durationHours = Math.max(1, Number(input.durationHours || 1));
        const persons = Math.min(20, Math.max(1, Number(input.persons || 1)));

        const dateStr = String(input.dateStart || "");
        const timeStr = String(input.timeStart || "00:00");

        const dateObj = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
        const day = dateObj.getDay();
        const isWeekend = day === 0 || day === 6;
        const weekendMultiplier = isWeekend ? p.weekendMultiplier : 1;

        const mins = timeToMinutes(timeStr);
        const isMorning = mins >= 9 * 60 && mins < 12 * 60;
        const isEvening = mins >= 18 * 60 && mins < 20 * 60;
        const morningSurcharge = isMorning ? p.morningSurcharge : 0;
        const eveningSurcharge = isEvening ? p.eveningSurcharge : 0;

        const now = new Date();
        const startMid = new Date(`${dateStr || toDateInputValue(now)}T00:00:00`);
        const diffDays = Math.floor((startMid - new Date(`${toDateInputValue(now)}T00:00:00`)) / (24 * 60 * 60 * 1000));
        const early = diffDays >= 30;

        const group = persons >= 5;

        const isCourse = Boolean(input.isCourse);
        const weekLength = Number(input.weekLength || 0);
        const totalWeeks = Number(input.totalWeeks || 0);
        const intensive = isCourse && weekLength >= p.intensiveThresholdWeekHours;

        const flags = {
            early_registration: early,
            group_enrollment: group,
            intensive_course: intensive,
            supplementary: Boolean(input.supplementary),
            personalized: Boolean(input.personalized),
            excursions: Boolean(input.excursions),
            assessment: Boolean(input.assessment),
            interactive: Boolean(input.interactive)
        };

        let base = feePerHour * durationHours * weekendMultiplier + morningSurcharge + eveningSurcharge;
        let total = base * persons;

        if (flags.supplementary) total += p.supplementaryPerStudent * persons;

        if (flags.personalized && isCourse) total += p.personalizedPerWeek * Math.max(1, totalWeeks);

        if (flags.assessment) total += p.assessmentFee;

        let mult = 1;
        if (flags.intensive_course) mult *= p.intensiveMultiplier;
        if (flags.excursions) mult *= p.excursionsMultiplier;
        if (flags.interactive) mult *= p.interactiveMultiplier;

        total *= mult;

        let discountMult = 1;
        if (flags.early_registration) discountMult *= (1 - p.earlyDiscount);
        if (flags.group_enrollment) discountMult *= (1 - p.groupDiscount);

        total *= discountMult;

        const price = Math.max(0, Math.round(total));

        const details = [];
        details.push(`База: ${formatMoney(feePerHour)} ₽/ч × ${durationHours} ч × ${weekendMultiplier}${isWeekend ? " (выходной)" : ""}`);
        if (morningSurcharge) details.push(`Утро: +${formatMoney(morningSurcharge)} ₽`);
        if (eveningSurcharge) details.push(`Вечер: +${formatMoney(eveningSurcharge)} ₽`);
        details.push(`Студенты: × ${persons}`);

        if (flags.supplementary) details.push(`Материалы: +${formatMoney(p.supplementaryPerStudent)} ₽/студ.`);
        if (flags.personalized && isCourse) details.push(`Индивидуальные: +${formatMoney(p.personalizedPerWeek)} ₽/нед.`);
        if (flags.assessment) details.push(`Оценка уровня: +${formatMoney(p.assessmentFee)} ₽`);
        if (flags.intensive_course) details.push(`Интенсив: × ${p.intensiveMultiplier}`);
        if (flags.excursions) details.push(`Экскурсии: × ${p.excursionsMultiplier}`);
        if (flags.interactive) details.push(`Платформа: × ${p.interactiveMultiplier}`);
        if (flags.early_registration) details.push(`Ранняя регистрация: -${Math.round(p.earlyDiscount * 100)}%`);
        if (flags.group_enrollment) details.push(`Группа 5+: -${Math.round(p.groupDiscount * 100)}%`);

        return { price, flags, isWeekend, isMorning, isEvening, details: details.join(" · ") };
    }

    function buildOrderPayload(input) {
        const flags = input.flags || {};
        return {
            tutor_id: Number(input.tutorId || 0),
            course_id: Number(input.courseId || 0),
            date_start: String(input.dateStart || ""),
            time_start: String(input.timeStart || ""),
            duration: Number(input.duration || 1),
            persons: Number(input.persons || 1),
            price: Number(input.price || 0),

            early_registration: Boolean(flags.early_registration),
            group_enrollment: Boolean(flags.group_enrollment),
            intensive_course: Boolean(flags.intensive_course),
            supplementary: Boolean(flags.supplementary),
            personalized: Boolean(flags.personalized),
            excursions: Boolean(flags.excursions),
            assessment: Boolean(flags.assessment),
            interactive: Boolean(flags.interactive)
        };
    }
})();

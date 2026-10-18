/* Alpha's page kit (harness slice 7b, 18 October 2026): the blocks a page the model draws is
 * made of, drawn by Alpha's own code in the app's look, so every page is clean the same way.
 * Served inline with the page's runtime; uses only the CSS variables the window hands in.
 *
 *   alpha.ui.page(function (data) { return [ ...blocks ]; })
 *
 * Blocks: {stat: {label, value, unit?, of?, note?}} · {stats: [stat, …]} · {chart: {title?,
 * kind: "line"|"bar", rows, x, series: [{field, label?, unit?, axis?: "right"}], target?:
 * {value, label?, axis?}, note?}} · {table: {title?, rows, columns: [{field, label?, unit?}],
 * limit?}} · {card: {title?, text?, html?}} · {text: "…"} · {grid: {columns?, blocks}}.
 * The page re-renders when the rows, the theme or the width change. */
(function () {
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SERIES = ["var(--primary)", "var(--chart-3)", "var(--warn)", "var(--good)", "var(--bad)", "var(--text-3)"];

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function svg(tag, attrs, children) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function esc(s) { return String(s == null ? "" : s); }

  function fmt(v, unit) {
    if (v == null || v === "") return "—";
    var n = Number(v);
    if (isNaN(n)) return esc(v);
    var abs = Math.abs(n);
    var text = abs >= 100 ? Math.round(n).toLocaleString() : abs >= 10 ? (Math.round(n * 10) / 10).toLocaleString()
      : (Math.round(n * 100) / 100).toLocaleString();
    return unit ? text + " " + unit : text;
  }
  function isDate(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v); }
  function dayLabel(v) {
    if (!isDate(v)) return esc(v);
    var d = v.slice(8, 10).replace(/^0/, ""), m = MONTHS[Number(v.slice(5, 7)) - 1] || "";
    return d + " " + m;
  }
  function nice(max) {
    if (!(max > 0)) return { top: 1, step: 0.25 };
    var raw = max / 4, pow = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * pow; }).filter(function (s) { return s >= raw; })[0];
    return { top: Math.ceil(max / step) * step, step: step };
  }

  // ---- blocks ----
  function stat(s) {
    var value = el("div", { class: "ak-stat__value" }, [el("span", { text: fmt(s.value) })]);
    if (s.of != null) value.appendChild(el("span", { class: "ak-stat__of", text: " / " + fmt(s.of) }));
    if (s.unit) value.appendChild(el("span", { class: "ak-stat__unit", text: " " + s.unit }));
    var box = el("div", { class: "ak-stat" }, [el("div", { class: "ak-stat__label", text: esc(s.label) }), value]);
    if (s.of != null && Number(s.of) > 0) {
      var pct = Math.max(0, Math.min(100, (Number(s.value) / Number(s.of)) * 100));
      box.appendChild(el("div", { class: "ak-bar" }, [el("div", { class: "ak-bar__fill", style: "width:" + pct + "%" })]));
    }
    if (s.note) box.appendChild(el("div", { class: "ak-note", text: esc(s.note) }));
    return box;
  }
  function stats(list) { return el("div", { class: "ak-stats" }, list.map(stat)); }
  function card(c) {
    var body = c.html ? el("div", { class: "ak-card__body", html: c.html }) : el("div", { class: "ak-card__body", text: esc(c.text) });
    return el("div", { class: "ak-card" }, [c.title ? el("h3", { class: "ak-title", text: esc(c.title) }) : null, body]);
  }
  function text(t) { return el("p", { class: "ak-text", text: esc(t) }); }
  function table(t) {
    var rows = (t.rows || []).slice(0, t.limit || 50);
    var cols = t.columns || (rows[0] ? Object.keys(rows[0]).map(function (k) { return { field: k }; }) : []);
    var head = el("tr", {}, cols.map(function (c) {
      var num = rows.some(function (r) { return typeof r[c.field] === "number"; });
      return el("th", { class: num ? "ak-num" : "", text: esc(c.label || humanize(c.field)) + (c.unit ? " (" + c.unit + ")" : "") });
    }));
    var body = rows.map(function (r) {
      return el("tr", {}, cols.map(function (c) {
        var v = r[c.field]; var num = typeof v === "number";
        return el("td", { class: num ? "ak-num" : "", text: num ? fmt(v) : isDate(v) ? dayLabel(v) : esc(v) });
      }));
    });
    var wrap = el("div", { class: "ak-card" }, [t.title ? el("h3", { class: "ak-title", text: esc(t.title) }) : null]);
    if (!rows.length) wrap.appendChild(el("p", { class: "ak-empty", text: "Nothing to show yet." }));
    else wrap.appendChild(el("table", { class: "ak-table" }, [el("thead", {}, [head]), el("tbody", {}, body)]));
    return wrap;
  }
  function humanize(s) { return esc(s).replace(/_/g, " ").replace(/^\w/, function (c) { return c.toUpperCase(); }); }

  function chart(c, width) {
    var rows = c.rows || [], series = c.series || [], kind = c.kind === "bar" ? "bar" : "line";
    var wrap = el("div", { class: "ak-card ak-chart" }, [c.title ? el("h3", { class: "ak-title", text: esc(c.title) }) : null]);
    if (!rows.length || !series.length) {
      wrap.appendChild(el("p", { class: "ak-empty", text: "Nothing to draw yet." }));
      return wrap;
    }
    // the legend above: one dot and label per series
    wrap.appendChild(el("div", { class: "ak-legend" }, series.map(function (s, i) {
      return el("span", { class: "ak-legend__item" }, [
        el("i", { class: "ak-legend__dot", style: "background:" + SERIES[i % SERIES.length] }),
        el("span", { text: esc(s.label || humanize(s.field)) + (s.unit ? " (" + s.unit + ")" : "") })]);
    })));
    var left = series.filter(function (s) { return s.axis !== "right"; }), right = series.filter(function (s) { return s.axis === "right"; });
    function maxOf(list) {
      var m = 0;
      list.forEach(function (s) { rows.forEach(function (r) { var v = Number(r[s.field]); if (!isNaN(v) && v > m) m = v; }); });
      if (c.target && (c.target.axis === "right") === (list === right) && Number(c.target.value) > m) m = Number(c.target.value);
      return m;
    }
    var L = nice(maxOf(left)), R = right.length ? nice(maxOf(right)) : null;
    var H = 240, padL = 12 + String(fmt(L.top)).length * 7, padR = R ? 12 + String(fmt(R.top)).length * 7 : 12, padT = 12, padB = 30;
    var W = Math.max(280, width || 600), iw = W - padL - padR, ih = H - padT - padB;
    var n = rows.length, xs = rows.map(function (r) { return r[c.x]; });
    function px(i) { return kind === "bar" ? padL + (i + 0.5) * (iw / n) : padL + (n === 1 ? iw / 2 : (i * iw) / (n - 1)); }
    function py(v, ax) { return padT + ih - (Number(v) / ax.top) * ih; }
    var g = svg("svg", { class: "ak-svg", viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": esc(c.title || "chart") });
    // grid and left ticks
    for (var t = 0; t <= L.top + 1e-9; t += L.step) {
      var y = py(t, L);
      g.appendChild(svg("line", { x1: padL, x2: W - padR, y1: y, y2: y, class: "ak-grid" }));
      g.appendChild(svg("text", { x: padL - 6, y: y + 4, class: "ak-tick ak-tick--l", text: fmt(t) }));
    }
    if (R) for (var u = 0; u <= R.top + 1e-9; u += R.step) {
      g.appendChild(svg("text", { x: W - padR + 6, y: py(u, R) + 4, class: "ak-tick", text: fmt(u) }));
    }
    // x labels, thinned to fit
    var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
    xs.forEach(function (x, i) {
      if (i % every !== 0 && i !== n - 1) return;
      if (i === n - 1 && n > 1 && (n - 1) % every !== 0 && (n - 1) % every < every / 2) return;
      g.appendChild(svg("text", { x: px(i), y: H - 8, class: "ak-tick ak-tick--x", text: dayLabel(x) }));
    });
    // the target: one thin dashed line with its label at the right end
    if (c.target && c.target.value != null) {
      var ax = c.target.axis === "right" && R ? R : L, ty = py(c.target.value, ax);
      g.appendChild(svg("line", { x1: padL, x2: W - padR, y1: ty, y2: ty, class: "ak-target" }));
      // the label sits above the line, or below it when the line is near the top
      var below = ty - padT < 24;
      g.appendChild(svg("text", { x: W - padR - 4, y: below ? ty + 14 : ty - 5, class: "ak-tick ak-tick--target", text: esc(c.target.label || ("target " + fmt(c.target.value))) }));
    }
    // the series
    var bw = kind === "bar" ? Math.max(2, (iw / n) * 0.7 / series.length) : 0;
    series.forEach(function (s, si) {
      var ax = s.axis === "right" && R ? R : L, colour = SERIES[si % SERIES.length];
      if (kind === "bar") {
        rows.forEach(function (r, i) {
          var v = Number(r[s.field]); if (isNaN(v)) return;
          var x = px(i) - (bw * series.length) / 2 + si * bw, y = py(v, ax);
          g.appendChild(svg("rect", { x: x, y: y, width: bw, height: padT + ih - y, rx: 2, fill: colour }, [svg("title", { text: dayLabel(r[c.x]) + ": " + fmt(v, s.unit) })]));
        });
        return;
      }
      var pts = rows.map(function (r, i) { var v = Number(r[s.field]); return isNaN(v) ? null : px(i) + "," + py(v, ax); });
      var runs = [], cur = [];
      pts.forEach(function (p) { if (p) cur.push(p); else if (cur.length) { runs.push(cur); cur = []; } });
      if (cur.length) runs.push(cur);
      // thin lines and small points: the weight of a chart in the app (Kenil, 18 Oct: "the
      // lines in chart are too thick"); a hover target wider than the line, unseen
      runs.forEach(function (run) { g.appendChild(svg("polyline", { points: run.join(" "), fill: "none", stroke: colour, "stroke-width": 1.25, "stroke-linejoin": "round", "stroke-linecap": "round" })); });
      if (n <= 40) rows.forEach(function (r, i) {
        var v = Number(r[s.field]); if (isNaN(v)) return;
        g.appendChild(svg("circle", { cx: px(i), cy: py(v, ax), r: 2, fill: colour }, [svg("title", { text: dayLabel(r[c.x]) + ": " + fmt(v, s.unit) })]));
      });
    });
    wrap.appendChild(g);
    if (c.note) wrap.appendChild(el("div", { class: "ak-note", text: esc(c.note) }));
    return wrap;
  }

  function block(b, width) {
    if (!b) return null;
    if (typeof b === "string") return text(b);
    if (b.stat) return stats([b.stat]);
    if (b.stats) return stats(b.stats);
    if (b.chart) return chart(b.chart, width);
    if (b.table) return table(b.table);
    if (b.card) return card(b.card);
    if (b.text != null) return text(b.text);
    if (b.grid) {
      var cols = b.grid.columns || 2;
      return el("div", { class: "ak-grid", style: "grid-template-columns: repeat(" + cols + ", minmax(0, 1fr))" },
        (b.grid.blocks || []).map(function (x) { return block(x, (width - 16 * (cols - 1)) / cols - 32); }));
    }
    return el("p", { class: "ak-empty", text: "A block the kit does not know: " + Object.keys(b).join(", ") });
  }

  var root = null, maker = null;
  function render() {
    if (!maker) return;
    if (!root) {
      root = document.getElementById("alpha-page") || el("main", { class: "ak-page", id: "alpha-page" });
      if (!root.parentNode) document.body.appendChild(root);
      root.className = "ak-page";
    }
    var width = (root.clientWidth || document.documentElement.clientWidth || 640) - 32;
    var blocks;
    try { blocks = maker(window.alpha.data || {}); } catch (e) { window.alpha._report && window.alpha._report(e); throw e; }
    var next = (blocks || []).map(function (b) { return block(b, width); }).filter(Boolean);
    root.replaceChildren.apply(root, next);
  }
  var timer = null;
  function later() { clearTimeout(timer); timer = setTimeout(render, 30); }
  function page(fn) {
    maker = fn;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
    window.alpha.on("data", later);
    window.alpha.on("theme", later);
    if (window.ResizeObserver) new ResizeObserver(later).observe(document.documentElement);
    else window.addEventListener("resize", later);
  }
  window.alpha.ui = { page: page, block: block, fmt: fmt, dayLabel: dayLabel, render: render };
})();

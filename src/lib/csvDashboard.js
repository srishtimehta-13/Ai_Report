export const DASHBOARD_DATA_KEY = "reportai_dashboard";

function splitCsvRow(line) {
  return line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
}

export function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvRow(lines[0]);
  const rows = lines.slice(1, 5001).map(splitCsvRow);
  return { headers, rows };
}

function columnNumericValues(rows, colIndex) {
  const vals = [];
  for (const row of rows) {
    const v = row[colIndex];
    if (v === undefined || v === "") continue;
    const n = Number(String(v).replace(/[$,]/g, ""));
    if (!Number.isFinite(n)) return null;
    vals.push(n);
  }
  return vals.length ? vals : null;
}

function isLikelyGeoCoordinateName(name) {
  const s = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return /^(lat|latitude|lng|lon|long|longitude)$/.test(s);
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}k`;
  if (abs >= 100) return n.toFixed(1);
  return n.toFixed(2);
}

/** Degrees-style values: no k/M/B suffix that looks like money. */
function fmtCoord(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
}

/**
 * Build a serializable snapshot for the dashboard from raw CSV text.
 * @returns {object | null}
 */
export function buildDashboardSnapshot(fileName, text) {
  const { headers, rows } = parseCsvText(text);
  if (!headers.length || !rows.length) return null;

  const numericCols = [];
  for (let j = 0; j < headers.length; j++) {
    const values = columnNumericValues(rows, j);
    if (values) {
      numericCols.push({
        index: j,
        name: (headers[j] || `Column ${j + 1}`).trim() || `Column ${j + 1}`,
        values,
      });
    }
  }
  if (!numericCols.length) return null;

  const nonGeoNumeric = numericCols.filter((c) => !isLikelyGeoCoordinateName(c.name));
  
  let primary = null;
  // 1. Prioritize obvious business/target metrics
  primary = nonGeoNumeric.find(c => /(^|[^a-z])(revenue|sales|profit|price|cost|usd|salary|income|value|worth|target|label|\$)([^a-z]|$)/i.test(c.name));
  
  // 2. If not found, prioritize the LAST numeric column (exclude IDs/Age)
  if (!primary && nonGeoNumeric.length > 0) {
    const validMetrics = nonGeoNumeric.filter(c => !/(^|[^a-z])(age|id|year|month|day|date|index)([^a-z]|$)/i.test(c.name));
    if (validMetrics.length > 0) {
      primary = validMetrics[validMetrics.length - 1];
    } else {
      primary = nonGeoNumeric[nonGeoNumeric.length - 1]; 
    }
  }
  
  // 3. Fallback
  if (!primary) primary = numericCols[numericCols.length - 1] || numericCols[0];

  const primaryIsGeo = isLikelyGeoCoordinateName(primary.name);
  const vals = primary.values;
  const n = vals.length;
  const sum = vals.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mid = Math.floor(n / 2) || 1;
  const firstAvg = vals.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const rest = vals.slice(mid);
  const secondAvg = rest.length ? rest.reduce((a, b) => a + b, 0) / rest.length : firstAvg;
  const denom = Math.abs(firstAvg) > 1e-9 ? Math.abs(firstAvg) : 1;
  const trendPct = ((secondAvg - firstAvg) / denom) * 100;

  const labelColIdx = primary.index === 0 ? null : 0;
  const lineData = [];
  const maxPts = 200;
  const step = Math.max(1, Math.ceil(n / maxPts));
  let pt = 0;
  for (let i = 0; i < n; i += step) {
    pt += 1;
    let fullLabel = `Row ${i + 1}`;
    if (labelColIdx !== null && rows[i] && rows[i][labelColIdx] !== undefined) {
      const raw = String(rows[i][labelColIdx]).trim();
      if (raw) fullLabel = raw.length > 40 ? `${raw.slice(0, 38)}…` : raw;
    }
    lineData.push({ name: String(pt), fullLabel, value: vals[i] });
  }

  let barData = [];
  const catIndices = headers.map((_, i) => i).filter((i) => i !== primary.index);
  for (const ci of catIndices) {
    const keys = rows.map((r) => String(r[ci] ?? "").trim()).filter(Boolean);
    const uniq = new Set(keys).size;
    if (uniq === 0 || uniq > 24) continue;
    const agg = {};
    const counts = primaryIsGeo ? {} : null;
    for (const r of rows) {
      const k = String(r[ci] ?? "Other").trim().slice(0, 24) || "Other";
      const raw = r[primary.index];
      const nv = Number(String(raw ?? "").replace(/[$,]/g, ""));
      if (!Number.isFinite(nv)) continue;
      if (primaryIsGeo) {
        agg[k] = (agg[k] || 0) + nv;
        counts[k] = (counts[k] || 0) + 1;
      } else {
        agg[k] = (agg[k] || 0) + nv;
      }
    }
    const entries = primaryIsGeo
      ? Object.entries(agg).map(([name, s]) => [name, s / counts[name]])
      : Object.entries(agg);
    if (entries.length) {
      barData = entries
        .map(([name, current]) => ({ name, current }))
        .sort((a, b) => b.current - a.current)
        .slice(0, 12);
      break;
    }
  }

  if (!barData.length) {
    barData = numericCols.slice(0, 8).map((c) => {
      const geo = isLikelyGeoCoordinateName(c.name);
      const valsCol = c.values;
      const total = valsCol.reduce((a, b) => a + b, 0);
      return {
        name: c.name.length > 16 ? `${c.name.slice(0, 14)}…` : c.name,
        current: geo ? total / valsCol.length : total,
      };
    });
  }

  const useDollar =
    !primaryIsGeo &&
    /(^|[^a-z])(revenue|sales|price|cost|usd|profit|salary|income|worth|\$)([^a-z]|$)/i.test(primary.name);

  const kpis = primaryIsGeo
    ? [
        {
          title: `Mean · ${primary.name}`,
          value: fmtCoord(mean),
          subtitle: `${n} rows (coordinates, not currency)`,
          trend: "neutral",
          icon: "activity",
        },
        {
          title: `Span · ${primary.name}`,
          value: fmtCoord(max - min),
          subtitle: `min ${fmtCoord(min)} — max ${fmtCoord(max)}`,
          trend: "neutral",
          icon: "trend",
        },
        {
          title: "Order trend",
          value: `${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%`,
          subtitle: "later vs earlier rows (file order only)",
          trend: trendPct >= 0 ? "up" : "down",
          icon: "trend",
        },
        {
          title: "Numeric columns",
          value: String(numericCols.length),
          subtitle: `${headers.length} columns total`,
          trend: "neutral",
          icon: "alert",
        },
      ]
    : [
        {
          title: `Sum · ${primary.name}`,
          value: fmtNum(sum),
          subtitle: `${n} rows in file`,
          trend: "neutral",
          icon: "dollar",
        },
        {
          title: "Period trend",
          value: `${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%`,
          subtitle: "later vs earlier rows",
          trend: trendPct >= 0 ? "up" : "down",
          icon: "trend",
        },
        {
          title: `Average · ${primary.name}`,
          value: fmtNum(mean),
          subtitle: `min ${fmtNum(min)} · max ${fmtNum(max)}`,
          trend: "neutral",
          icon: "activity",
        },
        {
          title: "Numeric columns",
          value: String(numericCols.length),
          subtitle: `${headers.length} columns total`,
          trend: "neutral",
          icon: "alert",
        },
      ];

  return {
    fileName,
    updatedAt: new Date().toISOString(),
    rowCount: rows.length,
    columns: headers,
    primaryMetric: primary.name,
    primaryIsGeo,
    barAggregation: primaryIsGeo ? "mean" : "sum",
    useDollar,
    lineData,
    barData,
    kpis,
  };
}

export function persistDashboardSnapshot(snapshot) {
  if (!snapshot) {
    sessionStorage.removeItem(DASHBOARD_DATA_KEY);
  } else {
    sessionStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(snapshot));
  }
  window.dispatchEvent(new Event("reportai-dashboard-updated"));
}

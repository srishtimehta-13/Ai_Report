import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { API_BASE } from '../lib/api';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Upload,
  MessageCircle,
  Search,
  Loader2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { DASHBOARD_DATA_KEY } from '../lib/csvDashboard';

const iconMap = {
  dollar: DollarSign,
  trend: TrendingUp,
  activity: Activity,
  alert: AlertTriangle,
};

function formatTick(value, useDollar, primaryIsGeo) {
  if (!Number.isFinite(value)) return '';
  if (primaryIsGeo) {
    const s = value.toFixed(4).replace(/\.?0+$/, '');
    return s || '0';
  }
  if (useDollar) {
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  }
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value * 100) / 100);
}

function LineTooltip({ active, payload, useDollar, primaryIsGeo }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const v = row.value;
  const label = row.fullLabel ?? `Point ${row.name}`;
  const formatted = formatTick(v, useDollar, primaryIsGeo);
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white shadow-xl max-w-xs">
      <div className="text-slate-400 text-xs mb-1 break-words">{label}</div>
      <div className="font-medium text-white">{formatted}</div>
    </div>
  );
}

export const Dashboard = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [socialQuery, setSocialQuery] = useState('');
  const [isFetchingSocial, setIsFetchingSocial] = useState(false);
  const [quickReviews, setQuickReviews] = useState(null);

  const fetchSocialReviews = async (e) => {
    e.preventDefault();
    if (!socialQuery.trim()) return;
    setIsFetchingSocial(true);
    try {
      const params = new URLSearchParams({ query: socialQuery.trim(), max_results: "6" });
      const res = await fetch(`${API_BASE}/social-reviews?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      
      if (!data.items || data.items.length === 0) {
        throw new Error("Empty insights");
      }
      setQuickReviews(data.items);
    } catch (err) {
      console.error(err);
      setQuickReviews([]);
    } finally {
      setIsFetchingSocial(false);
    }
  };

  const renderSocialMedia = () => (
    <div className="mt-12 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-4xl border-t border-slate-800/60 pt-8">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-sky-400" />
        👉 Social Media Insights
      </h2>
      <p className="text-sm text-slate-400 -mt-1 mb-4">
        Quickly check what people are saying online about any company or sector without needing a CSV.
      </p>
      
      <form onSubmit={fetchSocialReviews} className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <Input 
            placeholder="Enter Company or Industry (e.g., Nike)" 
            className="pl-9 bg-slate-800/50 text-white border-slate-700 focus:border-accent w-full flex h-10 rounded-md border text-sm"
            value={socialQuery}
            onChange={(e) => setSocialQuery(e.target.value)}
          />
        </div>
        <Button disabled={!socialQuery.trim() || isFetchingSocial} type="submit" className="min-w-[140px] shadow-lg shadow-accent/20">
          {isFetchingSocial ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Fetching...</>
          ) : "Fetch Reviews"}
        </Button>
      </form>
      
      {quickReviews && quickReviews.length === 0 && (
        <div className="text-slate-400 p-4 border border-slate-700/50 rounded-lg bg-slate-800/20 text-center">
          No reviews found.
        </div>
      )}

      {quickReviews && quickReviews.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 mb-2">
            <Badge variant="success" className="px-3 py-1">🟢 {Math.round(quickReviews.filter(r => (r.sentiment||'').toLowerCase() === 'positive').length / quickReviews.length * 100)}% Positive</Badge>
            <Badge variant="warning" className="px-3 py-1 bg-amber-500/10 text-amber-500 border-amber-500/20">🟡 {Math.round(quickReviews.filter(r => (r.sentiment||'').toLowerCase() === 'neutral').length / quickReviews.length * 100)}% Neutral</Badge>
            <Badge variant="danger" className="px-3 py-1 border-red-500/20 text-red-500">🔴 {Math.round(quickReviews.filter(r => (r.sentiment||'').toLowerCase() === 'negative').length / quickReviews.length * 100)}% Negative</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickReviews.map((rev, i) => {
              const s = (rev.sentiment || 'neutral').toLowerCase();
              const badgeVariant = s === 'positive' ? 'success' : s === 'negative' ? 'danger' : 'warning';
              const label = s === 'positive' ? 'Positive' : s === 'negative' ? 'Negative' : 'Neutral';
              const platform = rev.platform || 'News';
              const icon = platform === 'Twitter' ? '🐦 ' : platform === 'Reddit' ? '🤖 ' : '📰 ';
              return (
                <Card key={i} className={s === 'positive' ? 'border-emerald-500/25 bg-emerald-950/10' : s === 'negative' ? 'border-red-500/25 bg-red-950/10' : 'border-amber-500/20 bg-amber-950/10'}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-semibold text-white text-sm leading-snug">{icon}{platform} | {rev.title}</h4>
                      <Badge variant={badgeVariant} className="shrink-0 text-[10px] py-0">{label}</Badge>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-6 text-left">{rev.summary || rev.text}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const loadSnapshot = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(DASHBOARD_DATA_KEY);
      setSnapshot(raw ? JSON.parse(raw) : null);
    } catch {
      setSnapshot(null);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
    window.addEventListener('storage', loadSnapshot);
    window.addEventListener('reportai-dashboard-updated', loadSnapshot);
    return () => {
      window.removeEventListener('storage', loadSnapshot);
      window.removeEventListener('reportai-dashboard-updated', loadSnapshot);
    };
  }, [loadSnapshot]);

  if (!snapshot?.lineData?.length) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-slate-400 mt-2 text-lg">
            Charts and KPIs fill in automatically from your uploaded CSV (needs at least one numeric column).
          </p>
        </div>
        <Card className="border-dashed border-slate-600 bg-slate-900/30">
          <CardHeader>
            <CardTitle className="text-white">No dataset linked</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-slate-400">
            <p>Upload a CSV on the Upload page. As soon as the file is read, this dashboard updates with totals, trends, and charts from your numbers.</p>
            <Link
              to="/upload"
              className="inline-flex items-center justify-center gap-2 rounded-lg h-10 px-4 font-medium bg-accent text-white hover:bg-blue-600 shadow-sm shadow-accent/20 transition-colors w-fit"
            >
              <Upload className="w-4 h-4" />
              Upload data
            </Link>
          </CardContent>
        </Card>
        
        {renderSocialMedia()}
      </div>
    );
  }

  const {
    lineData,
    barData,
    kpis,
    primaryMetric,
    fileName,
    useDollar,
    lastAnalysis,
    rowCount,
  } = snapshot;
  const primaryIsGeo = Boolean(snapshot.primaryIsGeo);
  const barAggregation = snapshot.barAggregation ?? 'sum';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-slate-400 mt-2 text-lg">Metrics from your latest upload</p>
        <p className="text-slate-500 text-sm mt-2">
          <span className="text-slate-300">{fileName}</span>
          {rowCount != null ? ` · ${rowCount} rows` : ''}
          {lastAnalysis?.model ? ` · last AI run: ${lastAnalysis.model}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => {
          const Icon = iconMap[kpi.icon] || Activity;
          const trendUp = kpi.trend === 'up';
          const trendDown = kpi.trend === 'down';
          return (
            <Card key={i} className="hover:-translate-y-1 transition-transform duration-300">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">
                  {kpi.title}
                </CardTitle>
                <kbd className="p-2 bg-slate-800/50 rounded-lg">
                  <Icon className="h-4 w-4 text-accent" />
                </kbd>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight break-words">
                  {kpi.value}
                </div>
                <p
                  className={`text-sm mt-2 font-medium flex items-center flex-wrap gap-1 ${
                    trendUp ? 'text-emerald-500' : trendDown ? 'text-red-400' : 'text-slate-500'
                  }`}
                >
                  {trendUp ? <TrendingUp className="w-3 h-3 shrink-0" /> : null}
                  {trendDown ? <TrendingDown className="w-3 h-3 shrink-0" /> : null}
                  {kpi.subtitle}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>
              {primaryIsGeo
                ? `Coordinate by row order — ${primaryMetric}`
                : `Values over rows — ${primaryMetric}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px] min-w-0">
            <div className="h-[300px] w-full min-h-[280px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatTick(v, useDollar, primaryIsGeo)}
                  />
                  <RechartsTooltip
                    content={
                      <LineTooltip useDollar={useDollar} primaryIsGeo={primaryIsGeo} />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3B82F6"
                    strokeWidth={3}
                    dot={{ fill: '#3B82F6', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Comparison</CardTitle>
            <p className="text-xs text-slate-500 font-normal mt-1">
              {primaryIsGeo
                ? 'Mean coordinate by category when a categorical column fits; otherwise mean per numeric column'
                : 'Totals by category when a categorical column fits; otherwise sum per numeric column'}
            </p>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px] min-w-0">
            <div className="h-[300px] w-full min-h-[280px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={56} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatTick(v, useDollar, primaryIsGeo)}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#1E293B',
                      borderColor: '#334155',
                      borderRadius: '8px',
                    }}
                    formatter={(value) => [
                      formatTick(value, useDollar, primaryIsGeo),
                      barAggregation === 'mean'
                        ? `Mean · ${primaryMetric}`
                        : primaryMetric,
                    ]}
                  />
                  <Bar dataKey="current" fill="#3B82F6" radius={[4, 4, 0, 0]} name={primaryMetric} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {renderSocialMedia()}
    </div>
  );
};

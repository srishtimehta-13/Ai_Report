import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { formatApiError } from '../lib/utils';
import { API_BASE } from '../lib/api';
import {
  Search,
  Globe,
  Target,
  TrendingUp,
  Sparkles,
  MoveRight,
  Loader2,
  ArrowUpRight,
  MessageCircle,
  Trophy,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const LAST_INSIGHTS_KEY = 'reportai_last_insights';
export const DASHBOARD_DATA_KEY = "reportai_dashboard";

export const Insights = () => {
  const location = useLocation();
  const [industry, setIndustry] = useState(location.state?.industry || '');
  const [isFetchingSignals, setIsFetchingSignals] = useState(false);
  const [signals, setSignals] = useState([]);
  const [signalError, setSignalError] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [socialReviews, setSocialReviews] = useState([]);
  const [socialOverall, setSocialOverall] = useState(null);
  const [compAnalysis, setCompAnalysis] = useState(null);
  const [isFetchingComps, setIsFetchingComps] = useState(false);
  const [compError, setCompError] = useState(null);
  const [userValue, setUserValue] = useState(0);

  useEffect(() => {
    try {
      const dash = JSON.parse(sessionStorage.getItem(DASHBOARD_DATA_KEY));
      if (dash && dash.kpis && dash.kpis.length > 0) {
        const valStr = dash.kpis[0].value.replace(/[^0-9.]/g, '');
        let multiplier = 1;
        if (dash.kpis[0].value.includes('k')) multiplier = 1e3;
        if (dash.kpis[0].value.includes('M')) multiplier = 1e6;
        if (dash.kpis[0].value.includes('B')) multiplier = 1e9;
        setUserValue(parseFloat(valStr) * multiplier);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (location.state?.analyzed && location.state?.aiData) {
      setAiInsights(location.state.aiData);
      if (location.state.industry != null) {
        setIndustry(location.state.industry);
      }
      if (Array.isArray(location.state.socialReviews)) {
        setSocialReviews(location.state.socialReviews);
      }
      if (location.state.socialOverall != null) {
        setSocialOverall(location.state.socialOverall);
      }
      return;
    }

    try {
      const raw = sessionStorage.getItem(LAST_INSIGHTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.aiData) setAiInsights(parsed.aiData);
      if (parsed?.industry != null) setIndustry((prev) => prev || parsed.industry);
      if (Array.isArray(parsed?.socialReviews)) setSocialReviews(parsed.socialReviews);
      if (parsed?.socialOverall != null) setSocialOverall(parsed.socialOverall);
    } catch {
      /* ignore corrupt storage */
    }
  }, [location.state, location.key]);

  const handleFetchCompetitors = async () => {
    if (!industry.trim()) return;
    setIsFetchingComps(true);
    setCompError(null);
    try {
      const url = `${API_BASE}/competitor-analysis?industry=${encodeURIComponent(industry.trim())}&user_value=${userValue}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await formatApiError(res));
      const data = await res.json();
      setCompAnalysis(data);
    } catch (err) {
      console.error(err);
      setCompError(err.message || 'Could not load competitor analysis.');
    } finally {
      setIsFetchingComps(false);
    }
  };

  const handleFetchSignals = async (e) => {
    e.preventDefault();
    if (!industry.trim()) return;

    setIsFetchingSignals(true);
    setSignalError(null);
    setSignals([]);

    try {
      const url = `${API_BASE}/market-signals?industry=${encodeURIComponent(industry.trim())}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(await formatApiError(res));
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setSignals(items);
    } catch (err) {
      console.error(err);
      setSignalError(err.message || 'Could not load market signals.');
    } finally {
      setIsFetchingSignals(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out max-w-6xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center">
          <Sparkles className="w-8 h-8 mr-3 text-accent" />
          AI Insights & Market Intelligence
        </h1>
        <p className="text-slate-400 mt-2 text-lg">Combine your internal metrics with external signals for predictive forecasting.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Globe className="w-5 h-5 mr-2 text-accent" />
                External Market Signals
              </CardTitle>
              <p className="text-sm text-slate-400">Fetch recent web snippets for your sector (same source as analysis).</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFetchSignals} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Industry Sector</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <Input
                      placeholder="e.g. SaaS, Real Estate..."
                      className="pl-9"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={!industry.trim() || isFetchingSignals}>
                  {isFetchingSignals ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Fetching...</>
                  ) : (
                    "Fetch Market Trends"
                  )}
                </Button>
              </form>
              {signalError && (
                <p className="text-sm text-red-400 mt-3">{signalError}</p>
              )}
            </CardContent>
          </Card>

          {signals.length > 0 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-500">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest px-1">Latest Signals</h3>
              {signals.map((signal, i) => (
                <Card key={i} className="bg-slate-800/20 border-slate-700/40 hover:bg-slate-800/40 transition-colors">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="font-semibold text-white text-sm pr-2 leading-tight">{signal.title}</h4>
                      <Badge variant={signal.trend === 'up' ? 'success' : signal.trend === 'down' ? 'warning' : 'default'} className="shrink-0 text-[10px] py-0">
                        {signal.source || 'Web'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{signal.summary}</p>
                    {signal.href ? (
                      <a href={signal.href} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline break-all">
                        {signal.href}
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!aiInsights ? (
            <Card className="h-full flex flex-col items-center justify-center min-h-[400px] border-dashed bg-transparent border-slate-700">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-xl font-semibold text-white">No active analysis</h3>
              <p className="text-slate-400 text-center max-w-sm mt-2">
                Upload a CSV on the Upload page to run Gemini analysis, or fetch market signals on the left.
              </p>
            </Card>
          ) : (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <Card className="border-accent/30 bg-gradient-to-br from-slate-900 via-[#1E293B] to-slate-900 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-accent/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <CardHeader>
                  <CardTitle className="flex items-center text-xl">
                    <Target className="w-6 h-6 mr-3 text-accent" />
                    Internal Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-300 leading-relaxed text-lg">
                    {aiInsights.internal_analysis}
                  </p>
                </CardContent>
              </Card>

              <div className="flex justify-center -my-3 relative z-10">
                <div className="bg-slate-800 p-2 rounded-full border border-slate-700">
                  <MoveRight className="w-5 h-5 text-slate-400 transform rotate-90" />
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-xl">
                    <Globe className="w-6 h-6 mr-3 text-emerald-500" />
                    Market Connection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-300 leading-relaxed text-lg">
                    {aiInsights.market_connection}
                  </p>
                </CardContent>
              </Card>

              <div className="flex justify-center -my-3 relative z-10">
                <div className="bg-slate-800 p-2 rounded-full border border-slate-700">
                  <MoveRight className="w-5 h-5 text-slate-400 transform rotate-90" />
                </div>
              </div>

              <Card className="border-emerald-500/30 shadow-[0_0_30px_-15px_rgba(16,185,129,0.3)] bg-gradient-to-b from-slate-900 to-[#0f1f1a]">
                <CardHeader>
                  <CardTitle className="flex items-center text-2xl text-white">
                    <TrendingUp className="w-7 h-7 mr-3 text-emerald-500" />
                    Future Forecast
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-emerald-100 leading-relaxed text-lg font-medium">
                    {aiInsights.forecast}
                  </p>

                  <div className="mt-8 pt-6 border-t border-emerald-500/20 flex flex-wrap gap-3 items-center">
                    <Badge variant="success" className="px-3 py-1 flex items-center text-sm">
                      <ArrowUpRight className="w-4 h-4 mr-1" /> AI forecast
                    </Badge>
                    {aiInsights._meta?.model ? (
                      <Badge variant="warning" className="px-3 py-1 text-sm bg-slate-800 text-slate-300 border-slate-600">
                        {aiInsights._meta.model}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500 mt-4 max-w-prose">
                    Outputs are generated from your file and public web snippets—not financial or legal advice. Validate before acting.
                  </p>
                </CardContent>
              </Card>

              {(socialReviews.length > 0 || socialOverall) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <MessageCircle className="w-6 h-6 text-sky-400" />
                    Social Media Insights
                  </h2>
                  <p className="text-sm text-slate-400 -mt-1">
                    Recent public web snippets about your sector (reviews, sentiment, social opinion). Rule-based sentiment labels.
                  </p>

                  {socialOverall && (
                    <Card className="border-slate-700/60 bg-slate-900/40">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base text-slate-200">Overall sentiment score</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
                          {socialOverall.positive_pct > 0 && (
                            <div
                              className="bg-emerald-500 transition-all"
                              style={{ width: `${socialOverall.positive_pct}%` }}
                              title={`Positive ${socialOverall.positive_pct}%`}
                            />
                          )}
                          {socialOverall.neutral_pct > 0 && (
                            <div
                              className="bg-amber-500/90 transition-all"
                              style={{ width: `${socialOverall.neutral_pct}%` }}
                              title={`Neutral ${socialOverall.neutral_pct}%`}
                            />
                          )}
                          {socialOverall.negative_pct > 0 && (
                            <div
                              className="bg-red-500 transition-all"
                              style={{ width: `${socialOverall.negative_pct}%` }}
                              title={`Negative ${socialOverall.negative_pct}%`}
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <span className="text-emerald-400 font-medium">
                            Positive {socialOverall.positive_pct}%
                          </span>
                          <span className="text-amber-400 font-medium">
                            Neutral {socialOverall.neutral_pct}%
                          </span>
                          <span className="text-red-400 font-medium">
                            Negative {socialOverall.negative_pct}%
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {socialReviews.map((rev, i) => {
                      const s = (rev.sentiment || 'neutral').toLowerCase();
                      const badgeVariant =
                        s === 'positive' ? 'success' : s === 'negative' ? 'danger' : 'warning';
                      const label =
                        s === 'positive' ? 'Positive' : s === 'negative' ? 'Negative' : 'Neutral';
                      const platform = rev.platform || 'News';
                      const icon = platform === 'Twitter' ? '🐦 ' : platform === 'Reddit' ? '🤖 ' : '📰 ';
                      
                      return (
                        <Card
                          key={`${rev.title}-${i}`}
                          className={
                            s === 'positive'
                              ? 'border-emerald-500/25 bg-emerald-950/10'
                              : s === 'negative'
                                ? 'border-red-500/25 bg-red-950/10'
                                : 'border-amber-500/20 bg-amber-950/10'
                          }
                        >
                          <CardContent className="p-4 space-y-2">
                            <div className="flex justify-between items-start gap-2">
                              <h4 className="font-semibold text-white text-sm leading-snug">{icon}{platform} | {rev.title}</h4>
                              <Badge variant={badgeVariant} className="shrink-0 text-[10px] py-0">
                                {label}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed line-clamp-6">{rev.summary}</p>
                            {rev.href ? (
                              <a
                                href={rev.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-accent hover:underline break-all inline-block"
                              >
                                {rev.href}
                              </a>
                            ) : null}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Competitor Analysis Section */}
              <div className="space-y-4 pt-6 mt-6 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Trophy className="w-6 h-6 text-orange-400" />
                      Competitor Analysis
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">
                      AI simulated comparison vs Baseline Value: <strong className="text-white">${userValue.toLocaleString()}</strong>
                    </p>
                  </div>
                  <Button onClick={handleFetchCompetitors} disabled={!industry.trim() || isFetchingComps} variant="outline" className="border-slate-700 hover:bg-slate-800">
                    {isFetchingComps ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</> : "Generate Analysis"}
                  </Button>
                </div>
                
                {compError && <p className="text-sm text-red-400">{compError}</p>}

                {compAnalysis && (
                  <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500 mt-4">
                    <Card className="border-orange-500/30 bg-gradient-to-br from-slate-900 via-[#1E293B] to-slate-900">
                      <CardContent className="pt-6">
                        <p className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap">
                          {compAnalysis.insights}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-800/20 border-slate-700/40">
                      <CardHeader>
                        <CardTitle className="text-lg">Revenue Comparison</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                              data={[...compAnalysis.competitors.map(c => ({ name: c.company, revenue: c.revenue, fill: '#3b82f6' })), { name: 'Your Company', revenue: userValue, fill: '#f97316' }].sort((a, b) => b.revenue - a.revenue)}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                              <XAxis dataKey="name" stroke="#94a3b8" />
                              <YAxis stroke="#94a3b8" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                                {([...compAnalysis.competitors.map(c => ({ name: c.company, revenue: c.revenue, fill: '#3b82f6' })), { name: 'Your Company', revenue: userValue, fill: '#f97316' }].sort((a, b) => b.revenue - a.revenue)).map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {compAnalysis.competitors.map((c, i) => (
                        <Card key={i} className="bg-slate-800/40 border-slate-700">
                          <CardContent className="p-4 flex flex-col items-center text-center">
                            <h4 className="font-bold text-white mb-2">{c.company}</h4>
                            <div className="text-sm text-slate-400">Revenue</div>
                            <div className="text-lg font-semibold text-sky-400 mb-2">${c.revenue?.toLocaleString() || 0}</div>
                            <div className="flex justify-between w-full mt-2 pt-2 border-t border-slate-700/50 text-xs">
                              <span className="text-slate-400">Growth: <strong className="text-emerald-400">{c.growth}</strong></span>
                              <span className="text-slate-400">Share: <strong className="text-amber-400">{c.market_share}</strong></span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

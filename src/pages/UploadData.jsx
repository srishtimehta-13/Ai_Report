import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileType, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { API_BASE } from '../lib/api';
import {
  buildDashboardSnapshot,
  DASHBOARD_DATA_KEY,
  persistDashboardSnapshot,
} from '../lib/csvDashboard';
import { formatApiError } from '../lib/utils';

const LAST_INSIGHTS_KEY = 'reportai_last_insights';

export const UploadData = () => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const processFile = (fileToProcess) => {
    if (fileToProcess && (fileToProcess.type === "text/csv" || fileToProcess.name.endsWith('.csv'))) {
      setFile(fileToProcess);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const rows = text.split('\n').filter(row => row.trim() !== '');
        if (rows.length > 0) {
          const cols = rows[0].split(',').map(c => c.replace(/"/g, '').trim());
          setHeaders(cols);
          const dataRows = rows.slice(1, 6).map(row => row.split(',').map(c => c.replace(/"/g, '').trim()));
          setPreviewData(dataRows);
        }
        const snapshot = buildDashboardSnapshot(fileToProcess.name, text);
        persistDashboardSnapshot(snapshot);
      };
      reader.readAsText(fileToProcess);
    } else {
      alert("Please upload a valid CSV file.");
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!file || !industry) return;
    
    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("industry", industry);

      const socialParams = new URLSearchParams({
        query: industry.trim(),
        max_results: "10",
      });
      const [response, socialPayload] = await Promise.all([
        fetch(`${API_BASE}/analyze`, {
          method: "POST",
          body: formData,
        }),
        fetch(`${API_BASE}/social-reviews?${socialParams}`)
          .then(async (r) => (r.ok ? r.json() : { items: [], overall: null }))
          .catch(() => ({ items: [], overall: null })),
      ]);

      if (!response.ok) {
        throw new Error(await formatApiError(response));
      }

      const aiData = await response.json();
      const socialReviews = Array.isArray(socialPayload?.items) ? socialPayload.items : [];
      const socialOverall = socialPayload?.overall ?? null;

      try {
        sessionStorage.setItem(
          LAST_INSIGHTS_KEY,
          JSON.stringify({ aiData, industry, socialReviews, socialOverall })
        );
        const dashRaw = sessionStorage.getItem(DASHBOARD_DATA_KEY);
        if (dashRaw && aiData._meta) {
          const dash = JSON.parse(dashRaw);
          dash.lastAnalysis = {
            model: aiData._meta.model,
            rowsAnalyzed: aiData._meta.rows_analyzed,
            at: new Date().toISOString(),
          };
          persistDashboardSnapshot(dash);
        }
      } catch (e) {
        console.warn("Could not persist insights to sessionStorage", e);
      }

      navigate('/insights', {
        state: {
          analyzed: true,
          aiData,
          industry,
          socialReviews,
          socialOverall,
        },
      });

    } catch (err) {
      console.error("Analysis Failed:", err);
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Data Upload</h1>
        <p className="text-slate-400 mt-2 text-lg">Upload your internal company data securely to generate AI-powered insights.</p>
      </div>

      <Card className={`border-dashed border-2 bg-transparent transition-colors ${dragActive ? 'border-accent bg-accent/5' : 'border-slate-700 hover:bg-slate-800/20'}`}>
        <CardContent className="p-12">
          <form 
            onDragEnter={handleDrag} 
            onDragLeave={handleDrag} 
            onDragOver={handleDrag} 
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload').click()}
            className="flex flex-col items-center justify-center space-y-4 cursor-pointer focus:outline-none"
          >
            <div className={`p-4 rounded-full transition-colors ${dragActive ? 'bg-accent/20 text-accent' : 'bg-slate-800 text-slate-400'}`}>
              <UploadCloud className="w-12 h-12" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white">Drag & drop your CSV here</h3>
              <p className="text-slate-400 mt-2">or click to browse from your computer</p>
            </div>
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              id="file-upload" 
              onChange={handleChange}
            />
            <Button type="button" variant="secondary" className="mt-4 pointer-events-none">
              Select File
            </Button>
            <p className="text-xs text-slate-500 flex items-center mt-6">
              <AlertCircle className="w-3 h-3 mr-1" /> Only .csv files are supported
            </p>
          </form>
        </CardContent>
      </Card>

      {file && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500 border-accent/20">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800/60 pb-4">
            <div>
              <CardTitle className="flex items-center text-lg">
                <FileType className="w-5 h-5 mr-2 text-accent" />
                {file.name}
              </CardTitle>
              <p className="text-sm text-slate-400 mt-1">Data Preview (First {previewData.length} rows)</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <input 
                type="text"
                placeholder="Enter Industry Context (e.g. SaaS)"
                className="bg-slate-800 text-slate-200 px-3 py-2 rounded-md outline-none border border-slate-700 focus:border-accent text-sm w-full sm:w-auto"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
              <Button onClick={handleAnalyze} disabled={isAnalyzing || !industry} className="min-w-[140px] shadow-lg shadow-accent/20">
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate My Report"
                )}
              </Button>
            </div>
          </CardHeader>
          
          {error && (
            <div className="px-6 pb-2 text-red-500 text-sm flex items-center">
              <AlertCircle className="w-4 h-4 inline mr-2" /> 
              {error}
            </div>
          )}
          <CardContent className="pt-6">
            {headers.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h, i) => (
                      <TableHead key={i} className="whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="whitespace-nowrap">{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {isAnalyzing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex flex-col items-center space-y-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-slate-700/50"></div>
              <div className="w-24 h-24 rounded-full border-4 border-accent border-t-transparent animate-spin absolute top-0 left-0"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <UploadCloud className="w-8 h-8 text-accent animate-pulse" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">AI is analyzing your business...</h2>
            <p className="text-slate-400 animate-pulse">Processing market signals and generating forecasts</p>
          </div>
        </div>
      )}
    </div>
  );
};

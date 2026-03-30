import io
import json
import logging
import os
import re
from pathlib import Path

import google.generativeai as genai
import pandas as pd
from dotenv import load_dotenv
import ast
from google.api_core import exceptions as google_api_exceptions
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

api_key = os.environ.get("GEMINI_API_KEY")
if api_key and api_key not in ("", "YOUR_GEMINI_API_KEY_HERE"):
    genai.configure(api_key=api_key)
else:
    logger.warning("No valid GEMINI_API_KEY found. Set backend/.env before running analysis.")

try:
    from ddgs import DDGS as DDGSClient  # type: ignore
except ImportError:  # pragma: no cover
    from duckduckgo_search import DDGS as DDGSClient  # type: ignore


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Working"}


def _require_gemini_configured() -> None:
    if not api_key or api_key in ("", "YOUR_GEMINI_API_KEY_HERE"):
        raise HTTPException(
            status_code=503,
            detail="Gemini API key is not configured. Set GEMINI_API_KEY in backend/.env.",
        )


def search_market_results(industry: str, max_results: int = 5) -> list[dict]:
    """Return DuckDuckGo-style text results as dicts with title, summary, href."""
    query = f"{industry} market trends expectations 2026"
    logger.info(f"DDGS Query: {query}")
    results: list[dict] = []
    try:
        with DDGSClient() as ddgs:
            search_results = list(ddgs.text(query, max_results=max_results))
        for res in search_results:
            title = (res.get("title") or "").strip()
            body = (res.get("body") or "").strip()
            href = (res.get("href") or "").strip()
            if title or body:
                results.append(
                    {
                        "title": title or "Search result",
                        "summary": body[:800] if body else "",
                        "href": href,
                        "source": "Web",
                        "trend": "neutral",
                    }
                )
    except Exception as e:
        logger.error("Market search failed: %s", e)
        results.append(
            {
                "title": "Market search unavailable",
                "summary": "Could not fetch live market headlines right now. Analysis will rely on your CSV summary.",
                "href": "",
                "source": "System",
                "trend": "neutral",
            }
        )
    if not results:
        results.append(
            {
                "title": "No web snippets",
                "summary": "No search results were returned. Continue using dataset statistics only.",
                "href": "",
                "source": "System",
                "trend": "neutral",
            }
        )
    return results


_POSITIVE_TERMS = frozenset(
    {
        "growth",
        "strong",
        "profit",
        "profits",
        "surge",
        "beat",
        "beats",
        "bullish",
        "gain",
        "gains",
        "record",
        "positive",
        "optimistic",
        "thriving",
        "success",
        "successful",
        "win",
        "wins",
        "outperform",
        "rally",
        "expansion",
        "upgrade",
        "upgrades",
        "rebound",
        "momentum",
        "innovation",
        "leading",
        "praise",
        "excited",
        "confident",
        "improved",
        "improvement",
        "soar",
        "soars",
        "rise",
        "rises",
        "upside",
        "favorable",
        "promising",
    }
)

_NEGATIVE_TERMS = frozenset(
    {
        "loss",
        "losses",
        "decline",
        "declines",
        "issues",
        "complaint",
        "complaints",
        "lawsuit",
        "crash",
        "miss",
        "misses",
        "bearish",
        "layoff",
        "layoffs",
        "recall",
        "scandal",
        "weak",
        "weakness",
        "fall",
        "falls",
        "drop",
        "drops",
        "concern",
        "concerns",
        "risk",
        "risks",
        "warning",
        "warns",
        "negative",
        "pessimistic",
        "struggle",
        "struggles",
        "fraud",
        "investigation",
        "ban",
        "banned",
        "lawsuits",
        "selloff",
        "plunge",
        "cuts",
    }
)


def classify_sentiment_rule_based(text: str) -> str:
    """Simple lexicon score: positive / negative / neutral."""
    if not text or not text.strip():
        return "neutral"
    words = set(re.findall(r"[a-z0-9]+", text.lower()))
    pos_hits = len(words & _POSITIVE_TERMS)
    neg_hits = len(words & _NEGATIVE_TERMS)
    if pos_hits == 0 and neg_hits == 0:
        return "neutral"
    if pos_hits > neg_hits:
        return "positive"
    if neg_hits > pos_hits:
        return "negative"
    return "neutral"


def _social_dedupe_key(title: str, href: str) -> str:
    h = (href or "").strip().lower()
    if h:
        return h[:500]
    return re.sub(r"\s+", " ", (title or "").strip().lower())[:200]


def get_social_reviews(
    company_or_industry: str,
    max_results: int = 10,
) -> list[dict]:
    """
    Fetch public web snippets and mock social media context.
    """
    q = (company_or_industry or "").strip()
    if not q:
        return []

    queries = [
        f"{q} reviews",
    ]
    per_query = max_results
    seen_set: set[str] = set()
    merged: list[dict] = []

    try:
        with DDGSClient() as ddgs:
            for query in queries:
                if len(merged) >= max_results:
                    break
                logger.info("Social DDGS query: %s", query)
                try:
                    batch = list(ddgs.text(query, max_results=per_query))
                except Exception as e:
                    logger.warning("Social search batch failed (%s): %s", query, e)
                    continue
                for res in batch:
                    if len(merged) >= max_results:
                        break
                    title = (res.get("title") or "").strip()
                    body = (res.get("body") or "").strip()
                    href = (res.get("href") or "").strip()
                    if not title and not body:
                        continue
                    key = _social_dedupe_key(title, href)
                    if key in seen_set:
                        continue
                    seen_set.add(key)
                    
                    text_lower = body.lower()
                    words = set(re.findall(r"[a-z0-9]+", text_lower))
                    pos_words = {"growth", "strong", "profit", "success", "good", "great", "love", "amazing"}
                    neg_words = {"loss", "decline", "issue", "bad", "issues", "terrible", "hate", "worst"}
                    
                    has_pos = any(w in words for w in pos_words)
                    has_neg = any(w in words for w in neg_words)
                    
                    sentiment = "Neutral"
                    if has_pos and not has_neg:
                        sentiment = "Positive"
                    elif has_neg and not has_pos:
                        sentiment = "Negative"
                        
                    merged.append(
                        {
                            "title": title or "Result",
                            "summary": body[:800] if body else "",
                            "text": body[:800] if body else "",
                            "sentiment": sentiment.capitalize(),
                            "href": href,
                            "platform": "News"
                        }
                    )
    except Exception as e:
        logger.error("Social reviews DDGS failed: %s", e)

    # 2. IMPLEMENT GEMINI FALLBACK (MANDATORY)
    if not merged:
        logger.info("Insufficient organic results, falling back to Gemini text simulation.")
        prompt = f"""
Give 5 realistic public opinions about {q}.

Format:

1. (Positive) ...
2. (Negative) ...
3. (Neutral) ...
4. (Positive) ...
5. (Negative) ...
"""
        try:
            # We bypass the JSON validation logic by directly asking the model internally
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            lines = response.text.strip().split("\n")
            
            for line in lines:
                line = line.strip()
                if not line or not line[0].isdigit():
                    continue
                
                sentiment = "Neutral"
                if "(Positive)" in line:
                    sentiment = "Positive"
                elif "(Negative)" in line:
                    sentiment = "Negative"
                elif "(Neutral)" in line:
                    sentiment = "Neutral"
                    
                text_part = line.split(")", 1)[-1].strip() if ")" in line else line
                
                if text_part:
                    merged.append({
                        "platform": "Twitter",
                        "title": "Simulated Post",
                        "summary": text_part,
                        "text": text_part,
                        "sentiment": sentiment,
                        "href": ""
                    })
        except Exception as sim_e:
            logger.error("Gemini fallback text simulation failed: %s", sim_e)

    # FINAL SAFETY FALLBACK
    if not merged:
        merged = [
            {
                "platform": "System",
                "title": "System Insight",
                "summary": f"Users have mixed opinions about {q}. Some highlight strong performance while others mention challenges.",
                "text": f"Users have mixed opinions about {q}. Some highlight strong performance while others mention challenges.",
                "sentiment": "Neutral",
                "href": ""
            }
        ]

    for m in merged:
        m["sentiment"] = m.get("sentiment", "neutral").capitalize()

    print("FINAL REVIEWS:", merged)
    return merged[:max_results]


def social_sentiment_overall(reviews: list[dict]) -> dict:
    """Percent breakdown + counts for positive / neutral / negative."""
    n = len(reviews)
    if n == 0:
        return {
            "positive_pct": 0.0,
            "neutral_pct": 0.0,
            "negative_pct": 0.0,
            "counts": {"positive": 0, "neutral": 0, "negative": 0},
        }
    pos = sum(1 for r in reviews if str(r.get("sentiment", "")).lower() == "positive")
    neg = sum(1 for r in reviews if str(r.get("sentiment", "")).lower() == "negative")
    neu = sum(1 for r in reviews if str(r.get("sentiment", "")).lower() == "neutral")
    return {
        "positive_pct": round(100.0 * pos / n, 1),
        "neutral_pct": round(100.0 * neu / n, 1),
        "negative_pct": round(100.0 * neg / n, 1),
        "counts": {"positive": pos, "neutral": neu, "negative": neg},
    }


def analyze_dataframe(df: pd.DataFrame) -> dict:
    summary: dict = {
        "num_rows": len(df),
        "columns": list(df.columns),
        "numeric_columns": [],
        "stats": {},
        "insights": [],
    }

    if summary["num_rows"] == 0:
        summary["insights"].append("Warning: The uploaded dataset contains zero rows.")
        return summary

    numeric_df = df.select_dtypes(include=["number"])
    summary["numeric_columns"] = list(numeric_df.columns)

    for col in numeric_df.columns:
        col_data = df[col].dropna()
        if len(col_data) == 0:
            continue

        mean_val = float(col_data.mean())
        max_val = float(col_data.max())
        min_val = float(col_data.min())
        std_val = float(col_data.std())
        denom = abs(mean_val) if mean_val != 0 else 1.0

        summary["stats"][col] = {
            "mean": round(mean_val, 2),
            "max": round(max_val, 2),
            "min": round(min_val, 2),
            "variance": "high" if std_val > (denom * 0.5) else "normal",
        }

        if len(col_data) > 5:
            mid = len(col_data) // 2
            first_half_avg = float(col_data.iloc[:mid].mean())
            second_half_avg = float(col_data.iloc[mid:].mean())
            growth = second_half_avg - first_half_avg
            baseline = abs(first_half_avg) if first_half_avg != 0 else 1.0

            if growth > (baseline * 0.1):
                summary["insights"].append(f"Strong upward trend detected in {col}.")
            elif growth < -(baseline * 0.1):
                summary["insights"].append(f"Noticeable decline detected in {col}.")

        if std_val > 0:
            anomalies = col_data[
                (col_data > mean_val + 2 * std_val) | (col_data < mean_val - 2 * std_val)
            ]
            if not anomalies.empty:
                summary["insights"].append(
                    f"Detected {len(anomalies)} extreme outlier(s) in {col}."
                )

    missing_count = int(df.isnull().sum().sum())
    if missing_count > 0:
        summary["insights"].append(
            f"Data quality issue: found {missing_count} missing values across the dataset."
        )

    return summary


def _decode_csv_bytes(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _gemini_response_text(response) -> str:
    try:
        text = response.text
        if text:
            return text.strip()
    except (ValueError, AttributeError):
        pass
    parts: list[str] = []
    for cand in getattr(response, "candidates", None) or []:
        content = getattr(cand, "content", None)
        for part in getattr(content, "parts", None) or []:
            t = getattr(part, "text", None)
            if t:
                parts.append(t)
    return "".join(parts).strip()


def _parse_ai_json(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```\s*$", "", raw)
    return json.loads(raw)


def _gemini_model_chain() -> list[str]:
    """Primary model + fallbacks so a 429 on one SKU can succeed on another."""
    primary = (os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash").strip()
    raw_fallbacks = os.environ.get(
        "GEMINI_MODEL_FALLBACKS",
        "gemini-2.5-pro,gemini-2.5-flash-lite",
    )
    seen: set[str] = set()
    out: list[str] = []
    for name in [primary] + [x.strip() for x in raw_fallbacks.split(",")]:
        if name and name not in seen:
            seen.add(name)
            out.append(name)
    return out


def _is_quota_or_rate_limit(exc: BaseException) -> bool:
    if isinstance(exc, google_api_exceptions.ResourceExhausted):
        return True
    msg = str(exc).lower()
    return "429" in str(exc) or "quota" in msg or (
        "rate" in msg and "limit" in msg
    )


def _generate_gemini_json(ai_prompt: str) -> tuple[str, str]:
    """
    Returns (response_text, model_name). Raises HTTPException if all models fail.
    """
    last_error: BaseException | None = None
    for model_name in _gemini_model_chain():
        logger.info("Calling Gemini model=%s", model_name)
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(
                ai_prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                ),
            )
            text = _gemini_response_text(response)
            if text:
                return text, model_name
            last_error = RuntimeError("Empty Gemini response")
            logger.warning("Gemini %s returned empty text", model_name)
        except Exception as e:
            last_error = e
            if _is_quota_or_rate_limit(e):
                logger.warning(
                    "Gemini %s quota/rate limited (%s); trying next model",
                    model_name,
                    e,
                )
                continue
            logger.exception("Gemini request failed on %s", model_name)
            raise HTTPException(
                status_code=502,
                detail=f"Failed communicating with Gemini: {e!s}",
            ) from e

    raise HTTPException(
        status_code=429,
        detail=(
            "Gemini API quota or rate limit hit for every model tried. "
            "Wait and retry, set GEMINI_MODEL / GEMINI_MODEL_FALLBACKS in backend/.env, "
            "or check billing and limits: https://ai.google.dev/gemini-api/docs/rate-limits "
            f"— Last error: {last_error!s}"
        ),
    ) from last_error


def parse_number(val):
    v = str(val).upper().replace('$', '').replace(',', '').strip()
    if v.endswith('M'): return float(v[:-1]) * 1e6
    if v.endswith('B'): return float(v[:-1]) * 1e9
    if v.endswith('K'): return float(v[:-1]) * 1e3
    try: 
        return float(v)
    except: 
        return 0.0

def get_competitors(industry: str) -> list[str]:
    prompt = f"""
List top 3 competitors in the {industry} industry.

Return only a Python list:
["Competitor1", "Competitor2", "Competitor3"]
"""
    model_name = _gemini_model_chain()[0]
    model = genai.GenerativeModel(model_name)
    try:
        response = model.generate_content(prompt)
        text = _gemini_response_text(response).replace("```python", "").replace("```", "").strip()
        return ast.literal_eval(text)
    except Exception as e:
        logger.error(f"Failed to fetch competitors: {e}")
        return ["Competitor A", "Competitor B", "Competitor C"]

def get_competitor_metrics(competitors: list[str]) -> list[dict]:
    prompt = f"""
For each of these companies: {competitors}

Generate estimated metrics:
- revenue
- growth rate
- market share

Return JSON:
[
  {{
    "company": "...",
    "revenue": ...,
    "growth": "...",
    "market_share": "..."
  }}
]
"""
    model_name = _gemini_model_chain()[0]
    model = genai.GenerativeModel(model_name)
    try:
        response = model.generate_content(prompt, generation_config=genai.GenerationConfig(response_mime_type="application/json"))
        return _parse_ai_json(_gemini_response_text(response))
    except Exception as e:
        logger.error(f"Failed to fetch competitor metrics: {e}")
        return [{"company": c, "revenue": 1000000, "growth": "5%", "market_share": "10%"} for c in competitors]

def get_insights(user_value: float, competitor_data: list[dict]) -> str:
    prompt = f"""
Compare this company with competitors:

Company value: {user_value}
Competitors: {competitor_data}

Give:
- strengths
- weaknesses
- position (leader / average / lagging)
"""
    model_name = _gemini_model_chain()[0]
    model = genai.GenerativeModel(model_name)
    try:
        response = model.generate_content(prompt)
        return _gemini_response_text(response)
    except Exception as e:
        logger.error(f"Failed to fetch competitor insights: {e}")
        return f"Unable to generate insights: {e}"

@app.get("/competitor-analysis")
async def competitor_analysis_endpoint(industry: str, user_value: float = 0.0):
    if not industry or not industry.strip():
        raise HTTPException(status_code=400, detail="Query parameter 'industry' is required.")
    
    _require_gemini_configured()
        
    comps = get_competitors(industry.strip())
    raw_metrics = get_competitor_metrics(comps)
    insights = get_insights(user_value, raw_metrics)
    
    metrics = []
    for c in raw_metrics:
        metrics.append({
            "company": c.get("company", "Unknown"),
            "revenue": parse_number(c.get("revenue", 0)),
            "growth": c.get("growth", "0%"),
            "market_share": c.get("market_share", "0%")
        })
        
    return {"competitors": metrics, "insights": insights}

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/market-signals")
async def market_signals(industry: str):
    if not industry or not industry.strip():
        raise HTTPException(status_code=400, detail="Query parameter 'industry' is required.")
    items = search_market_results(industry.strip(), max_results=5)
    return {"items": items}


@app.get("/social-reviews")
async def social_reviews_endpoint(query: str, max_results: int = 10):
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query parameter 'query' is required.")
    cap = max(1, min(20, max_results))
    items = get_social_reviews(query.strip(), max_results=cap)
    overall = social_sentiment_overall(items)
    return {"items": items, "overall": overall}


@app.post("/analyze")
async def process_analysis(file: UploadFile = File(...), industry: str = Form(...)):
    _require_gemini_configured()

    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Invalid file. Must be a CSV.")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    try:
        text = _decode_csv_bytes(content)
        df = pd.read_csv(io.StringIO(text))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e!s}") from e

    if df.empty:
        raise HTTPException(status_code=400, detail="Dataset is empty after parsing.")

    if df.select_dtypes(include=["number"]).empty:
        raise HTTPException(
            status_code=400,
            detail="No numeric columns found in data to analyze.",
        )

    logger.info("CSV parsed: %s rows, %s columns", len(df), len(df.columns))

    company_data = df
    data_string = company_data.describe().to_string()

    data_summary = analyze_dataframe(df)
    summary_json = json.dumps(data_summary, indent=2)

    market_items = search_market_results(industry, max_results=5)
    market_signals_text = "\n".join(
        f"- {it.get('title', '')}: {it.get('summary', '')}" for it in market_items
    )

    ai_prompt = f"""
You are a highly analytical business intelligence AI.

IMPORTANT RULES:
- You MUST analyze the data numerically
- You MUST refer to actual values, patterns, or columns from the dataset
- DO NOT give generic business advice
- Your output MUST change if the dataset changes

----------------------------------------

COMPANY DATA (DESCRIPTIVE STATS — pandas describe()):
{data_string}

----------------------------------------

STRUCTURED SUMMARY (JSON — rows, columns, insights):
{summary_json}

----------------------------------------

EXTERNAL MARKET SIGNALS:
{market_signals_text}

----------------------------------------

TASK:

Step 1: DATA UNDERSTANDING
- Identify key columns (revenue, price, sales, etc.)
- Describe patterns using actual values (min, max, trends if visible)

Step 2: INTERNAL ANALYSIS
- What is happening in the business?
- Mention specific numbers from the dataset
- Identify any anomalies or unusual patterns

Step 3: MARKET CONNECTION
- Compare company performance with external signals
- Explain whether company is aligned or at risk

Step 4: FORECAST
- Predict what will happen next
- Justify prediction using BOTH:
  - dataset patterns
  - market signals

----------------------------------------

OUTPUT FORMAT (STRICT JSON):
{{
  "internal_analysis": "<detailed, data-backed explanation>",
  "market_connection": "<clear comparison with signals>",
  "forecast": "<data-driven prediction>"
}}

----------------------------------------

CRITICAL:
- If dataset values are low → say weak performance
- If values are high → say strong performance
- If variation is high → say unstable
- ALWAYS justify using data
"""

    raw_ai_text, used_model = _generate_gemini_json(ai_prompt)
    if not raw_ai_text:
        logger.error("Empty Gemini response")
        raise HTTPException(status_code=502, detail="AI returned an empty response.")

    logger.info("AI response (first 200 chars): %s", raw_ai_text[:200])

    try:
        structured_output = _parse_ai_json(raw_ai_text)
    except json.JSONDecodeError:
        logger.error("Invalid AI JSON: %s", raw_ai_text[:2000])
        raise HTTPException(
            status_code=502,
            detail="AI did not return valid JSON.",
        ) from None

    required = ("internal_analysis", "market_connection", "forecast")
    missing = [k for k in required if k not in structured_output]
    if missing:
        raise HTTPException(
            status_code=502,
            detail=f"AI response missing fields: {', '.join(missing)}",
        )

    structured_output["_meta"] = {
        "model": used_model,
        "rows_analyzed": len(df),
        "market_snippets": len(market_items),
    }
    return structured_output

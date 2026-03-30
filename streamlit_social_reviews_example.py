"""
Optional Streamlit UI for Social Media Insights.

This repo's main app is React + FastAPI. This file is a standalone demo that
calls GET /social-reviews on your running API.

  pip install streamlit
  # Terminal 1: npm run dev:api   (or uvicorn from backend)
  # Terminal 2: streamlit run streamlit_social_reviews_example.py
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

import streamlit as st

st.set_page_config(page_title="Social Media Insights", layout="wide")

st.title("Social Media Insights")
st.caption("Calls your FastAPI backend — no hardcoded review data.")

api_base = st.sidebar.text_input("API base URL", "http://127.0.0.1:8000").rstrip("/")
query = st.text_input("Company or industry", "Nike")
max_results = st.slider("Max results", min_value=5, max_value=20, value=10)

if st.button("Fetch social signals", type="primary"):
    params = urllib.parse.urlencode({"query": query.strip(), "max_results": max_results})
    url = f"{api_base}/social-reviews?{params}"
    try:
        with urllib.request.urlopen(url, timeout=90) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        st.error(f"HTTP {e.code}: {e.read().decode(errors='replace')}")
        st.stop()
    except urllib.error.URLError as e:
        st.error(f"Connection failed — is the API running? {e}")
        st.stop()

    items = payload.get("items") or []
    overall = payload.get("overall") or {}

    st.subheader("Overall sentiment score")
    c1, c2, c3 = st.columns(3)
    c1.metric("Positive %", f"{overall.get('positive_pct', 0)}%")
    c2.metric("Neutral %", f"{overall.get('neutral_pct', 0)}%")
    c3.metric("Negative %", f"{overall.get('negative_pct', 0)}%")

    st.divider()
    st.subheader("Review-like snippets")

    for i, it in enumerate(items):
        sentiment = (it.get("sentiment") or "neutral").lower()
        label = {"positive": "Positive", "negative": "Negative", "neutral": "Neutral"}.get(
            sentiment, "Neutral"
        )
        with st.container():
            st.markdown(f"**{i + 1}. {it.get('title', '')}** — `{label}`")
            st.write(it.get("summary") or "")
            href = it.get("href") or ""
            if href:
                st.markdown(f"[Open link]({href})")
            st.divider()

from __future__ import annotations

import logging
from typing import Optional

import re
import httpx
from bs4 import BeautifulSoup


POSITIVE_HINTS = re.compile(
    r"article|post|entry|content|main|body|page|read|text|blog|story|detail",
    re.I,
)
NEGATIVE_HINTS = re.compile(
    r"nav|footer|header|aside|sidebar|advert|ads|promo|breadcrumb|popup|modal|subscribe|comment|share|related|tagcloud|login|signup",
    re.I,
)
LOW_QUALITY_PHRASES = [
    "sorry, something went wrong",
    "there was an error while loading",
    "please reload this page",
    "uh oh!",
    "loading took too long",
]


def fetch_html(url: str, timeout: float = 15.0) -> Optional[str]:
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 RSS-AI/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
            enc = resp.encoding or "utf-8"
            text = resp.text
            logging.info(f"抓取原文成功 {url} status={resp.status_code} bytes={len(resp.content)}")
            return text
    except Exception as e:
        logging.warning(f"抓取原文失败 {url}: {e}")
        return None


def _clean_soup(soup: BeautifulSoup) -> None:
    for tag in soup(["script", "style", "noscript", "iframe", "svg", "canvas", "form", "input", "button"]):
        tag.decompose()


def _score_node(node) -> float:
    # Score by paragraphs and text length, with hints
    text = node.get_text(" ", strip=True)
    if not text:
        return 0.0
    length = len(text)
    p_good = 0
    for p in node.find_all("p"):
        t = p.get_text(" ", strip=True)
        if len(t) >= 50:
            p_good += 1
    score = p_good * 10 + length / 100.0
    # hints
    id_cls = " ".join(filter(None, [node.get("id", ""), " ".join(node.get("class", []) or [])]))
    if POSITIVE_HINTS.search(id_cls):
        score *= 1.2
    if NEGATIVE_HINTS.search(id_cls):
        score *= 0.7
    return score


def _extract_best_node(soup: BeautifulSoup):
    # Prefer <article> and #content/main containers
    candidates = []
    for sel in [
        "article",
        "main",
        "div#content",
        "div.content",
        "div.article",
        "div.post",
        "div.entry-content",
        "section.article",
    ]:
        candidates.extend(soup.select(sel))
    # Fallback: top-level divs
    if not candidates:
        candidates = soup.find_all("div")

    best = None
    best_score = 0.0
    for node in candidates:
        s = _score_node(node)
        if s > best_score:
            best_score = s
            best = node
    if not best:
        best = soup.body or soup
    return best


def extract_main_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    _clean_soup(soup)
    node = _extract_best_node(soup)
    # Build paragraphs from <p> first
    paras = [p.get_text(" ", strip=True) for p in node.find_all("p")]
    paras = [p for p in paras if p]
    if not paras:
        text = node.get_text("\n", strip=True)
    else:
        text = "\n\n".join(paras)
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"(\s*\n\s*)+", "\n\n", text)
    return text.strip()


def _looks_like_placeholder_text(text: str) -> bool:
    if not text:
        return True
    normalized = re.sub(r"\s+", " ", text).strip().lower()
    if not normalized:
        return True

    phrase_hits = 0
    phrase_count = 0
    for phrase in LOW_QUALITY_PHRASES:
        c = normalized.count(phrase)
        if c > 0:
            phrase_hits += 1
            phrase_count += c
    if phrase_hits >= 2 or phrase_count >= 3:
        return True

    sentences = [s.strip() for s in re.split(r"[.!?。！？]+", normalized) if s.strip()]
    if len(sentences) >= 4:
        unique_ratio = len(set(sentences)) / len(sentences)
        if unique_ratio < 0.55 and len(normalized) < 2000:
            return True
    return False


def extract_from_url(url: str, timeout: float = 15.0) -> Optional[str]:
    html = fetch_html(url, timeout=timeout)
    if not html:
        return None
    try:
        text = extract_main_text(html)
        if text and len(text) > 80:
            if _looks_like_placeholder_text(text):
                logging.info(f"抽取文本疑似占位错误文案，回退RSS内容: {url}")
                return None
            return text
    except Exception as e:
        logging.warning(f"正文抽取失败 {url}: {e}")
    return None

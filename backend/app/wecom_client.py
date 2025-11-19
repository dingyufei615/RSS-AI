from __future__ import annotations

import logging
import json
from typing import Optional, Dict, Any

import httpx
import re


class WeComClient:
    def __init__(self, webhook_key: str, timeout: float = 20.0):
        """
        初始化企业微信客户端

        :param webhook_key: 企业微信机器人的 Webhook Key
        :param timeout: 请求超时时间
        """
        self.webhook_key = webhook_key
        self.timeout = timeout
        self.webhook_url = f"https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key={webhook_key}"

    def send_message(self, content: str) -> bool:
        """
        发送消息到企业微信机器人

        :param content: 要发送的内容
        :return: 发送是否成功
        """
        if not self.webhook_key:
            logging.warning("企业微信 webhook key 未配置")
            return False

        # 构建企业微信 markdown_v2 消息格式
        payload = {
            "msgtype": "markdown",
            "markdown": {
                "content": content
            }
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(self.webhook_url, json=payload)
                if resp.status_code >= 400:
                    logging.warning(
                        "企业微信 API 调用失败 status=%s body=%s",
                        resp.status_code,
                        resp.text[:300],
                    )
                resp.raise_for_status()
                data = resp.json()
                errcode = data.get("errcode", -1)
                if errcode != 0:
                    logging.warning("企业微信 API 返回失败响应: %s", data)
                    return False
                return True
        except Exception as exc:
            logging.warning("企业微信 API 请求异常: %s", exc)
            return False

    def format_markdown_message(self, title: str, link: str, pub_date: str, author: str,
                              summary_text: str, matched_keywords: Optional[list[str]] = None) -> str:
        """
        格式化文章为适合企业微信推送的 Markdown 格式消息

        :param title: 文章标题
        :param link: 文章链接
        :param pub_date: 发布时间
        :param author: 作者
        :param summary_text: 摘要内容
        :param matched_keywords: 匹配的关键词
        :return: 格式化后的消息内容
        """
        # 构建消息内容
        parts = [
            f"**{title}**",
            f"[原文链接]({link})",
        ]

        # 添加元信息
        meta = []
        if pub_date:
            meta.append(f"发布时间：{pub_date}")
        if author:
            meta.append(f"作者：{author}")
        if matched_keywords:
            meta.append("关键词：" + "、".join(matched_keywords))
        if meta:
            parts.append(" | ".join(meta))

        if summary_text:
            # 简单截断过长的摘要，避免超出企业微信限制
            truncated_summary = self._truncate_text(summary_text, 1000)
            parts.append(f"\n{truncated_summary}")

        return "\n".join(parts)

    def _truncate_text(self, text: str, max_length: int) -> str:
        """
        截断文本到指定长度

        :param text: 原始文本
        :param max_length: 最大长度
        :return: 截断后的文本
        """
        if len(text) <= max_length:
            return text

        # 按换行符分割，尽量保持段落完整性
        lines = text.split('\n')
        result = []
        current_length = 0

        for line in lines:
            if current_length + len(line) + 1 > max_length - 3:  # 3个字符用于"..."
                break
            result.append(line)
            current_length += len(line) + 1

        truncated = '\n'.join(result)
        if len(truncated) < len(text):
            truncated += "..."

        return truncated
#!/usr/bin/env python3
"""
Check what methods OpenAI client has
"""
from openai import AsyncOpenAI

# Create a sample OpenAI client
client = AsyncOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama"
)

print("=== OpenAI AsyncOpenAI methods ===")
for attr in dir(client):
    if not attr.startswith('_'):
        print(f"  {attr}")

print("\n=== Checking if 'ainvoke' exists ===")
print(f"hasattr(client, 'ainvoke'): {hasattr(client, 'ainvoke')}")

print("\n=== Looking for invoke-like methods ===")
for attr in dir(client):
    if 'invoke' in attr.lower() or 'chat' in attr.lower():
        print(f"  {attr}: {type(getattr(client, attr))}")

print("\n=== Checking chat.completions.create ===")
if hasattr(client, 'chat'):
    chat_attrs = dir(client.chat)
    for attr in chat_attrs:
        if not attr.startswith('_'):
            print(f"  chat.{attr}: {type(getattr(client.chat, attr))}")
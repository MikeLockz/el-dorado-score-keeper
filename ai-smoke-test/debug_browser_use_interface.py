#!/usr/bin/env python3
"""
Debug script to understand exactly what browser-use expects
"""
import asyncio
import json
import logging
from openai import AsyncOpenAI

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class DebugOpenAIWrapper:
    """Debug wrapper to understand browser-use expectations"""

    def __init__(self, model: str):
        self.model = model
        self.client = AsyncOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )
        logger.info(f"🔧 Initializing DebugOpenAIWrapper with model: {model}")

    async def ainvoke(self, *args, **kwargs):
        """Invoke with extensive debugging"""
        logger.info("🚀 ainvoke called")
        logger.info(f"  Args count: {len(args)}")
        logger.info(f"  Kwargs keys: {list(kwargs.keys())}")

        # Extract messages
        messages = kwargs.get('messages', args[0] if args else [])
        logger.info(f"  Messages: {len(messages)} messages")

        # Call OpenAI
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.7
        )

        logger.info("📦 Raw OpenAI response received")
        logger.info(f"  Type: {type(response)}")
        logger.info(f"  Has choices: {hasattr(response, 'choices')}")
        logger.info(f"  Choices count: {len(response.choices) if hasattr(response, 'choices') else 0}")

        if hasattr(response, 'choices') and response.choices:
            choice = response.choices[0]
            content = choice.message.content
            logger.info(f"  Content: {content}")
            logger.info(f"  Content type: {type(content)}")

            # Test what browser-use might be doing
            logger.info("🔍 Testing what browser-use might access:")

            # Test 1: Direct content access
            logger.info(f"  Direct content: '{content}'")

            # Test 2: Try to get action from content
            try:
                if isinstance(content, str):
                    parsed = json.loads(content)
                    logger.info(f"  Parsed JSON from content: {parsed}")
                else:
                    logger.info(f"  Content is not a string, can't parse JSON")
            except:
                logger.info(f"  Content is not valid JSON")

            # Test 3: Our transformed response
            class TransformedResponse:
                def __init__(self, original_response):
                    self._original = original_response
                    self.completion = original_response.choices[0].message.content

                    # Add action to choices
                    if hasattr(original_response, 'choices'):
                        for choice in original_response.choices:
                            try:
                                action = json.loads(choice.message.content)
                                choice.action = action
                            except:
                                choice.action = {"action": "click", "params": {"text": "Start Single Player"}}

                    # Add action to self as well
                    try:
                        self.action = json.loads(self.completion)
                    except:
                        self.action = {"action": "click", "params": {"text": "Start Single Player"}}

            transformed = TransformedResponse(response)
            logger.info(f"  Transformed response type: {type(transformed)}")
            logger.info(f"  Transformed has action: {hasattr(transformed, 'action')}")
            logger.info(f"  Transformed action: {transformed.action}")
            logger.info(f"  Transformed has completion: {hasattr(transformed, 'completion')}")
            logger.info(f"  Transformed completion: {transformed.completion}")

            # Test 4: Return different things to see what browser-use expects
            logger.info("🤔 Testing different return types:")
            logger.info("  Option A: Return raw content string")
            logger.info("  Option B: Return transformed response object")
            logger.info("  Option C: Return response.choices[0]")

            # Let's try returning the choice with action added
            choice.action = {"action": "click", "params": {"text": "Start Single Player"}}
            logger.info(f"  Returning choice with action: {hasattr(choice, 'action')}")
            return choice

        return response

# Mock browser-use agent behavior
class MockBrowserUseTest:
    async def test_interface_variations(self):
        """Test different interface patterns"""

        wrapper = DebugOpenAIWrapper("qwen2.5vl:3b")

        # Test with a simple message
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": 'Respond with JSON: {"action": "click", "params": {"text": "Start Single Player"}}'}
        ]

        logger.info("🧪 Testing ainvoke with different return patterns...")

        # Test the wrapper
        result = await wrapper.ainvoke(messages=messages)

        logger.info("🎯 Result analysis:")
        logger.info(f"  Result type: {type(result)}")
        logger.info(f"  Result dir: {[attr for attr in dir(result) if not attr.startswith('_')]}")

        # Test what browser-use might be doing
        if hasattr(result, 'action'):
            logger.info(f"  ✅ Result has action: {result.action}")
        else:
            logger.error(f"  ❌ Result has no action attribute")

            # Maybe browser-use is accessing the content differently?
            if hasattr(result, 'message'):
                logger.info(f"  Result has message: {hasattr(result, 'message')}")
                if hasattr(result.message, 'content'):
                    content = result.message.content
                    logger.info(f"  Message content: {content}")
                    try:
                        action = json.loads(content)
                        logger.info(f"  Parsed action from content: {action}")
                    except:
                        logger.error(f"  Failed to parse action from content")

async def main():
    logger.info("🔍 Starting interface debugging...")
    test = MockBrowserUseTest()
    await test.test_interface_variations()

if __name__ == "__main__":
    asyncio.run(main())
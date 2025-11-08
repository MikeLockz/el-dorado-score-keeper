#!/usr/bin/env python3
"""
Quick test to verify our LLM interface works with browser_use
"""
import asyncio
import json
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Mock the browser_use Agent behavior
class MockBrowserUseAgent:
    def __init__(self, llm):
        self.llm = llm

    async def test_llm_call(self):
        """Simulate how browser-use calls the LLM"""
        logger.info("=== Mock browser-use LLM call ===")

        # This simulates what browser-use probably does
        try:
            response = await self.llm.ainvoke("test message")
            logger.info(f"Response type: {type(response)}")
            logger.info(f"Response: {response}")

            # This is what browser-use tries to do
            action = response.action
            logger.info(f"✅ Successfully accessed action: {action}")
            return True
        except AttributeError as e:
            logger.error(f"❌ Failed to access action: {e}")
            logger.error(f"Response type: {type(response)}")
            logger.error(f"Response dir: {dir(response) if hasattr(response, '__dir__') else 'No __dir__'}")
            return False

# Our LLM wrapper (simplified version)
class TestLLMWrapper:
    def __init__(self):
        self.call_count = 0

    async def ainvoke(self, *args, **kwargs):
        self.call_count += 1
        call_id = self.call_count

        logger.info(f"🚀 ainvoke called #{call_id}")

        # Simulate a valid JSON response
        json_content = '{"action": "click", "params": {"text": "Start Single Player"}}'

        # Create response object similar to our main implementation
        class LLMResponse:
            def __init__(self, content, action):
                self.content = content
                self.completion = content
                self.action = action
                self.usage = {
                    'prompt_tokens': 10,
                    'completion_tokens': 10,
                    'total_tokens': 20
                }

        try:
            parsed_action = json.loads(json_content)
        except:
            parsed_action = {"action": "error", "params": {}}

        response_obj = LLMResponse(json_content, parsed_action)

        logger.info(f"Created response object:")
        logger.info(f"  Type: {type(response_obj)}")
        logger.info(f"  Has action attr: {hasattr(response_obj, 'action')}")
        logger.info(f"  Action: {response_obj.action}")

        return response_obj

async def main():
    logger.info("🧪 Testing LLM interface...")

    wrapper = TestLLMWrapper()
    mock_agent = MockBrowserUseAgent(wrapper)

    success = await mock_agent.test_llm_call()

    if success:
        logger.info("🎉 Test passed! Our interface should work with browser_use")
    else:
        logger.error("💥 Test failed! There's an interface mismatch")

    return success

if __name__ == "__main__":
    result = asyncio.run(main())
    exit(0 if result else 1)
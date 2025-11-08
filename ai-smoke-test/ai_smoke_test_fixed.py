#!/usr/bin/env python3
"""
Fixed AI Smoke Test for El Dorado Score Keeper
Solves the browser-use interface issue by ensuring both string and object access work
"""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import List, Optional, Union, Any
from openai import AsyncOpenAI
from browser_use import Agent

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class FixedOpenAIWrapper:
    """
    Fixed wrapper that ensures browser-use gets both string content AND action access
    """

    def __init__(self, model: str):
        self.model = model
        self.client = AsyncOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )
        logger.info(f"🔧 Initializing FixedOpenAIWrapper with model: {model}")

    async def ainvoke(self, messages: List[dict], **kwargs) -> Any:
        """
        Fixed ainvoke that returns a string with embedded action access
        """
        logger.info("🚀 ainvoke called (FixedOpenAIWrapper)")

        # Add JSON enforcement to system message
        modified_messages = []
        for msg in messages:
            if msg.get("role") == "system":
                modified_content = msg["content"] + "\n\nIMPORTANT: You must respond with valid JSON in this format: {\"action\": \"action_type\", \"params\": {...}}"
                modified_messages.append({"role": "system", "content": modified_content})
            else:
                modified_messages.append(msg)

        # Call OpenAI
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=modified_messages,
            temperature=0.7
        )

        content = response.choices[0].message.content
        logger.info(f"📝 Raw LLM response: {content}")

        # Try to extract JSON action from content
        action = None
        try:
            # Look for JSON in the response
            if "{" in content and "}" in content:
                start = content.find("{")
                end = content.rfind("}") + 1
                json_str = content[start:end]
                action = json.loads(json_str)
                logger.info(f"✅ Extracted action from content: {action}")
            else:
                # Fallback action
                action = {"action": "click", "params": {"text": "Start Single Player"}}
                logger.warning(f"⚠️ No JSON found, using fallback action: {action}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to parse action: {e}")
            action = {"action": "click", "params": {"text": "Start Single Player"}}

        # HERE'S THE KEY INSIGHT: Create a string that has action as an attribute
        class ActionString(str):
            """String that also has action attribute"""
            def __new__(cls, content, action):
                obj = str.__new__(cls, content)
                obj.action = action
                obj.completion = content  # browser-use expects completion
                return obj

        # Return the content as an ActionString
        result = ActionString(content, action)
        logger.info(f"🎯 Returning ActionString: {type(result)} with action: {hasattr(result, 'action')}")

        return result

    async def acompletion(self, messages: List[dict], **kwargs) -> Any:
        """Forward compatible method"""
        return await self.ainvoke(messages, **kwargs)

    async def generate(self, messages: List[dict], **kwargs) -> Any:
        """Forward compatible method"""
        return await self.ainvoke(messages, **kwargs)

async def test_ollama_connection() -> bool:
    """Test Ollama connection and model availability"""
    try:
        client = AsyncOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )

        # Test connection
        models = await client.models.list()
        available_models = [model.id for model in models.data]
        logger.info(f"✅ Ollama models available: {available_models}")

        # Test specific model
        test_response = await client.chat.completions.create(
            model="qwen2.5vl:3b",
            messages=[{"role": "user", "content": "Say 'Hello Ollama'"}],
            max_tokens=10
        )

        logger.info(f"✅ Model test response: {test_response.choices[0].message.content}")
        return True

    except Exception as e:
        logger.error(f"❌ Ollama connection failed: {e}")
        return False

async def run_ai_smoke_test():
    """Main test function with fixed interface"""
    logger.info("=== Fixed AI Smoke Test Starting ===")

    # Configuration
    app_url = os.getenv("APP_URL", "http://localhost:3000")
    success_text = os.getenv("SUCCESS_TEXT", "Complete")
    model = os.getenv("MODEL", "qwen2.5vl:3b")

    logger.info(f"APP_URL: {app_url}")
    logger.info(f"SUCCESS_TEXT: {success_text}")
    logger.info(f"MODEL: {model}")

    try:
        # Test Ollama connection
        logger.info("🔗 Testing Ollama connection...")
        if not await test_ollama_connection():
            logger.error("❌ Ollama connection failed. Make sure Ollama is running with: ollama serve")
            return False

        # Import and initialize browser session
        logger.info("🌐 Starting browser session...")
        from browser_use import BrowserSession
        browser_session = BrowserSession(
            browser_type="chromium",
            headless=False,
            timeout=30000
        )

        logger.info("🚀 Starting browser...")
        await browser_session.start()
        logger.info("✅ Browser started successfully")

        # Create fixed LLM wrapper
        logger.info("📋 Creating agent...")
        llm_wrapper = FixedOpenAIWrapper(model)
        logger.info("✅ FixedOpenAIWrapper initialized successfully")

        # Create agent
        agent = Agent(
            task=f"""Your goal is to log in to {app_url} and confirm that you see "{success_text}" on screen.

Steps:
1. Open the site.
2. Click "Start single player".
3. Select a number of players.
4. Click "Create Lineup" button.
5. Bid a number of tricks and click "Confirm".
6. Double-click on a card that does not have data-unplayable="true" to play the card.
7. Click "Next Hand" button.
8. Continue playing by playing cards and confirming tricks until the game ends.
9. Verify the page shows "{success_text}".

Rules:
- Stay on {app_url} or same domain.
- Use up to 30 actions.
- Take reasonable time to wait after each click.""",
            llm=llm_wrapper,
            browser_session=browser_session,
            max_actions=30
        )

        logger.info(f"✅ Agent created: {agent}")
        logger.info(f"Agent task length: {len(agent.task)} chars")

        # Run the agent
        logger.info("🎯 Running agent...")
        logger.info("This will take a while - the AI will navigate and play the game...")

        result = await agent.run()

        logger.info("✅ Agent run completed")
        logger.info(f"Result type: {type(result)}")

        # Take final screenshot and check content
        logger.info("📸 Taking final screenshot and checking content...")

        try:
            current_page = await browser_session.get_current_page()
            page_content = await current_page.content()
            screenshot = await current_page.screenshot()

            logger.info(f"📄 Final page content length: {len(page_content)} chars")

            if success_text.lower() in page_content.lower():
                logger.info(f"🎉 SUCCESS: Found '{success_text}' in page content!")
                return True
            else:
                logger.warning(f"⚠️ Could not find '{success_text}' in page content")
                logger.info(f"Page content preview: {page_content[:500]}...")

                # Save screenshot for debugging
                screenshot_path = Path("final_screenshot.png")
                await current_page.screenshot(path=str(screenshot_path))
                logger.info(f"📸 Screenshot saved to: {screenshot_path}")
                return False

        except Exception as e:
            logger.error(f"❌ Error checking final page content: {e}")
            return False

    except Exception as e:
        logger.error(f"❌ Smoke test failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

    finally:
        # Cleanup
        try:
            if 'browser_session' in locals():
                logger.info("🛑 Stopping browser session...")
                await browser_session.stop()
                logger.info("✅ Browser session stopped")
        except Exception as e:
            logger.warning(f"Warning during cleanup: {e}")

    return True

async def main():
    """Main entry point"""
    logger.info("🏁 Starting fixed AI smoke test main function...")

    try:
        success = await run_ai_smoke_test()
        if success:
            logger.info("🎉 AI smoke test completed successfully!")
            sys.exit(0)
        else:
            logger.error("💥 AI smoke test failed!")
            sys.exit(1)
    except KeyboardInterrupt:
        logger.info("⏹️ Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"💥 Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
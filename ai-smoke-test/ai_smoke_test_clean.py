#!/usr/bin/env python3
"""
AI Smoke Test for El Dorado Score Keeper
Uses browser-use with Ollama to automate browser testing
"""
import os, asyncio, time, json, logging
from browser_use import Agent
from browser_use.browser.session import BrowserSession
from browser_use.browser.profile import BrowserProfile
from openai import AsyncOpenAI

# Set up detailed logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

APP_URL = os.getenv("APP_URL", "http://localhost:3000")
SUCCESS_TEXT = os.getenv("SUCCESS_TEXT", "Complete")
MODEL = "qwen2.5vl:3b"

logger.info(f"=== AI Smoke Test Starting ===")
logger.info(f"APP_URL: {APP_URL}")
logger.info(f"SUCCESS_TEXT: {SUCCESS_TEXT}")
logger.info(f"MODEL: {MODEL}")

# Create response interceptor that transforms OpenAI responses
class OpenAIResponseInterceptor:
    def __init__(self, original_response):
        self._original = original_response
        # Copy all original attributes
        for attr in dir(original_response):
            if not attr.startswith('_'):
                setattr(self, attr, getattr(original_response, attr))

        # Add completion attribute (browser-use expects this)
        if hasattr(original_response, 'choices') and original_response.choices:
            self.completion = original_response.choices[0].message.content
        else:
            self.completion = ""

        # Transform the choices to include action
        self._transform_choices()

    def _transform_choices(self):
        """Transform choices to include action attribute"""
        if hasattr(self._original, 'choices') and self._original.choices:
            for choice in self._original.choices:
                content = choice.message.content
                if content and isinstance(content, str):
                    try:
                        # Parse JSON from content
                        json_content = content.strip()
                        if json_content.startswith('```json') and json_content.endswith('```'):
                            lines = json_content.split('\n')
                            json_content = '\n'.join(lines[1:-1])
                        elif json_content.startswith('```') and json_content.endswith('```'):
                            lines = json_content.split('\n')
                            json_content = '\n'.join(lines[1:-1])

                        start = json_content.find('{')
                        end = json_content.rfind('}')
                        if start != -1 and end != -1 and end > start:
                            json_str = json_content[start:end+1]
                            parsed = json.loads(json_str)
                            if 'action' in parsed:
                                # Add action attribute to the choice
                                choice.action = parsed
                                logger.info(f"  ✅ Added action to choice: {parsed['action']}")
                                continue  # Success, continue to next choice

                        # If we get here, JSON parsing failed or no action found
                        logger.warning(f"  ⚠️  No valid JSON action found in LLM response")
                        logger.debug(f"  Original content: {content}")

                        # Create a default action based on the situation
                        default_action = {
                            "action": "click",
                            "params": {"text": "Start Single Player"}
                        }
                        choice.action = default_action
                        logger.info(f"  ✅ Added fallback action: {default_action}")

                    except Exception as e:
                        logger.warning(f"  ⚠️  Could not parse action from content: {e}")
                        # Create fallback action
                        fallback_action = {
                            "action": "click",
                            "params": {"text": "Start Single Player"}
                        }
                        choice.action = fallback_action
                        logger.info(f"  ✅ Added fallback action due to parsing error: {fallback_action}")

# Create OpenAI client interceptor that wraps and transforms responses
class OpenAICompatWrapper:
    def __init__(self, client, model):
        logger.info(f"🔧 Initializing OpenAICompatWrapper with model: {model}")
        self.client = client
        self.model = model
        self.model_name = model  # Add model_name for browser_use compatibility
        self.provider = "openai"
        self.call_count = 0
        logger.info("✅ OpenAICompatWrapper initialized successfully")

    async def ainvoke(self, *args, **kwargs):
        """Provide ainvoke method for browser-use compatibility"""
        logger.info("🚀 ainvoke called (via OpenAICompatWrapper)")
        logger.debug(f"  ainvoke args: {args}")
        logger.debug(f"  ainvoke kwargs: {kwargs}")

        # Handle different calling patterns
        if len(args) >= 1:
            # First arg is typically the messages
            messages = args[0]
            # Pass messages as keyword argument to create
            return await self.chat.completions.create(messages=messages, **kwargs)
        else:
            # Fallback - try to extract messages from kwargs
            if 'messages' in kwargs:
                return await self.chat.completions.create(**kwargs)
            else:
                logger.error("  ❌ No messages found in ainvoke call")
                raise ValueError("No messages provided to ainvoke")

    @property
    def chat(self):
        """Return chat interface that intercepts create calls"""
        return ChatInterceptor(self.client, self)

class ChatInterceptor:
    def __init__(self, client, wrapper):
        self._client = client
        self._wrapper = wrapper

    @property
    def completions(self):
        """Return completions interface that intercepts create calls"""
        return CompletionsInterceptor(self._client, self._wrapper)

class CompletionsInterceptor:
    def __init__(self, client, wrapper):
        self._client = client
        self._wrapper = wrapper

    async def create(self, *args, **kwargs):
        """Intercept chat.completions.create calls and transform responses"""
        self._wrapper.call_count += 1
        call_id = self._wrapper.call_count

        logger.info(f"🚀 browser-use chat.completions.create called #{call_id}")
        logger.debug(f"  Args: {args}")
        logger.debug(f"  Kwargs keys: {list(kwargs.keys())}")

        # Log the messages being sent
        if 'messages' in kwargs:
            messages = kwargs['messages']
            logger.info(f"  📬 MESSAGE TO LLM ({len(messages)} messages):")
            for i, msg in enumerate(messages):
                # Handle both dict and message objects
                if hasattr(msg, 'content'):
                    content = msg.content
                    role = getattr(msg, 'role', 'unknown')
                elif isinstance(msg, dict):
                    content = msg.get('content', 'NO CONTENT')
                    role = msg.get('role', 'unknown')
                else:
                    content = str(msg)
                    role = 'unknown'

                logger.info(f"    Message {i+1} ({role}): {content[:200]}{'...' if len(content) > 200 else ''}")

        try:
            # Force JSON responses by modifying the system message
            if 'messages' in kwargs:
                messages = kwargs['messages']
                modified_messages = []

                for msg in messages:
                    if (hasattr(msg, 'role') and msg.role == 'system') or (isinstance(msg, dict) and msg.get('role') == 'system'):
                        # Modify existing system message to include JSON instructions
                        original_content = msg.content if hasattr(msg, 'content') else msg.get('content', '')
                        modified_content = original_content + "\n\nIMPORTANT: You MUST respond with ONLY a single JSON object containing 'action' and 'params' fields. No other text, no explanations.\n\nExample: {\"action\": \"click\", \"params\": {\"text\": \"Start Single Player\"}}\nAvailable actions: goto, click, type, keypress, select, scroll, wait_for, assert_text, screenshot, finish"

                        if hasattr(msg, 'content'):
                            msg.content = modified_content
                        else:
                            msg['content'] = modified_content

                        modified_messages.append(msg)
                        logger.info("  📝 Modified system message to include JSON enforcement")
                    else:
                        modified_messages.append(msg)

                kwargs['messages'] = modified_messages

            # Ensure model is included in kwargs
            if 'model' not in kwargs:
                kwargs['model'] = self._wrapper.model
                logger.debug(f"  Added model to kwargs: {self._wrapper.model}")

            # Call the actual OpenAI client
            response = await self._client.chat.completions.create(*args, **kwargs)

            logger.info(f"  ✅ Received response from Ollama")
            logger.debug(f"  Response type: {type(response).__name__}")
            logger.debug(f"  Choices count: {len(response.choices)}")

            if response.choices:
                content = response.choices[0].message.content
                logger.info(f"  📝 Content length: {len(content)} chars")
                logger.info("  📬 RESPONSE FROM LLM:")
                logger.info(f"    {content[:500]}{'...' if len(content) > 500 else ''}")

            # Transform the response to include action attributes
            transformed_response = OpenAIResponseInterceptor(response)

            # Debug: Check if action attributes were added
            if hasattr(transformed_response, 'choices') and transformed_response.choices:
                for i, choice in enumerate(transformed_response.choices):
                    logger.info(f"  🔍 Choice {i} type: {type(choice)}")
                    logger.info(f"  🔍 Choice {i} has action attribute: {hasattr(choice, 'action')}")
                    logger.info(f"  🔍 Choice {i} dir contains 'action': {'action' in dir(choice)}")

                    if hasattr(choice, 'action'):
                        logger.info(f"  ✅ Choice {i} action: {choice.action}")
                        logger.info(f"  ✅ Choice {i} action type: {type(choice.action)}")
                    else:
                        logger.warning(f"  ⚠️  Choice {i} missing action attribute!")
                        logger.warning(f"  ⚠️  Choice {i} attributes: {[attr for attr in dir(choice) if not attr.startswith('_')]}")
                        logger.warning(f"  ⚠️  Choice {i} message.content: {choice.message.content}")

            # Test direct access to simulate what browser-use does
            if hasattr(transformed_response, 'choices') and transformed_response.choices:
                try:
                    test_action = transformed_response.choices[0].action
                    logger.info(f"  ✅ Direct action access test passed: {test_action}")
                except Exception as e:
                    logger.error(f"  ❌ Direct action access test failed: {e}")
                    logger.error(f"  ❌ Browser-use would fail with: {type(e).__name__}")

                    # Test if browser-use might be accessing something else
                    logger.debug(f"  🔍 Trying to access other attributes...")
                    for attr in ['content', 'completion', 'message']:
                        if hasattr(transformed_response.choices[0], attr):
                            try:
                                value = getattr(transformed_response.choices[0], attr)
                                logger.debug(f"  🔍 {attr}: {value}")
                            except:
                                pass

            # Fix usage format to match browser_use expectations
            if hasattr(transformed_response, 'usage') and transformed_response.usage:
                # Convert CompletionUsage to expected format
                usage_dict = {
                    'prompt_tokens': getattr(transformed_response.usage, 'prompt_tokens', 0),
                    'completion_tokens': getattr(transformed_response.usage, 'completion_tokens', 0),
                    'total_tokens': getattr(transformed_response.usage, 'total_tokens', 0),
                    'prompt_cached_tokens': 0,
                    'prompt_cache_creation_tokens': 0,
                    'prompt_image_tokens': 0
                }
                transformed_response.usage = usage_dict
                logger.debug(f"  Fixed usage format: {usage_dict}")

            logger.info(f"🎯 chat.completions.create #{call_id} completed successfully")
            logger.debug(f"  Returning response type: {type(transformed_response)}")
            return transformed_response

        except Exception as e:
            logger.error(f"  ❌ Request failed: {e}")
            logger.error(f"  Error type: {type(e).__name__}")
            raise

    async def ainvoke(self, *args, **kwargs):
        """Provide ainvoke method for browser-use compatibility"""
        logger.info("🚀 ainvoke called (via CompletionsInterceptor)")
        # Convert ainvoke calls to create calls
        if 'messages' in kwargs:
            return await self.create(**kwargs)
        elif len(args) > 0 and isinstance(args[0], list):
            return await self.create(messages=args[0], **kwargs)
        else:
            # Fallback for other call patterns
            return await self.create(*args, **kwargs)

async def test_ollama_connection():
    """Test if Ollama is accessible and the model is available"""
    logger.info("🔗 Testing Ollama connection...")
    try:
        import aiohttp

        async with aiohttp.ClientSession() as session:
            # Test Ollama is running
            async with session.get("http://localhost:11434/api/tags") as response:
                if response.status == 200:
                    models = await response.json()
                    logger.info("✅ Ollama server is running")
                    logger.info(f"Available models: {[m['name'] for m in models.get('models', [])]}")

                    # Check if our model is available
                    model_names = [m['name'] for m in models.get('models', [])]
                    if MODEL in model_names:
                        logger.info(f"✅ Model '{MODEL}' is available")
                    else:
                        logger.error(f"❌ Model '{MODEL}' not found in available models")
                        return False
                else:
                    logger.error(f"❌ Ollama returned status {response.status}")
                    return False

        # Test actual model inference
        logger.info(f"🧪 Testing model inference with '{MODEL}'...")
        test_client = AsyncOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )
        test_response = await test_client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": "Say 'Hello, connection test successful!'"}],
            max_tokens=50
        )

        if test_response.choices and test_response.choices[0].message.content:
            logger.info("✅ Model inference test passed")
            logger.debug(f"Test response: {test_response.choices[0].message.content}")
            return True
        else:
            logger.error("❌ Model inference test failed - no response")
            return False

    except Exception as e:
        logger.error(f"❌ Ollama connection test failed: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        return False

def goal_prompt():
    return f"""
Your goal is to log in to {APP_URL} and confirm that you see "{SUCCESS_TEXT}" on screen.

Steps:
1. Open the site.
2. Click "Start single player".
3. Select a number of players.
4. Click "Create Lineup" button.
5. Bid a number of tricks and click "Confirm".
6. Double-click on a card that does not have data-unplayable="true" to play the card.
7. Click "Next Hand" button.
8. Continue playing by playing cards and confirming tricks until the game ends.
9. Verify the page shows "{SUCCESS_TEXT}".

Rules:
- Stay on {APP_URL} or same domain.
- Use up to 30 actions.
- Take reasonable time to wait after each click.
"""

async def main():
    logger.info("🌐 Starting browser session...")
    try:
        # First test Ollama connection
        if not await test_ollama_connection():
            logger.error("❌ Ollama connection test failed - cannot proceed")
            raise SystemExit(1)

        browser_session = BrowserSession(headless=False, allowed_domains=["localhost", "127.0.0.1"])
        logger.info(f"✅ Browser session created: {type(browser_session).__name__}")

        logger.info("🚀 Starting browser...")
        await browser_session.start()
        logger.info("✅ Browser started successfully")

        logger.info("📋 Creating agent...")

        # Create AsyncOpenAI client
        openai_client = AsyncOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )

        # Wrap with our interceptor
        client = OpenAICompatWrapper(openai_client, MODEL)

        agent = Agent(
            task=goal_prompt(),
            llm=client,
            browser_session=browser_session,
            temperature=0.1,
            max_actions_per_step=30,
        )
        logger.info(f"✅ Agent created: {type(agent).__name__}")
        logger.info(f"Agent task length: {len(goal_prompt())} chars")

        logger.info("🎯 Running agent...")
        logger.info("This will take a while - the AI will navigate and play the game...")

        result = await agent.run()
        logger.info("✅ Agent run completed")
        logger.info(f"Result type: {type(result).__name__}")
        logger.debug(f"Result preview: {str(result)[:300]}...")

        logger.info("📸 Taking final screenshot and checking content...")
        page = await browser_session.get_current_page()
        logger.info(f"Current page type: {type(page).__name__}")

        if page is None:
            logger.error("❌ No current page available!")
            raise SystemExit(1)

        content = await page.content()
        logger.info(f"📄 Page content length: {len(content)} chars")
        logger.debug(f"Page content preview: {content[:200]}...")

        passed = SUCCESS_TEXT.lower() in content.lower()
        logger.info(f"🔍 Success check: Looking for '{SUCCESS_TEXT}' in page content")
        logger.info(f"🎯 Test result: {'PASS' if passed else 'FAIL'}")

        os.makedirs("artifacts", exist_ok=True)
        ts = int(time.time())
        screenshot_path = f"artifacts/final-{ts}.png"
        await page.screenshot(path=screenshot_path, full_page=True)
        logger.info(f"📸 Screenshot saved: {screenshot_path}")

        print("✅ PASS" if passed else "❌ FAIL")
        if not passed:
            print(f"Result: {result}")
            logger.warning("Test failed - check screenshot and logs")
            raise SystemExit(1)
        else:
            logger.info("🎉 AI smoke test completed successfully!")

    except Exception as e:
        logger.error(f"❌ Test failed with exception: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise
    finally:
        logger.info("🛑 Stopping browser session...")
        try:
            if 'browser_session' in locals():
                await browser_session.stop()
                logger.info("✅ Browser session stopped")
        except Exception as e:
            logger.error(f"❌ Error stopping browser: {e}")

if __name__ == "__main__":
    logger.info("🏁 Starting AI smoke test main function...")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("⏹️  Test interrupted by user")
    except Exception as e:
        logger.error(f"💥 Fatal error: {e}")
        raise
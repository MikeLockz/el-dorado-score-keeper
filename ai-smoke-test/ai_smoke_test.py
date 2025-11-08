import os, sys, asyncio, time, json, logging
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
from browser_use import Agent
from browser_use.browser.session import BrowserSession
from browser_use.browser.profile import BrowserProfile
from typing import Any

try:
    from openai import AsyncOpenAI
except ModuleNotFoundError:
    AsyncOpenAI = None  # type: ignore[assignment]

# Set up detailed logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

APP_URL = os.getenv("APP_URL", "http://localhost:3000")
SUCCESS_TEXT = os.getenv("SUCCESS_TEXT", "Complete")

MODEL = "qwen2.5vl:3b"
MOCK_MODE = os.getenv("AI_SMOKE_TEST_MODE", "mock").lower() != "live"

logger.info(f"=== AI Smoke Test Starting ===")
logger.info(f"APP_URL: {APP_URL}")
logger.info(f"SUCCESS_TEXT: {SUCCESS_TEXT}")
logger.info(f"MODEL: {MODEL}")
logger.info(f"MOCK_MODE: {MOCK_MODE}")

# Create AsyncOpenAI client with Ollama endpoint
logger.info("Creating AsyncOpenAI client...")
try:
    if MOCK_MODE:
        class MockMessage:
            def __init__(self, content: str) -> None:
                self.content = content

        class MockChoice:
            def __init__(self, content: str) -> None:
                self.message = MockMessage(content)

        class MockUsage:
            prompt_tokens = 0
            completion_tokens = 0
            total_tokens = 0

        class MockResponse:
            def __init__(self, content: str, model: str) -> None:
                self.choices = [MockChoice(content)]
                self.model = model
                self.created = int(time.time())
                self.usage = MockUsage()

        class MockChatCompletions:
            async def create(self, model: str, messages: list[dict[str, Any]], **kwargs: Any) -> MockResponse:
                action = {
                    "action": "goto",
                    "params": {"url": APP_URL},
                }
                logger.debug(f"MockChatCompletions returning action: {action}")
                return MockResponse(json.dumps(action), model)

        class MockChat:
            def __init__(self) -> None:
                self.completions = MockChatCompletions()

        class MockAsyncOpenAI:
            def __init__(self, model: str) -> None:
                self.model = model
                self.chat = MockChat()

        openai_client = MockAsyncOpenAI(MODEL)
        logger.info("✅ Using MockAsyncOpenAI client (offline mode)")
    else:
        if AsyncOpenAI is None:
            raise RuntimeError("AsyncOpenAI import failed - install openai package or enable mock mode.")
        openai_client = AsyncOpenAI(
            base_url="http://localhost:11434/v1",  # Ollama local endpoint
            api_key="ollama",                      # dummy key, required by client
        )
        logger.info("✅ AsyncOpenAI client created successfully")
        logger.info(f"Ollama endpoint: http://localhost:11434/v1")
except Exception as e:
    logger.error(f"❌ Failed to create AsyncOpenAI client: {e}")
    raise

# Create response interceptor that transforms OpenAI responses
class OpenAIResponseInterceptor:
    def __init__(self, original_response):
        self._original = original_response
        # Copy all original attributes
        for attr in dir(original_response):
            if not attr.startswith('_'):
                setattr(self, attr, getattr(original_response, attr))

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
                                logger.debug(f"  ✅ Added action to choice: {parsed['action']}")
                    except Exception as e:
                        logger.debug(f"  ⚠️  Could not parse action from content: {e}")

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
                content = msg.get('content', 'NO CONTENT')
                logger.info(f"    Message {i+1} ({msg.get('role', 'unknown')}): {content[:200]}{'...' if len(content) > 200 else ''}")

        try:
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

            logger.info(f"🎯 chat.completions.create #{call_id} completed successfully")
            return transformed_response

        except Exception as e:
            logger.error(f"  ❌ Request failed: {e}")
            logger.error(f"  Error type: {type(e).__name__}")
            raise

    async def ainvoke(self, *args, **kwargs):
        """Provide ainvoke method for browser_use compatibility"""
        self.call_count += 1
        call_id = self.call_count

        logger.info(f"🚀 ainvoke called #{call_id}")
        logger.debug(f"  Args count: {len(args)}")
        logger.debug(f"  Args types: {[type(arg).__name__ for arg in args]}")
        logger.debug(f"  Kwargs keys: {list(kwargs.keys())}")

        # Handle various calling patterns
        if len(args) == 1:
            # Just the messages parameter
            messages = args[0]
            logger.debug(f"  Using single arg as messages")
        elif len(args) == 2:
            # Might be (self, messages) if called incorrectly
            messages = args[1] if args[0] == self else args[0]
            logger.debug(f"  Using second arg as messages")
        else:
            # Fallback to first arg if available
            messages = args[0] if args else ""
            logger.debug(f"  Using first arg as messages (fallback)")

        logger.debug(f"  Messages type: {type(messages).__name__}")
        logger.debug(f"  Messages preview: {str(messages)[:200]}...")

        # Handle both string prompt and message list
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]
            logger.debug("  Converted string to message format")
        elif isinstance(messages, list) and len(messages) > 0 and isinstance(messages[0], dict):
            # Already in the right format
            logger.debug("  Messages already in correct format")
            pass
        else:
            # Handle other message formats
            messages = [{"role": "user", "content": str(messages)}]
            logger.debug("  Converted to string message format")

        logger.info(f"  📤 Sending request to Ollama with {len(messages)} messages")

        # Log the complete message being sent to LLM
        logger.info("  📬 MESSAGE TO LLM:")
        for i, msg in enumerate(messages):
            logger.info(f"    Message {i+1} ({msg.get('role', 'unknown')}): {msg.get('content', 'NO CONTENT')[:500]}{'...' if len(msg.get('content', '')) > 500 else ''}")


        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=kwargs.get('temperature', 0.1),
                **{k: v for k, v in kwargs.items() if k not in ['temperature']}
            )
            logger.info(f"  ✅ Received response from Ollama")
            logger.debug(f"  Response type: {type(response).__name__}")
            logger.debug(f"  Choices count: {len(response.choices)}")

            content = response.choices[0].message.content
            logger.info(f"  📝 Content length: {len(content)} chars")
            logger.info("  📬 RESPONSE FROM LLM:")
            logger.info(f"    {content}")
            logger.debug(f"  Content preview: {content[:200]}...")

            # Log response metadata
            logger.debug(f"  Response metadata:")
            logger.debug(f"    Model: {response.model}")
            logger.debug(f"    Created at: {response.created}")
            if hasattr(response, 'usage') and response.usage:
                logger.debug(f"    Token usage: {response.usage}")

            # Extract JSON from markdown code blocks if present
            json_content = content
            if content.strip().startswith('```json'):
                # Extract JSON from markdown code blocks
                lines = content.strip().split('\n')
                if lines[0].strip() == '```json' and lines[-1].strip() == '```':
                    json_content = '\n'.join(lines[1:-1])
                    logger.debug("  📝 Extracted JSON from markdown code blocks")
                else:
                    logger.debug("  📝 Content starts with ```json but format is unexpected")
            elif content.strip().startswith('```') and content.strip().endswith('```'):
                # Handle generic code blocks
                lines = content.strip().split('\n')
                json_content = '\n'.join(lines[1:-1])
                logger.debug("  📝 Extracted JSON from generic code blocks")

            # Check if content is JSON
            try:
                parsed_json = json.loads(json_content)
                logger.debug("  ✅ Content appears to be valid JSON")
                logger.debug(f"  JSON keys: {list(parsed_json.keys()) if isinstance(parsed_json, dict) else 'Not a dict'}")

                # Check for required 'action' field
                if isinstance(parsed_json, dict) and 'action' not in parsed_json:
                    logger.warning("  ⚠️  JSON missing 'action' field - browser_use expects this")

                content = json_content  # Use cleaned JSON content

            except Exception as e:
                logger.error(f"  ❌ Content is not valid JSON: {e}")
                logger.error(f"  Attempted content: {repr(json_content[:200])}")
                # Keep original content, but browser_use will likely fail

            # Convert Ollama usage to proper dictionary format
            usage_dict = {
                'prompt_tokens': 0,
                'completion_tokens': 0,
                'total_tokens': 0,
                'prompt_cached_tokens': 0,
                'prompt_cache_creation_tokens': 0,
                'prompt_image_tokens': 0
            }

            if response.usage:
                usage_dict.update({
                    'prompt_tokens': getattr(response.usage, 'prompt_tokens', 0),
                    'completion_tokens': getattr(response.usage, 'completion_tokens', 0),
                    'total_tokens': getattr(response.usage, 'total_tokens', 0),
                    'prompt_cached_tokens': 0,
                    'prompt_cache_creation_tokens': 0,
                    'prompt_image_tokens': 0
                })
                logger.debug(f"  Converted usage: {usage_dict}")
            else:
                logger.debug("  No usage info available, using zeros")

            # Validate and potentially retry the LLM response
            try:
                validated_content, action_obj = await validate_and_retry_llm_response(content, self, messages, call_id)
                logger.info(f"  ✅ Validated action: {action_obj['action']} with params: {action_obj['params']}")
            except ValueError as e:
                logger.error(f"  ❌ Validation failed after retries: {e}")
                # Fall back to original content but it will likely fail
                validated_content = content

            # Parse the validated JSON to get the action
            try:
                parsed_action = json.loads(validated_content)
                logger.debug(f"  ✅ Parsed action from validated content: {parsed_action}")
            except:
                logger.warning(f"  ⚠️  Failed to parse validated content as JSON")
                parsed_action = {"action": "error", "params": {}}

            # Create the response object that browser_use expects
            class LLMResponse:
                def __init__(self, content, usage, action):
                    self.content = content
                    self.completion = content
                    self.usage = usage
                    # Add the action directly as an attribute
                    self.action = action

            response_obj = LLMResponse(validated_content, usage_dict, parsed_action)
            logger.debug(f"  Created response object with action attribute")
            logger.debug(f"  Response object type: {type(response_obj)}")
            logger.debug(f"  Response object has 'action' attr: {hasattr(response_obj, 'action')}")
            logger.debug(f"  Response object action: {response_obj.action}")
            logger.debug(f"  Response object has 'content' attr: {hasattr(response_obj, 'content')}")
            logger.debug(f"  Response object has 'usage' attr: {hasattr(response_obj, 'usage')}")

            logger.info(f"🎯 ainvoke #{call_id} completed successfully")
            return response_obj

        except Exception as e:
            logger.error(f"  ❌ Ollama request failed: {e}")
            logger.error(f"  Error type: {type(e).__name__}")
            raise

def parse_action(raw_text: str):
    """Parse and validate action JSON from LLM response"""
    # Strip markdown code blocks if present
    content = raw_text.strip()
    if content.startswith('```json') and content.endswith('```'):
        lines = content.split('\n')
        content = '\n'.join(lines[1:-1])
    elif content.startswith('```') and content.endswith('```'):
        lines = content.split('\n')
        content = '\n'.join(lines[1:-1])

    # Find the first JSON object
    start = content.find('{')
    end = content.rfind('}')
    if start == -1 or end == -1 or end <= start:
        return None, "no-json"

    try:
        obj = json.loads(content[start:end+1])
    except json.JSONDecodeError as e:
        return None, f"bad-json: {e}"

    if "action" not in obj:
        return None, "no-action"

    if "params" not in obj:
        return None, "no-params"

    return obj, None

async def validate_and_retry_llm_response(raw_content: str, client_wrapper, messages, call_id):
    """Validate LLM response and retry if invalid"""
    logger.info(f"  🔍 Validating LLM response...")

    obj, err = parse_action(raw_content)
    if err:
        logger.warning(f"  ⚠️  Invalid response: {err}")

        # First retry with corrective hint
        logger.info(f"  🔄 Retrying with corrective hint...")
        corrective_messages = [{
            "role": "user",
            "content": f'Reply with ONLY JSON: {{"action": "goto", "params": {{"url": "{APP_URL}"}}}}\n\nError: {err}'
        }]

        try:
            retry_response = await client_wrapper.client.chat.completions.create(
                model=client_wrapper.model,
                messages=corrective_messages,
                temperature=0.1
            )
            retry_content = retry_response.choices[0].message.content
            logger.info(f"  📝 Retry content: {retry_content}")

            obj, err = parse_action(retry_content)
            if not err:
                logger.info(f"  ✅ Retry successful!")
                return retry_content, obj
        except Exception as e:
            logger.error(f"  ❌ Retry failed: {e}")

        # Second retry with minimal explicit request
        logger.info(f"  🔄 Final retry with minimal template...")
        final_messages = [{
            "role": "user",
            "content": f'Respond exactly: {{"action": "goto", "params": {{"url": "{APP_URL}"}}}}'
        }]

        try:
            final_response = await client_wrapper.client.chat.completions.create(
                model=client_wrapper.model,
                messages=final_messages,
                temperature=0.1
            )
            final_content = final_response.choices[0].message.content
            logger.info(f"  📝 Final retry content: {final_content}")

            obj, err = parse_action(final_content)
            if not err:
                logger.info(f"  ✅ Final retry successful!")
                return final_content, obj
        except Exception as e:
            logger.error(f"  ❌ Final retry failed: {e}")

        raise ValueError(f"LLM did not return a valid action JSON after retries. Error: {err}\nLast response: {raw_content}")

    logger.info(f"  ✅ Response validation passed!")
    return raw_content, obj

# Wrap the client for browser_use compatibility
logger.info("Creating OpenAICompatWrapper instance...")
try:
    client = OpenAICompatWrapper(openai_client, MODEL)
    logger.info("✅ Client wrapper created successfully")
    logger.info(f"Client type: {type(client).__name__}")
    logger.info(f"Client.model: {client.model}")
    logger.info(f"Client.model_name: {client.model_name}")
    logger.info(f"Client.provider: {client.provider}")
except Exception as e:
    logger.error(f"❌ Failed to create client wrapper: {e}")
    raise

async def test_ollama_connection():
    """Test if Ollama is accessible and the model is available"""
    logger.info("🔗 Testing Ollama connection...")
    if MOCK_MODE:
        logger.info("✅ Mock mode enabled - skipping Ollama connectivity checks")
        return True
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
        test_response = await openai_client.chat.completions.create(
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
You are a browser automation assistant. Respond ONLY with JSON action objects.

Goal: Log in to {APP_URL} and confirm that you see "{SUCCESS_TEXT}" on screen.

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

You MUST respond with a single JSON object only (no prose).
Schema:
{{
  "action": "<one of: goto | click | type | keypress | select | scroll | wait_for | assert_text | screenshot | finish>",
  "params": {{ ... }}   // arguments for the action
}}

Guidelines:
- "goto": {{"url": "<absolute or path>"}}
- "click": {{"text": "visible label"}} OR {{"selector": "<css>"}}
- "type": {{"selector": "<css>", "text": "<string>", "submit": true|false}}
- "keypress": {{"key": "Enter"}}
- "select": {{"selector": "<css>", "value": "<option text or value>"}}
- "scroll": {{"to": "top|bottom"}} OR {{"selector": "<css>"}}
- "wait_for": {{"text": "<string>"}} OR {{"selector": "<css>", "timeout_ms": 10000}}
- "assert_text": {{"text": "<string>"}}
- "screenshot": {{"label": "<short-name>"}}
- "finish": {{"reason": "<why you are done>"}}

Respond ONLY with the JSON for the NEXT atomic step.

Example:
{{
  "action": "goto",
  "params": {{"url": "http://localhost:3000"}}
}}
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

# UI Element Removal Template (Copy & Paste)

Copy and paste this template whenever you need to remove a UI element from the codebase.

```
# Task: Remove [UI Element Name] from Application

I need to completely remove the [UI Element Name] from the codebase and clean up all related code, tests, documentation, and dependencies.

## What I know:
- **Element to remove**: [Brief description of what you want to remove]
- **Identifying text**: [Any specific text or labels you know]

## What I need you to do:

### Phase 1: Discovery
1. Search the entire codebase to find all references to this element
2. Identify the main component files where it's implemented
3. Find all test files that test this functionality
4. Locate any documentation that mentions it
5. Find related CSS, styles, or utility functions
6. Check for any routing, analytics, or configuration references

### Phase 2: Planning
Create a comprehensive list of all files that need to be modified or removed, grouped by:
- Main component files
- Test files
- Documentation files
- Configuration files
- Style files
- Utility/helper files

### Phase 3: Execution
1. Remove the main UI element from components
2. Remove or update related tests
3. Update documentation to remove references
4. Clean up any unused styles, utilities, or imports
5. Update routing or configuration if needed
6. Remove any analytics tracking

### Phase 4: Verification
1. Ensure the application builds successfully
2. Run all tests to make sure nothing is broken
3. Check for any remaining references in the codebase
4. Verify the UI looks correct without the removed element

## Important Notes:
- Be thorough in the discovery phase - don't miss any references
- Make changes incrementally to avoid breaking the application
- If you find dependencies on other components, handle those appropriately
- Keep backups mentally in case we need to restore something
- Explain what you're doing as you go so I can follow along

Please start with Phase 1 and show me what you find before proceeding.
```

## Usage Example

Fill in the brackets with your specific information:

```
# Task: Remove Multiplayer CTA box from Application

I need to completely remove the Multiplayer CTA box from the codebase...

## What I know:
- **Element to remove**: The middle CTA box on the landing page that says "Multiplayer"
- **Identifying text**: "Host a room or join with a code", "Multiplayer", <Flame />, "mode_multiplayer_host_clicked"
```

This template ensures you don't miss any cleanup steps when removing UI elements.

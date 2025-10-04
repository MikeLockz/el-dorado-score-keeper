import { createNoopBrowserAdapter } from '@/lib/observability/vendors/noop-adapter';

// Placeholder adapter for downstream overrides. Consumers can shadow this module to
// provide their own telemetry vendor without modifying core code.
const CustomPlaceholderAdapter = createNoopBrowserAdapter();

export default CustomPlaceholderAdapter;

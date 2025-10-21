/**
 * Event System Integration for Production Testing
 *
 * This module provides utilities for testing production event systems like
 * BroadcastChannel, storage events, and custom event patterns, ensuring events
 * work correctly in tests while maintaining proper cleanup and isolation.
 */

import { vi } from 'vitest';
import * as React from 'react';
import { setupAsyncEventManagement } from './async-management';
import { captureDevelopmentGlobals, cleanupDevelopmentGlobals } from './component-lifecycle';

/**
 * Event tracking interface
 */
export interface EventTracker {
  eventType: string;
  target: string;
  listenerCount: number;
  eventsFired: number;
  lastEventData: any;
}

/**
 * BroadcastChannel mock with tracking
 */
export class MockBroadcastChannel {
  name: string;
  listeners: Set<(event: MessageEvent) => void>;
  eventsFired: MessageEvent[];
  closed: boolean;

  constructor(name: string) {
    this.name = name;
    this.listeners = new Set();
    this.eventsFired = [];
    this.closed = false;
  }

  addEventListener(type: string, listener: EventListener) {
    if (type === 'message') {
      this.listeners.add(listener as (event: MessageEvent) => void);
    }
  }

  removeEventListener(type: string, listener: EventListener) {
    if (type === 'message') {
      this.listeners.delete(listener as (event: MessageEvent) => void);
    }
  }

  postMessage(data: any) {
    if (this.closed) {
      throw new Error('BroadcastChannel is closed');
    }

    const event = new MessageEvent('message', { data });
    this.eventsFired.push(event);

    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('BroadcastChannel listener error:', error);
      }
    });
  }

  close() {
    this.closed = true;
    this.listeners.clear();
  }
}

/**
 * Storage event mock with tracking
 */
export class MockStorageEventTarget extends EventTarget {
  storageArea: Storage;
  events: StorageEvent[];

  constructor(storageArea: Storage) {
    super();
    this.storageArea = storageArea;
    this.events = [];
  }

  dispatchStorageEvent(
    key: string,
    oldValue: string | null,
    newValue: string | null,
    url?: string,
  ) {
    const event = new StorageEvent('storage', {
      key,
      oldValue,
      newValue,
      url: url || window?.location.href,
      storageArea: this.storageArea,
    });

    this.events.push(event);
    this.dispatchEvent(event);
  }

  getEvents(): StorageEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }
}

/**
 * Event system testing environment
 */
export interface EventSystemTestEnvironment {
  broadcastChannels: Map<string, MockBroadcastChannel>;
  storageTargets: Map<string, MockStorageEventTarget>;
  eventTrackers: Map<string, EventTracker>;
  capturedEvents: any[];

  // Setup methods
  setupBroadcastChannel: (name: string) => MockBroadcastChannel;
  setupStorageEvents: (storageArea: Storage) => MockStorageEventTarget;
  trackEvents: (eventType: string, target: string) => void;

  // Testing methods
  simulateBroadcast: (channelName: string, data: any) => void;
  simulateStorageEvent: (
    key: string,
    oldValue: string | null,
    newValue: string | null,
    storageArea?: Storage,
  ) => void;
  waitForEvent: (eventType: string, timeout?: number) => Promise<any>;

  // Verification methods
  getEventTracker: (eventType: string, target: string) => EventTracker | undefined;
  verifyEventCleanup: () => { success: boolean; remainingListeners: number };
  verifyBroadcastCleanup: () => { success: boolean; openChannels: number };

  // Cleanup
  cleanup: () => void;
}

/**
 * Creates an event system testing environment
 */
export function createEventSystemTestEnvironment(): EventSystemTestEnvironment {
  const broadcastChannels = new Map<string, MockBroadcastChannel>();
  const storageTargets = new Map<string, MockStorageEventTarget>();
  const eventTrackers = new Map<string, EventTracker>();
  const capturedEvents: any[] = [];
  const asyncManager = setupAsyncEventManagement();

  const originalBroadcastChannel = globalThis.BroadcastChannel;
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  const originalDispatchEvent = EventTarget.prototype.dispatchEvent;

  // Override BroadcastChannel
  globalThis.BroadcastChannel = MockBroadcastChannel as any;

  // Override EventTarget methods for tracking
  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) {
    const trackerKey = `${type}_${this.constructor.name}`;
    let tracker = eventTrackers.get(trackerKey);
    if (!tracker) {
      tracker = {
        eventType: type,
        target: this.constructor.name,
        listenerCount: 0,
        eventsFired: 0,
        lastEventData: null,
      };
      eventTrackers.set(trackerKey, tracker);
    }

    tracker.listenerCount++;
    return originalAddEventListener.call(this, type, listener, options);
  };

  EventTarget.prototype.removeEventListener = function (
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions,
  ) {
    const trackerKey = `${type}_${this.constructor.name}`;
    const tracker = eventTrackers.get(trackerKey);
    if (tracker && tracker.listenerCount > 0) {
      tracker.listenerCount--;
    }

    return originalRemoveEventListener.call(this, type, listener, options);
  };

  EventTarget.prototype.dispatchEvent = function (event: Event) {
    const trackerKey = `${event.type}_${this.constructor.name}`;
    let tracker = eventTrackers.get(trackerKey);
    if (!tracker) {
      tracker = {
        eventType: event.type,
        target: this.constructor.name,
        listenerCount: 0,
        eventsFired: 0,
        lastEventData: null,
      };
      eventTrackers.set(trackerKey, tracker);
    }

    tracker.eventsFired++;
    tracker.lastEventData = event;
    capturedEvents.push(event);

    return originalDispatchEvent.call(this, event);
  };

  const setupBroadcastChannel = (name: string): MockBroadcastChannel => {
    const channel = new MockBroadcastChannel(name);
    broadcastChannels.set(name, channel);
    return channel;
  };

  const setupStorageEvents = (storageArea: Storage): MockStorageEventTarget => {
    const target = new MockStorageEventTarget(storageArea);
    const key = `${storageArea.constructor.name}`;
    storageTargets.set(key, target);
    return target;
  };

  const trackEvents = (eventType: string, target: string): void => {
    const trackerKey = `${eventType}_${target}`;
    if (!eventTrackers.has(trackerKey)) {
      eventTrackers.set(trackerKey, {
        eventType,
        target,
        listenerCount: 0,
        eventsFired: 0,
        lastEventData: null,
      });
    }
  };

  const simulateBroadcast = (channelName: string, data: any): void => {
    const channel = broadcastChannels.get(channelName);
    if (channel) {
      channel.postMessage(data);
    } else {
      console.warn(`BroadcastChannel "${channelName}" not found`);
    }
  };

  const simulateStorageEvent = (
    key: string,
    oldValue: string | null,
    newValue: string | null,
    storageArea?: Storage,
  ): void => {
    const target = storageArea
      ? Array.from(storageTargets.values()).find((t) => t.storageArea === storageArea)
      : Array.from(storageTargets.values())[0];

    if (target) {
      target.dispatchStorageEvent(key, oldValue, newValue);
    } else {
      console.warn('No storage event target available');
    }
  };

  const waitForEvent = (eventType: string, timeout = 5000): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Event ${eventType} not received within ${timeout}ms`));
      }, timeout);

      const checkEvent = () => {
        const event = capturedEvents.find((e) => e.type === eventType);
        if (event) {
          clearTimeout(timeoutId);
          resolve(event);
        } else {
          setTimeout(checkEvent, 10);
        }
      };

      checkEvent();
    });
  };

  const getEventTracker = (eventType: string, target: string): EventTracker | undefined => {
    return eventTrackers.get(`${eventType}_${target}`);
  };

  const verifyEventCleanup = (): { success: boolean; remainingListeners: number } => {
    let totalListeners = 0;
    let success = true;

    eventTrackers.forEach((tracker) => {
      totalListeners += tracker.listenerCount;
      if (tracker.listenerCount > 0) {
        success = false;
        console.warn(`Event listeners not cleaned up: ${tracker.eventType} on ${tracker.target}`);
      }
    });

    return { success, remainingListeners: totalListeners };
  };

  const verifyBroadcastCleanup = (): { success: boolean; openChannels: number } => {
    let openChannels = 0;
    let success = true;

    broadcastChannels.forEach((channel) => {
      if (!channel.closed) {
        openChannels++;
        success = false;
        console.warn(`BroadcastChannel "${channel.name}" not closed`);
      }
    });

    return { success, openChannels };
  };

  const cleanup = (): void => {
    // Close all broadcast channels
    broadcastChannels.forEach((channel) => channel.close());
    broadcastChannels.clear();

    // Clear storage targets
    storageTargets.clear();

    // Clear event trackers
    eventTrackers.clear();
    capturedEvents.length = 0;

    // Restore original functions
    globalThis.BroadcastChannel = originalBroadcastChannel;
    EventTarget.prototype.addEventListener = originalAddEventListener;
    EventTarget.prototype.removeEventListener = originalRemoveEventListener;
    EventTarget.prototype.dispatchEvent = originalDispatchEvent;

    // Clean up async manager
    asyncManager.cleanup();
  };

  return {
    broadcastChannels,
    storageTargets,
    eventTrackers,
    capturedEvents,
    setupBroadcastChannel,
    setupStorageEvents,
    trackEvents,
    simulateBroadcast,
    simulateStorageEvent,
    waitForEvent,
    getEventTracker,
    verifyEventCleanup,
    verifyBroadcastCleanup,
    cleanup,
  };
}

/**
 * Test helper for BroadcastChannel functionality
 */
export function testBroadcastChannel(
  channelName: string,
  testFn: (
    channel: MockBroadcastChannel,
    helpers: {
      simulateBroadcast: (data: any) => void;
      waitForMessage: (timeout?: number) => Promise<MessageEvent>;
      verifyNoLeaks: () => boolean;
    },
  ) => void | Promise<void>,
) {
  const environment = createEventSystemTestEnvironment();

  try {
    const channel = environment.setupBroadcastChannel(channelName);

    const helpers = {
      simulateBroadcast: (data: any) => environment.simulateBroadcast(channelName, data),
      waitForMessage: (timeout = 5000) =>
        environment.waitForEvent('message', timeout) as Promise<MessageEvent>,
      verifyNoLeaks: () => {
        const eventCleanup = environment.verifyEventCleanup();
        const broadcastCleanup = environment.verifyBroadcastCleanup();
        return eventCleanup.success && broadcastCleanup.success;
      },
    };

    return testFn(channel, helpers);
  } finally {
    environment.cleanup();
  }
}

/**
 * Test helper for storage events
 */
export function testStorageEvents(
  storageArea: Storage,
  testFn: (
    storageTarget: MockStorageEventTarget,
    helpers: {
      simulateStorageEvent: (key: string, oldValue: string | null, newValue: string | null) => void;
      waitForStorageEvent: (timeout?: number) => Promise<StorageEvent>;
      getCapturedEvents: () => StorageEvent[];
      verifyNoLeaks: () => boolean;
    },
  ) => void | Promise<void>,
) {
  const environment = createEventSystemTestEnvironment();

  try {
    const storageTarget = environment.setupStorageEvents(storageArea);

    const helpers = {
      simulateStorageEvent: (key: string, oldValue: string | null, newValue: string | null) => {
        environment.simulateStorageEvent(key, oldValue, newValue, storageArea);
      },
      waitForStorageEvent: (timeout = 5000) =>
        environment.waitForEvent('storage', timeout) as Promise<StorageEvent>,
      getCapturedEvents: () => storageTarget.getEvents(),
      verifyNoLeaks: () => {
        const eventCleanup = environment.verifyEventCleanup();
        return eventCleanup.success;
      },
    };

    return testFn(storageTarget, helpers);
  } finally {
    environment.cleanup();
  }
}

/**
 * Test helper for custom event systems
 */
export function testCustomEventSystem<T extends EventTarget>(
  target: T,
  testFn: (
    enhancedTarget: T,
    helpers: {
      trackEvent: (eventType: string) => void;
      waitForEvent: (eventType: string, timeout?: number) => Promise<Event>;
      getEventTracker: (eventType: string) => EventTracker | undefined;
      verifyEventCleanup: () => boolean;
    },
  ) => void | Promise<void>,
) {
  const environment = createEventSystemTestEnvironment();

  try {
    const helpers = {
      trackEvent: (eventType: string) =>
        environment.trackEvents(eventType, target.constructor.name),
      waitForEvent: (eventType: string, timeout = 5000) =>
        environment.waitForEvent(eventType, timeout),
      getEventTracker: (eventType: string) =>
        environment.getEventTracker(eventType, target.constructor.name),
      verifyEventCleanup: () => environment.verifyEventCleanup().success,
    };

    return testFn(target, helpers);
  } finally {
    environment.cleanup();
  }
}

/**
 * React component wrapper for event system testing
 */
interface EventSystemWrapperProps {
  children: React.ReactNode;
  onEvent?: (event: Event) => void;
  trackEvents?: string[];
}

function EventSystemWrapper({ children, onEvent, trackEvents = [] }: EventSystemWrapperProps) {
  React.useEffect(() => {
    // Track specified events
    const environment = createEventSystemTestEnvironment();
    trackEvents.forEach((eventType) => {
      environment.trackEvents(eventType, 'EventSystemWrapper');
    });

    // Set up global event listener
    const handleEvent = (event: Event) => {
      onEvent?.(event);
    };

    window.addEventListener('message', handleEvent);
    window.addEventListener('storage', handleEvent);

    return () => {
      window.removeEventListener('message', handleEvent);
      window.removeEventListener('storage', handleEvent);
      environment.cleanup();
    };
  }, [onEvent, trackEvents]);

  return React.createElement(React.Fragment, null, children);
}

/**
 * Global event system testing environment
 */
export const globalEventSystemEnvironment = createEventSystemTestEnvironment();

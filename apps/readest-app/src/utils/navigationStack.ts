/**
 * Navigation stack for handling Android back button
 * Higher priority handlers are called first
 */

type NavigationHandler = () => boolean;

interface StackEntry {
  handler: NavigationHandler;
  priority: number;
}

class NavigationStack {
  private stack: StackEntry[] = [];

  /**
   * Push a handler onto the navigation stack
   * @param handler Function to handle back navigation, returns true if handled
   * @param priority Higher priority handlers are called first (default: 0)
   * @returns Cleanup function to remove the handler
   */
  push(handler: NavigationHandler, priority = 0): () => void {
    const entry: StackEntry = { handler, priority };
    this.stack.push(entry);
    // Sort by priority (descending)
    this.stack.sort((a, b) => b.priority - a.priority);

    return () => {
      const index = this.stack.indexOf(entry);
      if (index !== -1) {
        this.stack.splice(index, 1);
      }
    };
  }

  /**
   * Handle back navigation
   * @returns true if any handler consumed the back action
   */
  handleBack(): boolean {
    // Try handlers from highest to lowest priority
    for (const entry of this.stack) {
      if (entry.handler()) {
        return true; // Handler consumed the back action
      }
    }
    return false; // No handler consumed the back action
  }

  /**
   * Clear all handlers (for testing)
   */
  clear(): void {
    this.stack = [];
  }

  /**
   * Get current stack size (for debugging)
   */
  get size(): number {
    return this.stack.length;
  }
}

export const navigationStack = new NavigationStack();

/**
 * UI PRIMITIVES — Single source of truth for design system
 *
 * All screens consume these components. No inline styling in feature screens.
 * Propagation rule: Extract once, replace everywhere.
 */

// Button styles
export { BTN, type ButtonVariant } from './Button';

// Toast notifications
export { Toast, InlineToast, type ToastProps, type ToastVariant } from './Toast';

// Page header layout
export {
  PageHeader,
  ProcessingIndicator,
  HeaderLink,
  type PageHeaderProps,
  type ProcessingIndicatorProps,
  type HeaderLinkProps,
} from './PageHeader';

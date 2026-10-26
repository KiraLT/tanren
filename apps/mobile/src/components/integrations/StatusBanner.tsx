import { View } from "react-native"
import type { IntegrationsFailure } from "../../services/Integrations"
import { Banner } from "../../ui"
import { failureBody, failureTitle } from "../settings/integrationsCopy"

export interface StatusBannerProps {
  readonly tone: "info" | "success" | "danger"
  readonly title: string
  readonly body?: string
  readonly action?: { readonly label: string; readonly onPress: () => void }
  readonly onDismiss?: () => void
}

/**
 * `Banner` inside a polite live region with `role="status"` (design §8). Local wrapper: the
 * primitive itself sets `accessibilityRole="alert"` and `src/ui` is owned by another stream.
 */
export function StatusBanner({ tone, title, body, action, onDismiss }: StatusBannerProps) {
  return (
    <View role="status" accessibilityLiveRegion="polite">
      <Banner
        tone={tone}
        title={title}
        {...(body === undefined ? {} : { body })}
        {...(action === undefined ? {} : { action })}
        {...(onDismiss === undefined ? {} : { onDismiss })}
      />
    </View>
  )
}

/** The single-column failed-load state: reason copy and a Retry control. */
export function LoadFailedBanner({
  reason,
  onRetry,
}: {
  readonly reason: IntegrationsFailure
  readonly onRetry: () => void
}) {
  return (
    <StatusBanner
      tone="danger"
      title={failureTitle(reason)}
      body={failureBody(reason)}
      action={{ label: "Retry", onPress: onRetry }}
    />
  )
}

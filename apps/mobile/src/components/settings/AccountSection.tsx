import { Match } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { type AccountState, type SignOutState, useAccount } from "../../hooks/useAccount"
import { Banner, Button, ListRow, space, Text } from "../../ui"
import { SettingsSection } from "./SettingsSection"
import {
  KEPT_DATA_NOTE,
  SIGNED_OUT_NATIVE_TITLE,
  signOutFailureBody,
  signOutFailureTitle,
} from "./settingsCopy"

interface SignOutProps {
  readonly state: SignOutState
  readonly onPress: () => void
}

/** Sign-out button plus the one status line a sign-out can leave (failure, or native "done"). */
function SignOut({ state, onPress }: SignOutProps) {
  const signingOut = state._tag === "SigningOut"
  return (
    <View style={{ gap: space.md, padding: space.lg }}>
      <Button
        label={signingOut ? "Signing out…" : "Sign out"}
        accessibilityLabel="Sign out"
        variant="destructive"
        loading={signingOut}
        disabled={signingOut}
        onPress={onPress}
      />
      {state._tag === "Failed" ? (
        <Banner
          tone="danger"
          title={signOutFailureTitle(state.reason)}
          body={signOutFailureBody(state.reason)}
        />
      ) : null}
      <Text variant="subhead" tone="muted">
        {KEPT_DATA_NOTE}
      </Text>
    </View>
  )
}

interface AccountRowsProps {
  readonly account: AccountState
  readonly signOut: SignOutState
  readonly requestSignOut: () => void
  readonly signIn: () => void
}

const renderRows = ({ account, signOut, requestSignOut, signIn }: AccountRowsProps) =>
  Match.value(account).pipe(
    Match.tagsExhaustive({
      Loading: () => <ListRow title="Account" subtitle="Checking…" />,
      SignedOut: () => (
        <>
          <ListRow
            title="Not signed in"
            subtitle="Sign in to sync this data across devices"
            onPress={signIn}
          />
          {signOut._tag === "Done" ? (
            <View style={{ padding: space.lg }}>
              <Banner tone="success" title={SIGNED_OUT_NATIVE_TITLE} body={KEPT_DATA_NOTE} />
            </View>
          ) : null}
        </>
      ),
      SignedIn: ({ email }) => (
        <>
          <ListRow title="Signed in" subtitle={email} />
          <SignOut state={signOut} onPress={requestSignOut} />
        </>
      ),
      SignedInOffline: () => (
        <>
          <ListRow title="Signed in (offline)" subtitle="Your email shows when you are online" />
          <SignOut state={signOut} onPress={requestSignOut} />
        </>
      ),
    }),
  )

/** Settings > Account: email and Sign out when signed in, a sign-in entry otherwise. */
export function AccountSection() {
  const router = useRouter()
  const { account, signOut, requestSignOut } = useAccount()
  return (
    <SettingsSection title="Account">
      {renderRows({
        account,
        signOut,
        requestSignOut,
        signIn: () => router.navigate("/sign-in"),
      })}
    </SettingsSection>
  )
}

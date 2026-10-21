import { Match } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { type AccountState, type SignOutState, useAccount } from "../../hooks/useAccount"
import { Banner, ListRow, space } from "../../ui"
import { Chevron, DestructiveRow, SettingsSection } from "./SettingsSection"
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

/** Destructive text row plus the one status line a sign-out can leave (a failure banner). */
function SignOut({ state, onPress }: SignOutProps) {
  const signingOut = state._tag === "SigningOut"
  return (
    <View>
      <DestructiveRow
        title={signingOut ? "Signing out…" : "Sign out"}
        subtitle={KEPT_DATA_NOTE}
        accessibilityLabel="Sign out"
        disabled={signingOut}
        onPress={onPress}
      />
      {state._tag === "Failed" ? (
        <View style={{ padding: space.lg }}>
          <Banner
            tone="danger"
            title={signOutFailureTitle(state.reason)}
            body={signOutFailureBody(state.reason)}
          />
        </View>
      ) : null}
    </View>
  )
}

interface AccountRowsProps {
  readonly account: AccountState
  readonly signOut: SignOutState
  readonly requestSignOut: () => void
  readonly signIn: () => void
}

/** Rows are returned as an array: a fragment would be one `ListGroup` child (no hairlines). */
const renderRows = ({ account, signOut, requestSignOut, signIn }: AccountRowsProps) =>
  Match.value(account).pipe(
    Match.tagsExhaustive({
      Loading: () => [<ListRow key="account" icon="user" title="Account" subtitle="Checking…" />],
      SignedOut: () => [
        <ListRow
          key="signin"
          icon="user"
          title="Not signed in"
          subtitle="Sign in to sync this data across devices"
          trailing={<Chevron />}
          onPress={signIn}
        />,
        ...(signOut._tag === "Done"
          ? [
              <View key="done" style={{ padding: space.lg }}>
                <Banner tone="success" title={SIGNED_OUT_NATIVE_TITLE} body={KEPT_DATA_NOTE} />
              </View>,
            ]
          : []),
      ],
      SignedIn: ({ email }) => [
        <ListRow key="who" icon="user" title="Signed in" subtitle={email} />,
        <SignOut key="out" state={signOut} onPress={requestSignOut} />,
      ],
      SignedInOffline: () => [
        <ListRow
          key="who"
          icon="user"
          title="Signed in (offline)"
          subtitle="Your email shows when you are online"
        />,
        <SignOut key="out" state={signOut} onPress={requestSignOut} />,
      ],
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

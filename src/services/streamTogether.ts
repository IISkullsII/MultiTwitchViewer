const GQL_URL = 'https://gql.twitch.tv/gql'
const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const USE_LIVE_HASH = '639d5f11bfb8bf3053b424d9ef650d04c4ebb7d94711d644afb08fe9a0fad5d9'
const COLLABORATORS_HASH = 'a5135b26ab7b1dbde395e7b1948442d63b5a6268e7fa59d7541e1d9a2cddb8f3'

export interface TogetherMember {
  login: string
  displayName: string
  logo: string | null
}

export interface TogetherGroup {
  id: string
  members: TogetherMember[]
}

interface CollaboratorNode {
  status: string
  user: { login: string; displayName: string | null; profileImageURL: string | null }
}

async function runPersistedQuery(
  operationName: string,
  variables: Record<string, unknown>,
  sha256Hash: string,
): Promise<any> {
  const response = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Client-Id': WEB_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operationName,
      variables,
      extensions: { persistedQuery: { version: 1, sha256Hash } },
    }),
  })
  if (!response.ok) throw new Error(`GQL request failed: ${response.status}`)
  const json = await response.json()
  return Array.isArray(json) ? json[0]?.data : json?.data
}

export async function fetchTogetherGroup(login: string): Promise<TogetherGroup | null> {
  try {
    const live = await runPersistedQuery('UseLive', { channelLogin: login }, USE_LIVE_HASH)
    const channelId: string | undefined = live?.user?.id
    if (!channelId) return null

    const list = await runPersistedQuery(
      'CollaboratorListQuery',
      { channelID: channelId },
      COLLABORATORS_HASH,
    )
    const collaboration = list?.channel?.collaboration
    const collaborators: CollaboratorNode[] = collaboration?.collaborators ?? []
    const members = collaborators
      .filter((c) => c.status === 'ACTIVE' && c.user?.login)
      .map((c) => ({
        login: c.user.login.toLowerCase(),
        displayName: c.user.displayName ?? c.user.login,
        logo: c.user.profileImageURL ?? null,
      }))
    if (!collaboration?.id || members.length < 2) return null
    return { id: collaboration.id, members }
  } catch {
    return null
  }
}

import { components } from './schema';

// Short names for the generated API types. Nothing here is written by hand: when the contract changes,
// `npm run api:generate` changes these with it.
type Schemas = components['schemas'];

export type Me = Schemas['MeResponse'];
export type Preferences = Schemas['PreferencesResponse'];
export type UpdatePreferencesRequest = Schemas['UpdatePreferencesRequest'];
export type Workspace = Schemas['WorkspaceResponse'];
export type WorkspaceRole = Schemas['WorkspaceRole'];
export type Member = Schemas['MemberResponse'];
export type Invitation = Schemas['InvitationResponse'];
export type InvitationPreview = Schemas['InvitationPreviewResponse'];
export type AcceptedInvitation = Schemas['AcceptedInvitationResponse'];
export type RegisterRequest = Schemas['RegisterRequest'];

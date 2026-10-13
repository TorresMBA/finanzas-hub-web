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
export type Category = Schemas['CategoryResponse'];
export type Subcategory = Schemas['SubcategoryResponse'];
export type CategoryKind = Schemas['CategoryKind'];
export type CategoryColor = Schemas['CategoryColor'];
export type CreateCategoryRequest = Schemas['CreateCategoryRequest'];
export type UpdateCategoryRequest = Schemas['UpdateCategoryRequest'];
export type Tag = Schemas['TagResponse'];
export type SeededCategories = Schemas['SeededCategoriesResponse'];
export type Account = Schemas['AccountResponse'];
export type AccountType = Schemas['AccountType'];
export type OpenAccountRequest = Schemas['OpenAccountRequest'];
export type Transaction = Schemas['TransactionResponse'];
export type TransactionPage = Schemas['TransactionPageResponse'];
export type TransactionType = NonNullable<Schemas['TransactionType']>;
export type OperationKind = Schemas['OperationKind'];
export type OperationStatus = Schemas['OperationStatus'];
export type CurrencyTotals = Schemas['CurrencyTotalsResponse'];

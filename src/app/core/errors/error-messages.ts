import { ApiError } from './api-error';

/**
 * What to tell a person for each error code of the API. The API's own messages are written for developers
 * and in English; the code is the stable part, so the wording lives here.
 */
const MESSAGES: Readonly<Record<string, string>> = {
  'network.unreachable': 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.',
  'request.rate_limited': 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.',
  'request.cross_site': 'La solicitud no vino de esta aplicación.',
  'validation.failed': 'Revisa los campos marcados.',
  'auth.unauthenticated': 'Tu sesión terminó. Vuelve a iniciar sesión.',
  'auth.invalid_credentials': 'El correo o la contraseña no son correctos.',
  'auth.locked_out': 'Demasiados intentos fallidos. Espera unos minutos o restablece tu contraseña.',
  'identity.email_taken': 'Ya existe una cuenta con este correo.',
  'identity.email_invalid': 'El correo no es válido.',
  'identity.display_name_invalid': 'Escribe tu nombre (máximo 80 caracteres).',
  'identity.phone_invalid': 'El celular solo puede tener dígitos, espacios, «+» y «-».',
  'identity.invalid': 'La contraseña no cumple los requisitos: 12 caracteres con una minúscula, un número y un símbolo.',
  'identity.password_incorrect': 'La contraseña actual no es correcta.',
  'identity.token_invalid': 'El enlace no es válido o ya caducó. Pide uno nuevo.',
  'workspace.not_found': 'No encontramos ese espacio, o ya no perteneces a él.',
  'workspace.insufficient_role': 'Tu rol en este espacio no permite hacer eso.',
  'workspaces.insufficient_role': 'Tu rol en este espacio no permite hacer eso.',
  'workspaces.name_invalid': 'Escribe un nombre para el espacio (máximo 80 caracteres).',
  'workspaces.time_zone_invalid': 'La zona horaria no es válida.',
  'workspaces.onboarding_already_completed': 'Este espacio ya estaba configurado.',
  'currency.unsupported': 'Esa moneda no está disponible.',
  'workspaces.already_member': 'Esa persona ya es miembro de este espacio.',
  'workspaces.member_not_found': 'Esa persona ya no es miembro de este espacio.',
  'workspaces.cannot_change_own_role': 'No puedes cambiar tu propio rol.',
  'workspaces.owner_by_transfer_only': 'El rol de propietario solo cambia transfiriendo la propiedad.',
  'workspaces.owner_cannot_leave': 'El propietario no puede salir. Transfiere antes la propiedad.',
  'workspaces.invitation.already_pending': 'Ese correo ya tiene una invitación pendiente.',
  'workspaces.invitation.email_invalid': 'El correo no es válido.',
  'workspaces.invitation.not_found': 'No encontramos esa invitación.',
  'workspaces.invitation.not_available': 'La invitación caducó, fue revocada o ya se usó.',
  'workspaces.invitation.not_pending': 'Esa invitación ya no está pendiente.',
  'workspaces.invitation.other_recipient': 'Esta invitación se envió a otro correo. Inicia sesión con esa cuenta.',
  'categories.not_found': 'No encontramos esa categoría.',
  'categories.parent_not_found': 'No encontramos la categoría en la que querías crearla.',
  'categories.name_taken': 'Ya tienes una categoría con ese nombre en el mismo lugar.',
  'categories.name_invalid': 'Escribe un nombre (máximo 60 caracteres).',
  'categories.icon_invalid': 'Ese ícono no está disponible.',
  'categories.kind_required': 'Elige si la categoría es de gasto o de ingreso.',
  'categories.max_depth': 'Una subcategoría no puede tener subcategorías.',
  'categories.archived': 'La categoría está archivada. Restáurala para cambiarla.',
  'categories.parent_archived': 'Restaura primero la categoría a la que pertenece.',
  'categories.tags_on_subcategory': 'Las etiquetas se asignan a la categoría, no a la subcategoría.',
  'categories.too_many_tags': 'Una categoría puede sugerir hasta 20 etiquetas.',
  'categories.tag.name_invalid': 'Una etiqueta tiene hasta 40 letras, números o guiones.',
  'categories.tag.not_found': 'No encontramos esa etiqueta.',
  concurrency_conflict: 'Alguien más cambió esto mientras lo editabas. Recarga e inténtalo de nuevo.',
};

const FALLBACK = 'No se pudo completar la operación. Inténtalo de nuevo.';

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? (MESSAGES[error.code] ?? FALLBACK) : FALLBACK;
}
